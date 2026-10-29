import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";

/** 服务端组件/路由里读取当前登录用户；未登录返回 null */
export async function getSessionUser(): Promise<SessionPayload | null> {
  // 获取当前请求的 Cookie 存储对象
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
