import { NextResponse } from "next/server";
import { and, desc, eq, ilike, lt, or } from "drizzle-orm";
import { db, conversations } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/** 按创建时间倒序的游标分页，会话侧栏滚动到底时继续加载。 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? DEFAULT_PAGE_SIZE);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const cursor = searchParams.get("cursor");
  const query = searchParams.get("q")?.trim().slice(0, 100) ?? "";

  let cursorCondition;
  if (cursor) {
    const [cursorConversation] = await db
      .select({ id: conversations.id, createdAt: conversations.createdAt, pinned: conversations.pinned })
      .from(conversations)
      .where(and(eq(conversations.id, cursor), eq(conversations.ownerId, user.sub)))
      .limit(1);
    if (!cursorConversation) {
      return NextResponse.json({ error: "invalid cursor" }, { status: 400 });
    }
    cursorCondition = or(
      cursorConversation.pinned ? eq(conversations.pinned, false) : undefined,
      and(
        eq(conversations.pinned, cursorConversation.pinned),
        or(
          lt(conversations.createdAt, cursorConversation.createdAt),
          and(
            eq(conversations.createdAt, cursorConversation.createdAt),
            lt(conversations.id, cursorConversation.id)
          )
        )
      )
    );
  }

  const rows = await db
    .select()
    .from(conversations)
    .where(and(
      eq(conversations.ownerId, user.sub),
      query ? ilike(conversations.title, `%${query.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
      cursorCondition
    ))
    .orderBy(desc(conversations.pinned), desc(conversations.createdAt), desc(conversations.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({
    items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
  });
}
