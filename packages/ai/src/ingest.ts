import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import type { ModelConfig } from "./models";
import { createEmbeddings } from "./models";
import { getVectorStore } from "./vector-store";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800,
  chunkOverlap: 120,
});

export interface IngestInput {
  /** 已解析的纯文本（由 @kqa/ai 的 extractText 在上传时完成，队列消费时直接传入） */
  text: string;
  documentId: string;
  filename: string;
  tenantId: string;
}

/** 文档入库：切分 -> embedding -> 写入 Milvus，返回 chunk 数 */
export async function ingestDocument(input: IngestInput, config: ModelConfig): Promise<number> {
  const chunks = await splitter.splitText(input.text);
  if (chunks.length === 0) return 0;

  const docs = chunks.map(
    (chunk, i) =>
      new Document({
        pageContent: chunk,
        metadata: {
          documentId: input.documentId,
          filename: input.filename,
          tenantId: input.tenantId,
          chunkIndex: i,
        },
      })
  );

  const store = await getVectorStore(createEmbeddings(config));
  await store.addDocuments(docs);
  return docs.length;
}
