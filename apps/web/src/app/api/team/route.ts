import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, users, tenants, tenantMembers, notifications } from "@kqa/db";
import type { NotificationContent } from "@kqa/db/notifications";
import { hasPermission, isPermissionList, canGrantAccess, isTeamAdministrator, type Access } from "@kqa/auth/permissions";
import { getTenantUser } from "@/lib/tenant-user";
import { getAvatarUrl } from "@/lib/avatar-url";

const accessOf = (member: { role: "admin" | "member"; permissions: string[] | null }): Access => ({
  role: member.role, permissions: member.permissions === null ? null : isPermissionList(member.permissions) ? member.permissions : [],
});

export async function GET() {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPermission(user, "team.manage") && !hasPermission(user, "roles.manage")) {
    return NextResponse.json({ error: "没有查看团队成员的权限" }, { status: 403 });
  }
  const members = await db.select({
    id: tenantMembers.id, userId: users.id, name: users.name, email: users.email,
    role: tenantMembers.role, status: tenantMembers.status, permissions: tenantMembers.permissions,
    createdAt: tenantMembers.createdAt, reviewedAt: tenantMembers.reviewedAt,
    hasAvatar: sql<boolean>`${users.avatarData} is not null`, avatarUpdatedAt: users.avatarUpdatedAt,
  }).from(tenantMembers).innerJoin(users, eq(users.id, tenantMembers.userId))
    .where(eq(tenantMembers.tenantId, user.tenantId)).orderBy(desc(tenantMembers.createdAt));
  return NextResponse.json({ tenantName: user.tenantName, userId: user.sub, members: members.map(({ hasAvatar, avatarUpdatedAt, ...member }) => ({
    ...member, avatarUrl: getAvatarUrl(member.userId, hasAvatar, avatarUpdatedAt),
  })) });
}

export async function PATCH(request: Request) {
  const session = await getTenantUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)
    || !["approve", "reject", "update"].includes(body.action)
    || (body.role !== undefined && body.role !== "admin" && body.role !== "member")
    || (body.permissions !== undefined && body.permissions !== null && !isPermissionList(body.permissions))) {
    return NextResponse.json({ error: "无效的审批或权限设置" }, { status: 400 });
  }
  return db.transaction(async (tx) => {
    // 同一团队的审批/授权串行执行，保护最后一位管理员并重新校验操作者权限。
    await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, session.tenantId)).for("update");
    const memberships = await tx.select().from(tenantMembers).where(eq(tenantMembers.tenantId, session.tenantId));
    const actor = memberships.find((member) => member.userId === session.sub && member.status === "active");
    if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const access = accessOf(actor);
    const needed = body.action === "update" ? "roles.manage" : "team.manage";
    if (!hasPermission(access, needed)) return NextResponse.json({ error: "没有执行此操作的权限" }, { status: 403 });
    const target = memberships.find((member) => member.id === body.id);
    if (!target) return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    if ((body.action === "update" && target.status !== "active") || (body.action !== "update" && target.status !== "pending")) {
      return NextResponse.json({ error: "成员状态已变化，请刷新后重试" }, { status: 409 });
    }
    const targetAccess: Access = body.action === "approve"
      ? { role: body.role ?? "member", permissions: body.permissions ?? null }
      : { role: body.role ?? target.role, permissions: body.permissions === undefined ? accessOf(target).permissions : body.permissions };
    const configuring = body.action === "update" || (body.action === "approve" && (body.role !== undefined || body.permissions !== undefined));
    if (configuring && !canGrantAccess(access, targetAccess)) {
      return NextResponse.json({ error: "只能分配自己拥有的权限，且需要“设置角色与权限”权限" }, { status: 403 });
    }
    if (body.action === "update" && isTeamAdministrator(accessOf(target)) && !isTeamAdministrator(targetAccess)
      && !memberships.some((member) => member.id !== target.id && member.status === "active" && isTeamAdministrator(accessOf(member)))) {
      return NextResponse.json({ error: "团队至少保留一位同时拥有团队管理和角色设置权限的管理员" }, { status: 409 });
    }
    const status = body.action === "reject" ? "rejected" : "active";
    await tx.update(tenantMembers).set({
      status, ...(body.action === "reject" ? {} : targetAccess), reviewedBy: session.sub, reviewedAt: new Date(),
    }).where(eq(tenantMembers.id, target.id));
    if (body.action !== "update") await tx.update(notifications).set({ readAt: new Date() }).where(and(
      eq(notifications.membershipId, target.id), eq(notifications.type, "join_request"),
    ));
    const reviewer = { id: session.sub, name: session.name };
    const content: NotificationContent = body.action === "approve" ? {
      type: "join_approved",
      body: { message: `你已加入 ${session.tenantName}，可以开始使用团队知识库。`, tenantName: session.tenantName, reviewer, access: targetAccess },
    } : body.action === "reject" ? {
      type: "join_rejected",
      body: { message: `${session.tenantName} 的管理员未通过你的加入申请，请联系团队管理员。`, tenantName: session.tenantName, reviewer },
    } : {
      type: "access_updated",
      body: { message: "你的角色或操作权限已更新，页面将使用最新权限。", changedBy: reviewer, access: targetAccess },
    };
    await tx.insert(notifications).values({
      tenantId: session.tenantId, userId: target.userId, membershipId: target.id,
      ...content,
      title: body.action === "approve" ? "加入申请已通过" : body.action === "reject" ? "加入申请未通过" : "团队权限已更新",
    });
    return NextResponse.json({ ok: true });
  });
}
