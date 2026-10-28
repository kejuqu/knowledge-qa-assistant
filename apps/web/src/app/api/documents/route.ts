import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, documents } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";
import { ingestDocument, extractText, isSupportedFile, SUPPORTED_EXTENSIONS } from "@kqa/ai";
import { getModelConfigForTenant } from "@/lib/model-config";

// 输入安全：单文件上限 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 知识库是租户共享的：列出租户内所有文档，而非仅自己上传的
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.tenantId, user.tenantId))
    .orderBy(desc(documents.createdAt));
  return NextResponse.json(rows);
}

/** 上传文档（txt/md/html/pdf/docx）：解析为纯文本 -> 存元数据到 PG -> 切分向量化写入 Milvus */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  // 类型白名单 + 大小校验
  if (!isSupportedFile(file.name)) {
    return NextResponse.json(
      { error: `当前支持 ${SUPPORTED_EXTENSIONS.join(" / ")} 格式` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "文件不能超过 20MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    text = await extractText(buffer, file.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : "parse failed";
    return NextResponse.json({ error: `文档解析失败：${message}` }, { status: 422 });
  }
  if (!text.trim()) {
    return NextResponse.json(
      { error: "未解析出文本内容（扫描件 PDF 需要 OCR，暂不支持）" },
      { status: 422 }
    );
  }

  const [doc] = await db
    .insert(documents)
    .values({
      tenantId: user.tenantId,
      ownerId: user.sub,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    })
    .returning();

  try {
    const config = await getModelConfigForTenant(user.tenantId);
    const chunkCount = await ingestDocument(
      { text, documentId: doc.id, filename: doc.filename, tenantId: user.tenantId },
      config
    );
    await db
      .update(documents)
      .set({ chunkCount, status: "ready" })
      .where(eq(documents.id, doc.id));
  } catch (err) {
    await db.update(documents).set({ status: "failed" }).where(eq(documents.id, doc.id));
    const message = err instanceof Error ? err.message : "ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: doc.id });
}
