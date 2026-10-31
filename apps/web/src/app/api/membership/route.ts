import { and, eq } from "drizzle-orm";
import { db, tenantMembers, tenants } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";

/** 只返回自己的申请状态，待审批用户不能通过该接口读取团队资料。 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [membership] = await db.select({ status: tenantMembers.status, role: tenantMembers.role, permissions: tenantMembers.permissions, tenantName: tenants.name })
    .from(tenantMembers).innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(and(eq(tenantMembers.tenantId, user.tenantId), eq(tenantMembers.userId, user.sub))).limit(1);
  if (!membership) return Response.json({ error: "团队成员记录不存在" }, { status: 404 });
  return Response.json(membership);
}
