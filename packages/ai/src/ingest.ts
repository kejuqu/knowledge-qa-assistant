import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import type { ModelConfig } from "./models";
import { createEmbeddings } from "./models";
import { getVectorStore } from "./vector-store";
import { validateVectors } from "./validate-vectors";

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

  const embeddings = createEmbeddings(config);
  const vectors = await embeddings.embedDocuments(chunks);
  validateVectors(vectors, docs.length);

  const store = await getVectorStore(embeddings);
  await store.ensureCollection(vectors, docs);
  const collection = await store.client.describeCollection({ collection_name: store.collectionName });
  const field = collection.schema.fields.find((field) => field.name === store.vectorField);
  const dimension = Number(field?.type_params.find((param) => param.key === "dim")?.value);
  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error("无法读取知识库向量维度，请检查 Milvus 集合结构。");
  }
  validateVectors(vectors, docs.length, dimension);
  await store.addVectors(vectors, docs);
  return docs.length;
}
