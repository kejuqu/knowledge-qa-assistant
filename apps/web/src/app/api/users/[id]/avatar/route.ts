import { and, eq } from "drizzle-orm";
import { db, users, tenantMembers } from "@kqa/db";
import { getTenantUser } from "@/lib/tenant-user";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getTenantUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response(null, { status: 404 });
  const [target] = await db.select({ avatarData: users.avatarData }).from(users)
    .innerJoin(tenantMembers, eq(tenantMembers.userId, users.id))
    .where(and(eq(users.id, id), eq(tenantMembers.tenantId, user.tenantId), eq(tenantMembers.status, "active"))).limit(1);
  if (!target?.avatarData) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(target.avatarData).buffer, {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
