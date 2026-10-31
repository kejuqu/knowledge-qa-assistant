import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { db, tenantApiKeys, tenantMembers } from "@kqa/db";
import { hasPermission, isPermissionList } from "@kqa/auth/permissions";
import { getTenantUser } from "./tenant-user";
import { ImportError } from "./team-import-input";

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");
export function newApiKey() {
  const key = `kqa_emp_${randomBytes(32).toString("hex")}`;
  return { key, keyHash: hashApiKey(key), prefix: key.slice(0, 16) };
}
export function canImport(member: { role: "admin" | "member"; permissions: string[] | null; status: string }) {
  return member.status === "active" && hasPermission({ role: member.role,
    permissions: member.permissions === null ? null : isPermissionList(member.permissions) ? member.permissions : [],
  }, "team.manage");
}
export async function requireTeamManager() {
  const user = await getTenantUser();
  if (!user) throw new ImportError("请先登录", 401);
  if (!hasPermission(user, "team.manage")) throw new ImportError("需要团队管理权限", 403);
  return user;
}
export async function importActor(request: Request) {
  if (request.headers.has("authorization")) {
    const header = request.headers.get("authorization")!;
    if (!/^Bearer kqa_emp_[a-f0-9]{64}$/i.test(header)) throw new ImportError("无效的 API Key", 401);
    const [key] = await db.select().from(tenantApiKeys).where(and(
      eq(tenantApiKeys.keyHash, hashApiKey(header.slice(7))), isNull(tenantApiKeys.revokedAt), gt(tenantApiKeys.expiresAt, new Date()),
    )).limit(1);
    if (!key) throw new ImportError("API Key 无效、已过期或已撤销", 401);
    const [owner] = await db.select().from(tenantMembers).where(and(eq(tenantMembers.tenantId, key.tenantId), eq(tenantMembers.userId, key.createdBy))).limit(1);
    if (!owner || !canImport(owner)) throw new ImportError("API Key 创建者已无团队管理权限", 403);
    return { tenantId: key.tenantId, userId: key.createdBy, keyId: key.id };
  }
  const user = await requireTeamManager();
  return { tenantId: user.tenantId, userId: user.sub, keyId: null };
}
