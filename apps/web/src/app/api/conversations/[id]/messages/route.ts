import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, messages } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  return NextResponse.json(rows);
}
