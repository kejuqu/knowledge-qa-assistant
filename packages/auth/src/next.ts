import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";

/** 服务端组件/路由里读取当前登录用户；未登录返回 null */
export async function getSessionUser(): Promise<SessionPayload | null> {
  // 获取当前请求的 Cookie 存储对象
  const store = await cookies();

  // 调用存储对象的 .get() 方法，尝试获取名为 SESSION_COOKIE 的特定 Cookie
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  // 如果取到了 token，则调用 verifySession 函数进行验证，最终返回验证后的用户会话信息或 null
  return verifySession(token);
}
