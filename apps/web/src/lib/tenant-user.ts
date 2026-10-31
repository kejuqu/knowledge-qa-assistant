import { and, eq, sql } from "drizzle-orm";
import { db, tenantMembers, tenants, users } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";
import { isPermissionList } from "@kqa/auth/permissions";
import { getAvatarUrl } from "./avatar-url";

/** 以当前租户成员记录为准，避免会话中的旧角色继续拥有管理权限。 */
export async function getTenantUser() {
  const user = await getSessionUser();
  if (!user) return null;
  const [membership] = await db.select({ role: tenantMembers.role, permissions: tenantMembers.permissions, tenantName: tenants.name,
    name: users.name, email: users.email, hasAvatar: sql<boolean>`${users.avatarData} is not null`, avatarUpdatedAt: users.avatarUpdatedAt,
  })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .innerJoin(users, eq(users.id, tenantMembers.userId))
    .where(and(eq(tenantMembers.tenantId, user.tenantId), eq(tenantMembers.userId, user.sub), eq(tenantMembers.status, "active")))
    .limit(1);
  if (!membership) return null;
  const permissions = membership.permissions === null ? null
    : isPermissionList(membership.permissions) ? membership.permissions : [];
  return { ...user, name: membership.name, email: membership.email, role: membership.role, tenantName: membership.tenantName, permissions,
    avatarUrl: getAvatarUrl(user.sub, membership.hasAvatar, membership.avatarUpdatedAt),
  };
}
