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
  tenantId: string;
  tenantName: string;
  role: "admin" | "member";
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  // 将 secret 按 UTF-8 编码转换成字节数组（Uint8Array），jose 的 sign() 接受 Uint8Array
  return new TextEncoder().encode(secret);
}

export function getCookieDomain() {
  return process.env.COOKIE_DOMAIN ?? ".lvh.me";
}

// 把用户信息打包成一个 JWT（JSON Web Token），并用服务端密钥签名
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    tenantId: payload.tenantId,
    tenantName: payload.tenantName,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" }) // 指定签名算法为 HS256（HMAC-SHA256，对称密钥）。这个 header 也会进 token，验签时用来判断用哪种算法
    .setSubject(payload.sub) // 设置标准 claim sub（subject），即用户 ID。等价于在 payload 里写 sub: payload.sub，但用 API 更规范。JWT 规范里 sub 就是“这个 token 代表谁”
    .setIssuedAt() // 设置标准 claim iat（签发时间），默认当前时间
    .setExpirationTime(`${SESSION_MAX_AGE}s`) // 设置标准 claim exp（过期时间）。SESSION_MAX_AGE 是秒数，拼成 "3600s" 这种相对时间字符串，jose 会算成绝对时间戳。过期后验签会失败，这是会话自动失效的核心机制
    .sign(getSecret()); // 用密钥做 HMAC-SHA256 签名， 返回 header.payload.signature， jose 的 sign() 接受 Uint8Array 或 KeyLike
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    // token（无租户字段）视为无效，强制重新登录
    if (!payload.sub || !payload.tenantId) return null;

    // 最终返回验证后的用户会话信息。
    return {
      sub: payload.sub,
      email: payload.email as string,
      name: payload.name as string,
      tenantId: payload.tenantId as string,
      tenantName: payload.tenantName as string,
      role: payload.role as "admin" | "member",
    };
  } catch {
    return null;
  }
}
