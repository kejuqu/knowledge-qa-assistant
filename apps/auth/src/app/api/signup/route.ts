import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users, tenants, tenantMembers } from "@kqa/db";
import {
  hashPassword,
  signSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  getCookieDomain,
} from "@kqa/auth";

export async function POST(request: Request) {
  const { email, name, password, tenantName } = await request.json();

  if (!email || !name || !password || password.length < 6) {
    return NextResponse.json({ error: "请填写完整信息，密码至少 6 位" }, { status: 400 });
  }
  if (!tenantName?.trim()) {
    return NextResponse.json({ error: "请填写企业/团队名称" }, { status: 400 });
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  // 注册即建租户：用户 + 租户 + admin 成员关系，一个事务保证原子性
  const { user, tenant } = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, name, passwordHash })
      .returning();
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: tenantName.trim() })
      .returning();
    await tx.insert(tenantMembers).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "admin", // 创建者默认管理员
    });
    return { user, tenant };
  });

  const token = await signSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    tenantId: tenant.id,
    tenantName: tenant.name,
    role: "admin",
  });

  const response = NextResponse.json({ ok: true });
  // 关键：Domain=父域名，子域名 app 之间共享登录态
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    domain: getCookieDomain(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
