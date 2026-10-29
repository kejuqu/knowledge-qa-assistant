import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@kqa/auth";

const AUTH_APP_URL = process.env.AUTH_APP_URL ?? "http://auth.lvh.me:3001";
const WEB_APP_URL = process.env.WEB_APP_URL ?? "http://app.lvh.me:3100";

/**
 * 边缘拦截：共享 cookie 在父域名上，所以这里能直接读到。
 * 只做"存在性"检查（中间件无法连数据库），签名校验在服务端组件/路由里做。
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const signinUrl = new URL("/signin", AUTH_APP_URL);
    // 用对外地址 + 原始路径拼 callbackUrl，不用 request.url——host 可能和对外域名不一致
    const callbackUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, WEB_APP_URL);
    signinUrl.searchParams.set("callbackUrl", callbackUrl.toString());
    return NextResponse.redirect(signinUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
