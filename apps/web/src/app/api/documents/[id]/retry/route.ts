import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, documents } from "@kqa/db";
import { deleteDocumentVectors } from "@kqa/ai";
import { getSessionUser } from "@kqa/auth/next";
import { publish } from "@/lib/events";
import { enqueueDocument } from "@/lib/queue";

/**
 * POST /api/documents/:id/retry
 * 对失败的异步入库任务重新排队。上传时保留的提取文本可避免用户再次选择文件。
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc || doc.tenantId !== user.tenantId) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  if (doc.status !== "failed") {
    return NextResponse.json({ error: "只有失败的文档可以重新解析" }, { status: 409 });
  }
  if (!doc.sourceText?.trim()) {
    return NextResponse.json(
      { error: "该历史文档未保存解析文本，请删除后重新上传" },
      { status: 409 }
    );
  }

  // 上次失败可能已写入部分向量；先清理，防止重试后的检索结果重复。
  try {
    await deleteDocumentVectors(doc.id);
  } catch (err) {
    console.error(`[retry] failed to remove vectors for ${doc.id}:`, err);
    return NextResponse.json({ error: "清理上次解析结果失败，请稍后重试" }, { status: 502 });
  }

  const [updated] = await db
    .update(documents)
    .set({ status: "pending", chunkCount: 0, error: null })
    .where(eq(documents.id, doc.id))
    .returning();

  await publish(updated.tenantId, "document", {
    id: updated.id,
    status: updated.status,
    chunkCount: updated.chunkCount,
    error: updated.error,
  });
  await enqueueDocument({
    documentId: updated.id,
    tenantId: updated.tenantId,
    filename: updated.filename,
    text: updated.sourceText!,
  });

  return NextResponse.json({
    document: {
      id: updated.id,
      status: updated.status,
      chunkCount: updated.chunkCount,
      error: updated.error,
    },
  });
}
