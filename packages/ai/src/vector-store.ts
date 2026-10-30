import { Milvus } from "@langchain/community/vectorstores/milvus";
import type { OpenAIEmbeddings } from "@langchain/openai";

export const MILVUS_COLLECTION = "kqa_chunks";

function getMilvusAddress() {
  return process.env.MILVUS_ADDRESS ?? "localhost:19530";
}

/**
 * 每个向量除了文本内容，还带 metadata：
 * { documentId, filename, chunkIndex, tenantId }
 * 检索时按 tenantId 过滤，天然做到多租户数据隔离
 */
export async function getVectorStore(embeddings: OpenAIEmbeddings) {
  return new Milvus(embeddings, {
    collectionName: MILVUS_COLLECTION,
    url: getMilvusAddress(),
    autoId: true,
    vectorField: "vector",
    textField: "text",
    // 显式设置 text 字段最大长度，避免 LangChain 用第一条数据的长度推断 varchar 上限
    textFieldMaxLength: 65535,
    // 创建和查询必须使用相同的距离度量，匹配已有 kqa_chunks 索引。
    indexCreateOptions: {
      index_type: "IVF_FLAT",
      metric_type: "COSINE",
      params: { nlist: 1024 },
      search_params: { nprobe: 10 },
    },
  });
}

/**
 * 按 documentId 删除该文档在 Milvus 里的所有向量分块。
 * 用 Milvus 原生 client 做 delete（LangChain 封装不支持删除）。
 */
export async function deleteDocumentVectors(documentId: string): Promise<void> {
  const { MilvusClient } = await import("@zilliz/milvus2-sdk-node");
  const client = new MilvusClient({ address: getMilvusAddress() });

  try {
    await client.delete({
      collection_name: MILVUS_COLLECTION,
      filter: `documentId == "${documentId}"`,
    });
  } finally {
    await client.closeConnection();
  }
}
