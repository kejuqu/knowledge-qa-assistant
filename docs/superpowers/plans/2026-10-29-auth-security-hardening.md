# Auth 安全加固(改进清单 1-3)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成改进清单中三项高优先级加固:`getCookieDomain()` 白名单(防 Host 头注入)、同名 Cookie 逐个验签(防 Cookie Tossing)、JWT 加 `iss`/`aud` 并校验(防跨应用 token 混用)。

**Architecture:** 三项改动全部集中在 `packages/auth`(会话的签发、校验、读取的唯一收口):`session.ts` 管签发/域名,`next.ts` 的 `getSessionUser()` 是所有 app 读取会话的唯一入口。消费方(web app 各路由、auth app 登录/注册/登出)零改动。

**Tech Stack:** TypeScript, jose (JWT), vitest (新增,仅 @kqa/auth)

**Spec:** 改进清单截图(getCookieDomain() 用白名单 / 遍历同名 Cookie 逐个验签 / JWT 加 iss / aud 并校验);第 4 项( refresh token )不在本计划范围,另行规划。

## Global Constraints

- 部署后所有已签发的旧 token(无 `iss`/`aud`)立即失效,全部用户需重新登录一次(预期行为)。
- `COOKIE_DOMAIN` 环境变量若不在白名单内,`getCookieDomain()` 必须抛错(fail closed),宁可登录 5xx 也不把 Cookie 写到未知域名。
- 不新增运行时依赖;仅 `@kqa/auth` 新增 devDependency `vitest`。

## Review Focus

- **旧 token 兼容**:部署瞬间在线用户全部失效 → Task 3 测试锁定"无 iss/aud 的 token 验签失败";执行后需告知用户重新登录。
- **COOKIE_DOMAIN 不在白名单时登录/注册 5xx**:fail closed 是刻意的,Task 1 测试锁定抛错行为。
- **多同名 Cookie 的合法场景**(如未来迁移 COOKIE_DOMAIN 期间浏览器同时持有新旧两个 cookie):当前设计直接拒绝(判未登录),Task 2 测试锁定"≥2 个有效 token → null"。
- **middleware 只查存在性不验签**:Cookie Tossing 时中间件放行、(main)/layout 重定向到登录页,不会死循环——但意味着被 tossing 的用户看到的是"被登出",Task 4 回归验证覆盖。
- **`store.getAll` 可用性**:依赖 Next 15 的 `cookies().getAll(name)` API,Task 2 以 mock 验证而非真实 Next 运行时,需在 Task 4 用真实 dev server 兜底。

---

### Task 1: `getCookieDomain()` 白名单 + vitest 测试基建

**Files:**
- Modify: `packages/auth/src/session.ts:28-30`(`getCookieDomain`)
- Modify: `packages/auth/package.json`(新增 devDep `vitest` + script)
- Modify: `turbo.json`(新增 `test` task)
- Test: `packages/auth/src/session.test.ts`(新建)

**Interfaces:**
- Consumes: `process.env.COOKIE_DOMAIN`
- Produces: `getCookieDomain(): string` — 返回值只可能是 `.lvh.me` 或 `localhost`;不在白名单的 env 值抛 `Error`

- [ ] **Step 1: 安装 vitest 并注册脚本**

```bash
pnpm --filter @kqa/auth add -D vitest
```

`packages/auth/package.json` 的 scripts 增加 `"test": "vitest run"`;`turbo.json` 的 `tasks` 增加 `"test": {}`。

- [ ] **Step 2: 写失败的测试 `packages/auth/src/session.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("getCookieDomain", () => {
  it("未设置 COOKIE_DOMAIN 时返回默认开发域 .lvh.me", async () => {
    vi.stubEnv("COOKIE_DOMAIN", "");
    const { getCookieDomain } = await import("./session");
    expect(getCookieDomain()).toBe(".lvh.me");
  });
  it("白名单内的值原样返回", async () => {
    vi.stubEnv("COOKIE_DOMAIN", "localhost");
    const { getCookieDomain } = await import("./session");
    expect(getCookieDomain()).toBe("localhost");
  });
  it("不在白名单内的值抛错(fail closed)", async () => {
    vi.stubEnv("COOKIE_DOMAIN", "evil.com");
    const { getCookieDomain } = await import("./session");
    expect(() => getCookieDomain()).toThrow(/白名单/);
  });
});
```

注意:`vi.stubEnv(x, "")` 使 `process.env.COOKIE_DOMAIN` 为空串,走默认值分支。

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @kqa/auth test`
Expected: 3 个测试 FAIL(当前实现不校验白名单,`evil.com` 不抛错)

- [ ] **Step 4: 实现白名单**

`packages/auth/src/session.ts` 中替换 `getCookieDomain`:

```ts
// 允许作为会话 Cookie 父域的白名单。只认代码里的固定值,不接受任何请求输入或不受信的环境来源,
// 防止 Host 头/配置注入把会话 Cookie 写到攻击者控制的域名。生产部署时把真实父域加进这个集合。
const ALLOWED_COOKIE_DOMAINS = new Set([".lvh.me", "localhost"]);

export function getCookieDomain(): string {
  const domain = process.env.COOKIE_DOMAIN ?? ".lvh.me";
  if (!ALLOWED_COOKIE_DOMAINS.has(domain)) {
    throw new Error(`COOKIE_DOMAIN "${domain}" 不在白名单内,拒绝用作 Cookie 域名`);
  }
  return domain;
}
```

空串/未设置走默认值:实现时写成 `const domain = process.env.COOKIE_DOMAIN || ".lvh.me";`(空串也回落默认)。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @kqa/auth test`
Expected: 3 个 PASS

- [ ] **Step 6: Commit**

```bash
git add packages/auth/src/session.ts packages/auth/src/session.test.ts packages/auth/package.json turbo.json pnpm-lock.yaml
git commit -m "feat(auth): getCookieDomain 白名单校验,防 Host 头注入写 Cookie 到未知域名"
```

---

### Task 2: 同名 Cookie 逐个验签(防 Cookie Tossing)

**Files:**
- Modify: `packages/auth/src/next.ts:5-16`(`getSessionUser`)
- Test: `packages/auth/src/next.test.ts`(新建)

**Interfaces:**
- Consumes: Next 15 `cookies()` 的 `store.getAll(name)` API;Task 1 未动、Task 3 会改的 `verifySession`
- Produces: `getSessionUser(): Promise<SessionPayload | null>` 语义收紧 — 同名 Cookie 中恰有 1 个验签通过才返回会话;0 个或 ≥2 个都返回 `null`

- [ ] **Step 1: 写失败的测试 `packages/auth/src/next.test.ts`**

mock `next/headers` 的 `cookies()`,用 Task 3 之前现有的 `signSession` 造合法 token:

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @kqa/auth test`
Expected: "恰一个合法 Cookie"、"合法 + 伪造共存"、"两个合法 Cookie" 失败(当前 `store.get(...)` 只取第一个)

- [ ] **Step 3: 实现 `getSessionUser` 逐个验签**

`packages/auth/src/next.ts` 函数体替换为:

```ts
export async function getSessionUser(): Promise<SessionPayload | null> {
  const store = await cookies();

  // 浏览器对同名 Cookie(不同 Domain/Path)会全部带上。逐个验签:
  // 恰 1 个通过 → 正常会话;0 个 → 未登录;≥2 个 → 疑似 Cookie Tossing/会话固定,拒绝。
  const entries = store.getAll(SESSION_COOKIE);
  const valid: SessionPayload[] = [];
  for (const entry of entries) {
    const payload = await verifySession(entry.value);
    if (payload) valid.push(payload);
  }
  if (valid.length !== 1) return null;
  return valid[0];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @kqa/auth test`
Expected: 全部 PASS(含 Task 1 的 3 个)

- [ ] **Step 5: Commit**

```bash
git add packages/auth/src/next.ts packages/auth/src/next.test.ts
git commit -m "feat(auth): 同名会话 Cookie 逐个验签,>=2 个有效即拒绝,防 Cookie Tossing"
```

---

### Task 3: JWT 加 `iss` / `aud` 并校验

**Files:**
- Modify: `packages/auth/src/session.ts:33-66`(`signSession` / `verifySession`)
- Test: 追加到 `packages/auth/src/session.test.ts`

**Interfaces:**
- Consumes: jose `SignJWT.setIssuer/setAudience`、`jwtVerify` 的 `issuer`/`audience` 选项
- Produces:
  - `export const SESSION_ISSUER = "kqa-auth"`、`export const SESSION_AUDIENCE = "kqa"`
  - 签发的 token 带 `iss: "kqa-auth"`、`aud: "kqa"`;`verifySession` 强制校验两者

- [ ] **Step 1: 写失败的测试(追加到 `session.test.ts`)**

```ts
describe("JWT iss/aud", () => {
  beforeEach(() => vi.stubEnv("AUTH_SECRET", "test-secret"));

  it("签发的 token 带 iss/aud 且能验签通过", async () => {
    const { signSession, verifySession } = await import("./session");
    const token = await signSession({
      sub: "u1", email: "a@b.c", name: "T", tenantId: "t1", tenantName: "T", role: "admin",
    });
    const payload = await verifySession(token);
    expect(payload?.sub).toBe("u1");
  });
  it("无 iss/aud 的旧 token 验签失败", async () => {
    const { SignJWT } = await import("jose");
    const legacy = await new SignJWT({ email: "a@b.c", name: "T", tenantId: "t1", tenantName: "T", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("test-secret"));
    const { verifySession } = await import("./session");
    expect(await verifySession(legacy)).toBeNull();
  });
  it("iss 不匹配的 token 验签失败", async () => {
    const { SignJWT } = await import("jose");
    const foreign = await new SignJWT({ email: "a@b.c", name: "T", tenantId: "t1", tenantName: "T", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuer("other-app")
      .setAudience("kqa")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("test-secret"));
    const { verifySession } = await import("./session");
    expect(await verifySession(foreign)).toBeNull();
  });
});
```

注意:文件顶部需 `import { beforeEach } from "vitest"` 若尚未引入。`AUTH_SECRET` 用 `vi.stubEnv` 保证隔离。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @kqa/auth test`
Expected: "无 iss/aud 的旧 token"、"iss 不匹配" 两个 FAIL(当前 `jwtVerify` 不校验 iss/aud)

- [ ] **Step 3: 实现 iss/aud**

`packages/auth/src/session.ts`:

1. 常量区(`SESSION_MAX_AGE` 下方)新增:

```ts
export const SESSION_ISSUER = "kqa-auth"; // 本系统签发的标识,防止其它系统用同密钥签的 token 被混用
export const SESSION_AUDIENCE = "kqa"; // 接受方标识;未来按 app 细分 audience 时在此扩展
```

2. `signSession` 的链上 `.setIssuedAt()` 之后加:

```ts
.setIssuer(SESSION_ISSUER)
.setAudience(SESSION_AUDIENCE)
```

3. `verifySession` 的 `jwtVerify` 改为:

```ts
await jwtVerify(token, getSecret(), { issuer: SESSION_ISSUER, audience: SESSION_AUDIENCE });
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @kqa/auth test`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auth/src/session.ts packages/auth/src/session.test.ts
git commit -m "feat(auth): JWT 增加 iss/aud 签发与校验,防跨应用 token 混用(旧 token 失效需重新登录)"
```

---

### Task 4: 回归验证(真实 dev server 端到端)

**Files:** 无代码改动

- [ ] **Step 1: 类型检查**

Run: `pnpm --filter @kqa/auth exec tsc --noEmit && pnpm --filter web exec tsc --noEmit && pnpm --filter auth exec tsc --noEmit`
Expected: 全过

- [ ] **Step 2: curl 验证 signin 写 cookie 域名仍正确**

先建临时用户(bcrypt hash 用 `cd packages/auth && node -e "require('bcryptjs').hash('pw',12).then(console.log)"` 生成),INSERT 进 docker 里的 kqa 库(参照 `docker-compose.yml` 的 kqa/kqa_password),然后:

```bash
curl -s -i -X POST http://auth.lvh.me:3001/api/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"<临时邮箱>","password":"pw"}' | grep -i set-cookie
```

Expected: `Set-Cookie: kqa_session=...; Domain=.lvh.me; ...`(域名正确、无 500)

- [ ] **Step 3: curl 验证 signout 删 cookie**

```bash
curl -s -i -X POST http://auth.lvh.me:3001/api/signout | grep -i "set-cookie\|location"
```

Expected: `Max-Age=0; Domain=.lvh.me` + `location: http://auth.lvh.me:3001/signin`

- [ ] **Step 4: 浏览器端到端复跑登录→退出流程**

复用之前的 Playwright 方式(临时目录建脚本,`--no-proxy-server` 绕开 Clash,executablePath 指向 `~/Library/Caches/ms-playwright/chromium-1194/.../Chromium`):登录 → 用户菜单可见 → 点退出登录 → 断言出现 POST `/api/signout` 且落在 `auth.lvh.me/signin` → 再访问 web app 被重定向登录页。脚本与测试用户用完即删。

- [ ] **Step 5: 最终 commit(如有遗留改动)并告知用户**

向用户说明:部署后所有在线用户因 iss/aud 校验会失效一次,需重新登录(预期)。

---

## Self-Review

1. **Spec coverage**: 白名单✓(Task 1)、逐个验签✓(Task 2)、iss/aud✓(Task 3)、refresh token 明确排除(用户已确认另行规划)。
2. **Step scan**: 每个 step 只有一件事;测试断言、签名、常量值均已固定。
3. **类型一致性**: `getCookieDomain(): string`、`getSessionUser(): Promise<SessionPayload | null>`、`SESSION_ISSUER/AUDIENCE` 常量名跨 Task 一致。
4. **Review Focus**: 5 项均已映射——旧 token(Task 3 测试)、白名单 fail closed(Task 1 测试)、多同名 cookie(Task 2 测试)、middleware 放行+layout 重定向(Task 4 Step 4)、`getAll` API(Task 4 Step 4 真实运行时兜底)。
5. **Proportion**: spec 四行,plan 四个小 Task,无冗余代码块超出签名/断言所需。
