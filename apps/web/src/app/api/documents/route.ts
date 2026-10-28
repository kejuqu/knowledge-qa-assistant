import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, documents } from "@kqa/db";
import { getSessionUser } from "@kqa/auth/next";
import { ingestDocument } from "@kqa/ai";
import { getModelConfigForUser } from "@/lib/model-config";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.ownerId, user.sub))
    .orderBy(desc(documents.createdAt));
  return NextResponse.json(rows);
}

/** 上传文档（.txt / .md）：存元数据到 PG -> 切分向量化写入 Milvus -> 更新状态 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!/\.(txt|md|markdown)$/i.test(file.name)) {
    return NextResponse.json({ error: "当前支持 .txt / .md 文件" }, { status: 400 });
  }

  const text = await file.text();
  const [doc] = await db
    .insert(documents)
    .values({
      ownerId: user.sub,
      filename: file.name,
      mimeType: file.type || "text/plain",
      sizeBytes: file.size,
    })
    .returning();

  try {
    const config = await getModelConfigForUser(user.sub);
    const chunkCount = await ingestDocument(
      { text, documentId: doc.id, filename: doc.filename, ownerId: user.sub },
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
