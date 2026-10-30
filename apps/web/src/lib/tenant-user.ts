import { and, eq } from "drizzle-orm";
import { db, tenantMembers } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";

/** 以当前租户成员记录为准，避免会话中的旧角色继续拥有管理权限。 */
export async function getTenantUser() {
  const user = await getSessionUser();
  if (!user) return null;
  const [membership] = await db.select({ role: tenantMembers.role })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, user.tenantId), eq(tenantMembers.userId, user.sub)))
    .limit(1);
  return membership ? { ...user, role: membership.role } : null;
}
