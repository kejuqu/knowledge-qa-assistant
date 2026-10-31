import { describe, expect, it, vi } from "vitest";
import { validateEmployees, readImportBody, MAX_IMPORT_BYTES } from "../../../apps/web/src/lib/team-import-input";
import { employeeTemplate, parseEmployeeExcel } from "../../../apps/web/src/lib/team-import-excel";
import ExcelJS from "../../../apps/web/node_modules/exceljs";

vi.mock("../../../apps/web/src/lib/tenant-user", () => ({ getTenantUser: vi.fn() }));
import { newApiKey, hashApiKey, canImport } from "../../../apps/web/src/lib/team-api-key";

describe("员工导入输入与密钥安全", () => {
  it("规范化邮箱和姓名，不裁剪密码", () => {
    expect(validateEmployees([{ name: " 张三 ", email: " A@EXAMPLE.COM ", password: " password " }]))
      .toEqual([{ name: "张三", email: "a@example.com", password: " password " }]);
  });
  it.each([[], new Array(101).fill({ name: "A", email: "a@b.co" }), [{ name: "", email: "a@b.co" }],
    [{ name: "A", email: "bad" }], [{ name: "A", email: "a@b.co", role: "admin" }],
    [{ name: "A", email: "a@b.co", tenantId: "another" }], [{ name: "A", email: "a@b.co", password: "short" }],
    [{ name: "A", email: "a@b.co", password: "汉".repeat(25) }],
  ])("拒绝空批次、过量、无效和提权输入 %j", (rows) => expect(() => validateEmployees(rows)).toThrow());
  it("缺省密码留给服务层按已有账号判断", () => {
    expect(validateEmployees([{ name: "A", email: "a@b.co" }])[0]?.password).toBeUndefined();
  });
  it("实际限制无 Content-Length 的分块请求", async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_IMPORT_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
    await expect(readImportBody(new Request("http://localhost", { method: "POST", body: stream, duplex: "half" } as RequestInit))).rejects.toMatchObject({ status: 413 });
  });
  it("生成 256 位随机密钥，只持久化单向哈希", () => {
    const a = newApiKey(), b = newApiKey();
    expect(a.key).toMatch(/^kqa_emp_[a-f0-9]{64}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.keyHash).toBe(hashApiKey(a.key));
    expect(a.keyHash).not.toContain(a.key);
  });
  it("非 active 或失去管理权限的创建者不能继续使用 Key", () => {
    expect(canImport({ role: "admin", permissions: null, status: "active" })).toBe(true);
    expect(canImport({ role: "admin", permissions: [], status: "active" })).toBe(false);
    expect(canImport({ role: "admin", permissions: null, status: "rejected" })).toBe(false);
    expect(canImport({ role: "member", permissions: ["team.manage"], status: "active" })).toBe(true);
    expect(canImport({ role: "member", permissions: ["forged"], status: "active" })).toBe(false);
  });
});

describe("真实 XLSX 文件解析", () => {
  async function workbook(values: unknown[]) {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("员工");
    sheet.addRow(["姓名", "邮箱", "初始密码"]); sheet.addRow(values);
    return new Uint8Array(await book.xlsx.writeBuffer());
  }
  it("下载模板可直接填写并导入", async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await employeeTemplate());
    book.worksheets[0]!.addRow(["张三", "A@example.com", "password123"]);
    expect(await parseEmployeeExcel(new Uint8Array(await book.xlsx.writeBuffer()))).toEqual([{ name: "张三", email: "a@example.com", password: "password123" }]);
  });
  it("拒绝公式而非采用缓存值", async () => {
    await expect(parseEmployeeExcel(await workbook(["A", { formula: '"a@b.co"', result: "a@b.co" }, "password123"]))).rejects.toThrow("纯文本");
  });
  it("拒绝非 ZIP 或伪装 XLSX", async () => {
    await expect(parseEmployeeExcel(new TextEncoder().encode("bad file"))).rejects.toThrow("无效");
  });
  it("拒绝超过解压限制的压缩包目录", async () => {
    const bytes = await workbook(["A", "a@b.co", "password123"]);
    const buffer = Buffer.from(bytes);
    const index = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    buffer.writeUInt32LE(9 * 1024 * 1024, index + 24);
    await expect(parseEmployeeExcel(buffer)).rejects.toMatchObject({ status: 413 });
  });
});
