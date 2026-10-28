/**
 * 跨子域名共享会话的约定：
 * - auth app 登录成功后，把 JWT 写进 httpOnly cookie，Domain=<父域名>（本地为 .lvh.me）
 * - 所有 *.父域名 的子应用（web/auth/未来的其它 app）都能读到同一个 cookie
 * - 各 app 用同一个 AUTH_SECRET 校验签名，无需互相调用
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "kqa_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export function getCookieDomain() {
  return process.env.COOKIE_DOMAIN ?? ".lvh.me";
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: payload.email as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}
