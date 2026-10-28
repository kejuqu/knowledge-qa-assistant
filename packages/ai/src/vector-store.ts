import { Milvus } from "@langchain/community/vectorstores/milvus";
import type { OpenAIEmbeddings } from "@langchain/openai";

export const MILVUS_COLLECTION = "kqa_chunks";

function getMilvusAddress() {
  return process.env.MILVUS_ADDRESS ?? "localhost:19530";
}

/**
 * 每个向量除了文本内容，还带 metadata：
 * { documentId, filename, chunkIndex, ownerId }
 * 检索时按 ownerId 过滤，天然做到多租户数据隔离
 */
export async function getVectorStore(embeddings: OpenAIEmbeddings) {
  return new Milvus(embeddings, {
    collectionName: MILVUS_COLLECTION,
    url: getMilvusAddress(),
    autoId: true,
    vectorField: "vector",
    textField: "text",
  });
}
