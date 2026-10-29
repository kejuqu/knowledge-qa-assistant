import { NextResponse } from "next/server";
import { SESSION_COOKIE, getCookieDomain } from "@kqa/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/signin", request.url), { status: 303 });
  // 删除时 domain/path 必须与写入时一致，浏览器才会匹配到同一个 cookie
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    domain: getCookieDomain(),
    path: "/",
    maxAge: 0,
  });
  return response;
}
