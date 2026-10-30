import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import type { Document } from "@langchain/core/documents";
import { createChatModel, createEmbeddings, type ModelConfig } from "./models";
import { getVectorStore } from "./vector-store";

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是企业内部知识问答助手。基于下面检索到的资料回答用户问题。
要求：
1. 只能依据资料作答，资料没有的信息要明说"知识库中未找到相关内容"
2. 回答用中文，条理清晰
3. 如果资料与问题无关，忽略资料

检索资料：
{context}`,
  ],
  ["human", "{question}"],
]);

export interface RagCitation {
  documentId: string;
  filename: string;
  chunkIndex: number;
  /** 召回的段落原文，前端据此展示/高亮引用段落 */
  content: string;
  /** 相似度得分（COSINE，越高越相关） */
  score: number;
}

function formatContext(docs: Document[]) {
  return docs.map((d, i) => `[资料${i + 1}] ${d.pageContent}`).join("\n\n");
}

function toCitations(results: Array<[Document, number]>): RagCitation[] {
  const seen = new Set<string>();
  const out: RagCitation[] = [];
  for (const [d, score] of results) {
    const key = `${d.metadata.documentId}:${d.metadata.chunkIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      documentId: d.metadata.documentId,
      filename: d.metadata.filename,
      chunkIndex: d.metadata.chunkIndex,
      content: d.pageContent,
      score,
    });
  }
  return out;
}

/** 流式 RAG 问答：返回 token 流 + 引用（引用在检索后即可确定，先行返回） */
export async function streamRagAnswer(
  question: string,
  tenantId: string,
  config: ModelConfig,
  documentIds: string[] | null = null
): Promise<{ stream: AsyncIterable<string>; citations: RagCitation[] }> {
  const embeddings = createEmbeddings(config);
  const store = await getVectorStore(embeddings);

  // 权限过滤前置到检索阶段：Milvus 标量过滤表达式只召回本租户的 chunk，
  // LLM 的上下文里根本不会出现越权数据
  const documentFilter = documentIds === null
    ? ""
    : documentIds.length === 0
      ? ' && documentId == "__no_permitted_document__"'
      : ` && documentId in [${documentIds.map((id) => `"${id}"`).join(",")}]`;
  const results = (await store.similaritySearchWithScore(question, 4, `tenantId == "${tenantId}"${documentFilter}`)) as Array<[Document, number]>;
  const docs = results.map(([doc]) => doc);

  const chain = RunnableSequence.from([
    { context: new RunnablePassthrough(), question: new RunnablePassthrough() },
    prompt,
    createChatModel(config, true),
    new StringOutputParser(),
  ]);

  const stream = await chain.stream({
    context: formatContext(docs),
    question,
  });

  return { stream, citations: toCitations(results) };
}
