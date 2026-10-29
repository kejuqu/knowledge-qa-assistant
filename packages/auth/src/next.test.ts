import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const cookieStore: { list: { name: string; value: string }[] } = { list: [] };
vi.mocked((await import("next/headers")).cookies).mockResolvedValue(
  // @ts-expect-error 只需 getAll
  { getAll: (name: string) => cookieStore.list.filter((c) => c.name === name) }
);

let token: string;
beforeAll(async () => {
  process.env.AUTH_SECRET = "test-secret";
  const { signSession } = await import("./session");
  token = await signSession({
    sub: "u1", email: "a@b.c", name: "T", tenantId: "t1", tenantName: "T", role: "admin",
  });
});

describe("getSessionUser 防 Cookie Tossing", () => {
  it("无 Cookie → null", async () => {
    cookieStore.list = [];
    expect(await (await import("./next")).getSessionUser()).toBeNull();
  });
  it("恰一个合法 Cookie → 返回会话", async () => {
    cookieStore.list = [{ name: "kqa_session", value: token }];
    expect((await (await import("./next")).getSessionUser())?.sub).toBe("u1");
  });
  it("只有一个伪造 Cookie → null", async () => {
    cookieStore.list = [{ name: "kqa_session", value: "forged" }];
    expect(await (await import("./next")).getSessionUser()).toBeNull();
  });
  it("合法 + 伪造共存 → 返回合法会话(伪造验签不过被忽略)", async () => {
    cookieStore.list = [{ name: "kqa_session", value: "forged" }, { name: "kqa_session", value: token }];
    expect((await (await import("./next")).getSessionUser())?.sub).toBe("u1");
  });
  it("两个合法 Cookie(会话固定/Tossing)→ null", async () => {
    const { signSession } = await import("./session");
    const other = await signSession({
      sub: "u2", email: "x@y.z", name: "T", tenantId: "t1", tenantName: "T", role: "member",
    });
    cookieStore.list = [{ name: "kqa_session", value: token }, { name: "kqa_session", value: other }];
    expect(await (await import("./next")).getSessionUser()).toBeNull();
  });
});
