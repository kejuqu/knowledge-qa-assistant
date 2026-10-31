import { describe, expect, it } from "vitest";
import { PERMISSIONS, effectivePermissions, hasPermission, canGrantAccess, isPermissionList, isTeamAdministrator, normalizeTenantName } from "./permissions";

describe("团队权限", () => {
  it("管理员默认拥有全部权限，普通成员默认只有基础访问", () => {
    expect(effectivePermissions({ role: "admin", permissions: null })).toHaveLength(PERMISSIONS.length);
    expect(effectivePermissions({ role: "member", permissions: null })).toEqual([]);
  });
  it("自定义权限完整覆盖管理员默认值，包括取消全部管理权限", () => {
    expect(hasPermission({ role: "admin", permissions: ["documents.upload"] }, "documents.delete")).toBe(false);
    expect(effectivePermissions({ role: "admin", permissions: [] })).toEqual([]);
  });
  it("普通成员可以被单独授予上传权限", () => {
    expect(hasPermission({ role: "member", permissions: ["documents.upload"] }, "documents.upload")).toBe(true);
  });
  it("受限的角色管理者不能授予自己没有的权限，也不能创建全权限管理员", () => {
    const actor = { role: "member" as const, permissions: ["roles.manage", "documents.upload"] as const };
    const access = { ...actor, permissions: [...actor.permissions] };
    expect(canGrantAccess(access, { role: "member", permissions: ["documents.upload"] })).toBe(true);
    expect(canGrantAccess(access, { role: "member", permissions: ["documents.delete"] })).toBe(false);
    expect(canGrantAccess(access, { role: "admin", permissions: null })).toBe(false);
  });
  it("只有团队管理权限时不能分配角色与权限", () => {
    expect(canGrantAccess({ role: "member", permissions: ["team.manage"] }, { role: "member", permissions: [] })).toBe(false);
  });
  it("只有同时拥有两种管理权限的管理员可作为团队的保底管理员", () => {
    expect(isTeamAdministrator({ role: "admin", permissions: null })).toBe(true);
    expect(isTeamAdministrator({ role: "admin", permissions: ["team.manage"] })).toBe(false);
  });
  it("拒绝未知、重复或非数组权限值", () => {
    expect(isPermissionList(["documents.upload"])).toBe(true);
    expect(isPermissionList(["superadmin"])).toBe(false);
    expect(isPermissionList(["team.manage", "team.manage"])).toBe(false);
    expect(isPermissionList("team.manage")).toBe(false);
  });
  it("注册时忽略团队名的首尾空白、连续空白和字母大小写", () => {
    expect(normalizeTenantName("  Acme   团队  ")).toBe("acme 团队");
  });
});
