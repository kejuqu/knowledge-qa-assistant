import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, messages, conversations } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const [conversation] = await db.select({ id: conversations.id }).from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.ownerId, user.sub))).limit(1);
  if (!conversation) return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  return NextResponse.json(rows);
}
