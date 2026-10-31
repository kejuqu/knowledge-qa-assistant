import { getTenantUser } from "@/lib/tenant-user";
import { and, eq, isNull } from "drizzle-orm";
import { db, documents } from "@kqa/db";
import { getDocumentChunks } from "@kqa/ai";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getTenantUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const [doc] = await db.select({ status: documents.status, chunkCount: documents.chunkCount })
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.tenantId, user.tenantId), isNull(documents.deletedAt)))
    .limit(1);
  if (!doc) return Response.json({ error: "文档不存在" }, { status: 404 });
  try {
    const chunks = doc.status === "ready" && doc.chunkCount > 0
      ? await getDocumentChunks(id, user.tenantId) : [];
    return Response.json(chunks, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(`[chunks] failed to load ${id}:`, error);
    return Response.json({ error: "分块加载失败，请稍后重试" }, { status: 502 });
  }
}
