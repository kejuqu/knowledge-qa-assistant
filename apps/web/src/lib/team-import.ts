import { and, eq, isNull, sql } from "drizzle-orm";
import { db, users, tenants, tenantMembers, tenantApiKeys, notifications } from "@kqa/db";
import { hashPassword } from "@kqa/auth/password";
import { canImport } from "./team-api-key";
import { ImportError, type EmployeeInput } from "./team-import-input";

type Actor = { tenantId: string; userId: string; keyId: string | null };
export async function importEmployees(actor: Actor, employees: EmployeeInput[]) {
  return db.transaction(async (tx) => {
    // 与团队审批和权限变更使用相同租户锁；撤销 Key 也获取此锁。
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, actor.tenantId)).for("update");
    const [manager] = await tx.select().from(tenantMembers).where(and(eq(tenantMembers.tenantId, actor.tenantId), eq(tenantMembers.userId, actor.userId)));
    if (!tenant || !manager || !canImport(manager)) throw new ImportError("团队管理权限已失效", 403);
    if (actor.keyId) {
      const [key] = await tx.select().from(tenantApiKeys).where(and(eq(tenantApiKeys.id, actor.keyId), eq(tenantApiKeys.tenantId, actor.tenantId), isNull(tenantApiKeys.revokedAt)));
      if (!key || key.expiresAt <= new Date()) throw new ImportError("API Key 已失效", 401);
      if (key.lastUsedAt && Date.now() - key.lastUsedAt.getTime() < 1000) throw new ImportError("调用过于频繁，请稍后重试", 429);
      await tx.update(tenantApiKeys).set({ lastUsedAt: new Date() }).where(eq(tenantApiKeys.id, key.id));
    }
    // 不同租户并发导入同一邮箱时也串行检查归属，按排序加锁避免交叉批次死锁。
    for (const email of [...new Set(employees.map((employee) => employee.email))].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
    }
    const results: { row: number; email: string; status: "added" | "skipped" | "error"; message: string }[] = [];
    for (const [index, employee] of employees.entries()) {
      const result = (status: "added" | "skipped" | "error", message: string) => results.push({ row: index + 1, email: employee.email, status, message });
      let [user] = await tx.select().from(users).where(eq(users.email, employee.email)).limit(1);
      if (!user) {
        if (!employee.password) { result("error", "新账号必须填写初始密码"); continue; }
        const [created] = await tx.insert(users).values({ email: employee.email, name: employee.name, passwordHash: await hashPassword(employee.password) })
          .onConflictDoNothing({ target: users.email }).returning();
        user = created ?? (await tx.select().from(users).where(eq(users.email, employee.email)).limit(1))[0];
      }
      if (!user) throw new Error("无法创建员工账号");
      const memberships = await tx.select().from(tenantMembers).where(eq(tenantMembers.userId, user.id));
      if (memberships.some((member) => member.tenantId !== actor.tenantId)) { result("error", "该账号已属于其他团队"); continue; }
      const existing = memberships.find((member) => member.tenantId === actor.tenantId);
      if (existing?.status === "active") { result("skipped", "已是团队成员，未修改账号或权限"); continue; }
      const [membership] = existing
        ? await tx.update(tenantMembers).set({ status: "active", role: "member", permissions: null, reviewedBy: actor.userId, reviewedAt: new Date() }).where(eq(tenantMembers.id, existing.id)).returning()
        : await tx.insert(tenantMembers).values({ tenantId: actor.tenantId, userId: user.id, status: "active", role: "member", reviewedBy: actor.userId, reviewedAt: new Date() }).returning();
      if (!membership) throw new Error("无法添加团队成员");
      await tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.membershipId, membership.id), eq(notifications.type, "join_request")));
      await tx.insert(notifications).values({ tenantId: actor.tenantId, userId: user.id, membershipId: membership.id,
        type: "join_approved", title: "已加入团队", body: { message: `管理员已将你加入 ${tenant.name}。`, tenantName: tenant.name,
          reviewer: { id: actor.userId, name: (await tx.select({ name: users.name }).from(users).where(eq(users.id, actor.userId)))[0]!.name },
          access: { role: "member", permissions: null } },
      });
      result("added", existing ? "已通过申请并加入团队" : "已加入团队");
    }
    return { added: results.filter((row) => row.status === "added").length, skipped: results.filter((row) => row.status === "skipped").length,
      failed: results.filter((row) => row.status === "error").length, results };
  });
}
