import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, documents } from "@kqa/db";
import { getTenantUser } from "@/lib/tenant-user";
import { deleteDocumentVectors } from "@kqa/ai";
import { publish } from "@/lib/events";
import { deleteDocumentObject } from "@/lib/object-storage";

/**
 * DELETE /api/documents/:id
 * 软删除文档 + 物理删除 Milvus 向量。
 * 只有就绪或失败的文档允许删除（处理中的文档可能正在写向量，先拒掉避免竞态）。
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "仅租户管理员可管理知识库文档" }, { status: 403 });
  }

  const { id } = await params;

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc || doc.tenantId !== user.tenantId) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  if (doc.status === "processing" || doc.status === "pending") {
    return NextResponse.json(
      { error: "文档正在处理中，暂时无法删除，请稍后再试" },
      { status: 409 }
    );
  }

  // 1. 清 Milvus 向量（失败也继续软删除，向量残留不影响功能）
  try {
    if (doc.chunkCount > 0) {
      await deleteDocumentVectors(doc.id);
    }
  } catch (err) {
    console.error(`[delete] failed to remove vectors for ${doc.id}:`, err);
  }

  try {
    if (doc.objectKey) await deleteDocumentObject(doc.objectKey);
  } catch (err) {
    console.error(`[delete] failed to remove object for ${doc.id}:`, err);
  }

  // 2. 软删除 PG 记录
  await db
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(eq(documents.id, doc.id));

  // 3. 推送 SSE 通知前端移除
  publish(user.tenantId, "document:deleted", { id: doc.id });

  return NextResponse.json({ ok: true });
}
