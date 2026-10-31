import { hasPermission } from "@kqa/auth/permissions";
import { NextResponse } from "next/server";
import { desc, eq, isNull, and, sql } from "drizzle-orm";
import { db, documents } from "@kqa/db";
import { getTenantUser } from "@/lib/tenant-user";
import { extractText, isSupportedFile, SUPPORTED_EXTENSIONS } from "@kqa/ai";
import { enqueueDocument } from "@/lib/queue";
import {
  createDocumentObjectKey,
  createDocumentObjectUrl,
  deleteDocumentObject,
  uploadDocumentObject,
  readDocumentObject,
} from "@/lib/object-storage";

import { documentSha256 } from "@/lib/document-file";
import { getDocumentMimeType } from "@/lib/utils";

// 输入安全：单文件上限 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function GET() {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 知识库是租户共享的：列出租户内所有未删除文档
  const rows = await db
    .select({
      id: documents.id,
      filename: documents.filename,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      chunkCount: documents.chunkCount,
      status: documents.status,
      error: documents.error,
      createdAt: documents.createdAt,
      objectKey: documents.objectKey,
      fileData: documents.fileData,
    })
    .from(documents)
    .where(and(eq(documents.tenantId, user.tenantId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.createdAt));

  // 可下载地址走鉴权代理（从 MinIO/历史库流式输出），bucket 始终保持私有
  return NextResponse.json(
    rows.map(({ objectKey, fileData, ...row }) => ({
      ...row,
      downloadUrl: objectKey || fileData ? `/api/documents/${row.id}/content?download=1` : null,
    }))
  );
}

/**
 * 上传文档：解析文本 -> 立即落库（pending）-> 放入处理队列异步向量化。
 * 前端通过 SSE（/api/events）接收状态变更，避免同步 embedding 造成的请求超时。
 */
export async function POST(request: Request) {
  const user = await getTenantUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPermission(user, "documents.upload")) {
    return NextResponse.json({ error: "没有上传知识库文档的权限" }, { status: 403 });
  }

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

  const sha256 = documentSha256(buffer);
  const mimeType = getDocumentMimeType(file.name, file.type);
  const duplicateResponse = () => NextResponse.json({ error: "文件已经上传" }, { status: 409 });
  const [existing] = await db.select({ id: documents.id }).from(documents).where(and(
    eq(documents.tenantId, user.tenantId), eq(documents.sha256, sha256), isNull(documents.deletedAt)
  )).limit(1);
  if (existing) return duplicateResponse();

  // 旧文档没有哈希：仅读取同租户、同字节数的候选原文件，避免全量扫描对象存储。
  const legacy = await db.select({ objectKey: documents.objectKey, fileData: documents.fileData })
    .from(documents).where(and(
      eq(documents.tenantId, user.tenantId), eq(documents.sizeBytes, file.size),
      isNull(documents.sha256), isNull(documents.deletedAt)
    ));
  for (const candidate of legacy) {
    const body = candidate.objectKey ? await readDocumentObject(candidate.objectKey) : candidate.fileData;
    if (body && documentSha256(body) === sha256) return duplicateResponse();
  }

  let text: string;
  try {
    text = await extractText(buffer, file.name, mimeType);
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

  const documentId = crypto.randomUUID();
  const objectKey = createDocumentObjectKey(user.tenantId, documentId, file.name);

  try {
    await uploadDocumentObject(objectKey, buffer, mimeType);
  } catch (error) {
    console.error("[upload] failed to persist document in MinIO:", error);
    return NextResponse.json({ error: "文件存储失败，请稍后重试" }, { status: 502 });
  }

  let doc: typeof documents.$inferSelect | undefined;
  try {
    [doc] = await db
      .insert(documents)
      .values({
        id: documentId,
        tenantId: user.tenantId,
        ownerId: user.sub,
        filename: file.name,
        mimeType,
        sha256,
        sizeBytes: file.size,
        status: "pending",
        sourceText: text,
        objectKey,
        objectUrl: createDocumentObjectUrl(objectKey),
      })
      .onConflictDoNothing({
        target: [documents.tenantId, documents.sha256],
        where: sql`${documents.deletedAt} is null`,
      })
      .returning();
  } catch (error) {
    await deleteDocumentObject(objectKey).catch(() => undefined);
    throw error;
  }

  if (!doc) {
    await deleteDocumentObject(objectKey).catch(() => undefined);
    return duplicateResponse();
  }

  // 解析入库成功即响应；向量化交给后台队列，状态通过 SSE 推送
  enqueueDocument({
    documentId: doc.id,
    tenantId: user.tenantId,
    filename: doc.filename,
    text,
  });

  return NextResponse.json({ ok: true, id: doc.id }, { status: 202 });
}
