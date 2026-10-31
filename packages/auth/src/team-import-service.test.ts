import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ selects: [] as unknown[][], returning: [] as unknown[][], writes: [] as { kind: string; value: unknown }[], execute: vi.fn() }));
vi.mock("../../../apps/web/src/lib/tenant-user", () => ({ getTenantUser: vi.fn() }));
vi.mock("./password", () => ({ hashPassword: vi.fn(async () => "hashed-password") }));
vi.mock("../../db/src/index", async (original) => {
  const module = await original<typeof import("@kqa/db")>();
  const select = () => {
    const chain = { from: () => chain, where: () => chain, limit: () => chain, for: () => chain,
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(state.selects.shift() ?? []).then(resolve) };
    return chain;
  };
  const write = (kind: string) => {
    const chain = { values: (value: unknown) => { state.writes.push({ kind, value }); return chain; },
      set: (value: unknown) => { state.writes.push({ kind, value }); return chain; }, where: () => chain,
      onConflictDoNothing: () => chain, returning: async () => state.returning.shift() ?? [],
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve) };
    return chain;
  };
  const tx = { select, insert: () => write("insert"), update: () => write("update"), execute: state.execute };
  return { ...module, db: { transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) } };
});
import { importEmployees } from "../../../apps/web/src/lib/team-import";
import { hashPassword } from "./password";

const actor = { tenantId: "t1", userId: "admin", keyId: null };
const manager = { role: "admin", permissions: null, status: "active" };
const employee = { name: "A", email: "a@b.co", password: "password123" };
beforeEach(() => { state.selects = [[{ id: "t1", name: "Team" }], [manager]]; state.returning = []; state.writes = []; vi.clearAllMocks(); });
describe("共享导入服务", () => {
  it("重复成员不修改密码、姓名和权限", async () => {
    state.selects.push([{ id: "u1" }], [{ id: "m1", tenantId: "t1", status: "active", role: "admin" }]);
    const result = await importEmployees(actor, [employee]);
    expect(result).toMatchObject({ added: 0, skipped: 1, failed: 0 });
    expect(state.writes).toEqual([]); expect(hashPassword).not.toHaveBeenCalled();
  });
  it("拒绝已有其他租户账号", async () => {
    state.selects.push([{ id: "u1" }], [{ id: "m1", tenantId: "other", status: "active" }]);
    expect(await importEmployees(actor, [employee])).toMatchObject({ failed: 1, added: 0 });
    expect(state.writes).toEqual([]);
  });
  it("新账号缺少密码时返回行级错误", async () => {
    state.selects.push([]);
    expect(await importEmployees(actor, [{ name: "A", email: "a@b.co" }])).toMatchObject({ failed: 1 });
    expect(state.writes).toEqual([]);
  });
  it("新账号密码哈希保存，且只授予普通成员权限", async () => {
    state.selects.push([], [], [{ name: "Admin" }]);
    state.returning.push([{ id: "u1" }], [{ id: "m1" }]);
    const result = await importEmployees(actor, [employee]);
    expect(result).toMatchObject({ added: 1, failed: 0 });
    expect(state.writes[0]?.value).toMatchObject({ passwordHash: "hashed-password" });
    expect(state.writes[1]?.value).toMatchObject({ role: "member", status: "active", tenantId: "t1" });
    expect(JSON.stringify(result)).not.toContain("password");
  });
  it("重新检查权限，权限已撤销时不写入", async () => {
    state.selects[1] = [{ ...manager, permissions: [] }];
    await expect(importEmployees(actor, [employee])).rejects.toMatchObject({ status: 403 });
    expect(state.writes).toEqual([]);
  });
  it("撤销的 Key 不可导入", async () => {
    state.selects.push([]);
    await expect(importEmployees({ ...actor, keyId: "revoked" }, [employee])).rejects.toMatchObject({ status: 401 });
    expect(state.writes).toEqual([]);
  });
  it("过期 Key 不可导入", async () => {
    state.selects.push([{ id: "key", expiresAt: new Date(0) }]);
    await expect(importEmployees({ ...actor, keyId: "key" }, [employee])).rejects.toMatchObject({ status: 401 });
  });
  it("同一 Key 频繁请求返回 429", async () => {
    state.selects.push([{ id: "key", expiresAt: new Date(Date.now() + 60000), lastUsedAt: new Date() }]);
    await expect(importEmployees({ ...actor, keyId: "key" }, [employee])).rejects.toMatchObject({ status: 429 });
  });
  it("pending 成员通过后降为基础成员，清除旧授权", async () => {
    state.selects.push([{ id: "u1" }], [{ id: "m1", tenantId: "t1", status: "pending", role: "admin" }], [{ name: "Admin" }]);
    state.returning.push([{ id: "m1" }]);
    expect(await importEmployees(actor, [employee])).toMatchObject({ added: 1 });
    expect(state.writes[0]?.value).toMatchObject({ status: "active", role: "member", permissions: null });
    expect(hashPassword).not.toHaveBeenCalled();
  });
});
