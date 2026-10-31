import { hasPermission } from "@kqa/auth/permissions";
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
  if (!hasPermission(user, "documents.delete")) {
    return NextResponse.json({ error: "没有删除知识库文档的权限" }, { status: 403 });
  }

  const { id } = await params;

  const response = await db.transaction(async (tx) => {
    // 与重试共用行锁，防止清理向量后又被重新入队写入。
    const [doc] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1).for("update");
    if (!doc || doc.tenantId !== user.tenantId) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }
    if (doc.status === "processing" || doc.status === "pending") {
      return NextResponse.json(
        { error: "文档正在处理中，暂时无法删除，请稍后再试" },
        { status: 409 }
      );
    }

    // 1. 必须先清理向量；失败的任务也可能已写入部分分块，不能依赖 chunkCount。
    try {
      await deleteDocumentVectors(doc.id);
    } catch (err) {
      console.error(`[delete] failed to remove vectors for ${doc.id}:`, err);
      return NextResponse.json({ error: "向量数据清理失败，文档尚未删除，请稍后重试" }, { status: 502 });
    }

    try {
      if (doc.objectKey) await deleteDocumentObject(doc.objectKey);
    } catch (err) {
      console.error(`[delete] failed to remove object for ${doc.id}:`, err);
    }

    // 2. 软删除 PG 记录
    await tx
      .update(documents)
      .set({ deletedAt: new Date() })
      .where(eq(documents.id, doc.id));

    return NextResponse.json({ ok: true });
  });
  // 事务提交成功后再通知前端移除。
  if (response.ok) publish(user.tenantId, "document:deleted", { id });
  return response;
}
