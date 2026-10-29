import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, conversations } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";

type Context = { params: Promise<{ id: string }> };
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: Context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!validId.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (!body || (body.title === undefined && body.pinned === undefined) ||
    (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200)) ||
    (body.pinned !== undefined && typeof body.pinned !== "boolean")) {
    return NextResponse.json({ error: "标题须为 1–200 个字符，固定状态须为布尔值" }, { status: 400 });
  }
  const [updated] = await db.update(conversations).set({
    ...(body.title !== undefined ? { title: body.title.trim() } : {}),
    ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
  }).where(and(eq(conversations.id, id), eq(conversations.ownerId, user.sub))).returning();
  if (!updated) return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Context) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!validId.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const [deleted] = await db.delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.ownerId, user.sub)))
    .returning({ id: conversations.id });
  if (!deleted) return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  return new Response(null, { status: 204 });
}
