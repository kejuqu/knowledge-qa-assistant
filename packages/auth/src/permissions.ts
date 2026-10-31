export const PERMISSIONS = [
  { key: "documents.upload", label: "上传文档", description: "上传文件、重新解析失败的文档" },
  { key: "documents.delete", label: "删除文档", description: "删除文件及对应向量数据" },
  { key: "settings.manage", label: "模型设置", description: "查看及修改团队模型配置" },
  { key: "roles.manage", label: "设置角色与权限", description: "设置成员角色、分配操作权限" },
  { key: "team.manage", label: "管理团队", description: "审批加入申请、查看团队成员" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export type TenantRole = "admin" | "member";
export type MembershipStatus = "active" | "pending" | "rejected";
export interface Access {
  role: TenantRole;
  permissions: Permission[] | null;
}

export function effectivePermissions(access: Access): Permission[] {
  return access.permissions ?? (access.role === "admin" ? PERMISSIONS.map((item) => item.key) : []);
}

export function hasPermission(access: Access, permission: Permission): boolean {
  return effectivePermissions(access).includes(permission);
}

export function isPermissionList(value: unknown): value is Permission[] {
  return Array.isArray(value) && value.every((key) => PERMISSIONS.some((item) => item.key === key))
    && new Set(value).size === value.length;
}

/** 分配者只能授予自己拥有的权限，防止受限管理员自行提权。 */
export function canGrantAccess(actor: Access, target: Access): boolean {
  return hasPermission(actor, "roles.manage")
    && effectivePermissions(target).every((permission) => hasPermission(actor, permission));
}

export function isTeamAdministrator(access: Access): boolean {
  return access.role === "admin" && hasPermission(access, "team.manage") && hasPermission(access, "roles.manage");
}

/** 与迁移中的名称键规则一致：忽略首尾空格、连续空白及字母大小写。 */
export function normalizeTenantName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
