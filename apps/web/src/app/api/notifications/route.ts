import { and, desc, eq, isNull, count } from "drizzle-orm";
import { db, notifications } from "@kqa/db";
import { getTenantUser } from "@/lib/tenant-user";

export async function GET() {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const recipient = and(eq(notifications.tenantId, user.tenantId), eq(notifications.userId, user.sub));
  const inbox = and(recipient, isNull(notifications.readAt));
  const [items, [unread]] = await Promise.all([
    db.select().from(notifications).where(inbox).orderBy(desc(notifications.createdAt)).limit(50),
    db.select({ count: count() }).from(notifications).where(inbox),
  ]);
  return Response.json({ items, unreadCount: unread.count });
}

export async function PATCH(request: Request) {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || (body.id !== undefined && (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)))) {
    return Response.json({ error: "无效的通知" }, { status: 400 });
  }
  await db.update(notifications).set({ readAt: new Date() }).where(and(
    eq(notifications.tenantId, user.tenantId), eq(notifications.userId, user.sub), isNull(notifications.readAt),
    body.id ? eq(notifications.id, body.id) : undefined,
  ));
  return Response.json({ ok: true });
}
