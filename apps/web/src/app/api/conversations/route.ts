import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, conversations } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.ownerId, user.sub))
    .orderBy(desc(conversations.createdAt));
  return NextResponse.json(rows);
}
