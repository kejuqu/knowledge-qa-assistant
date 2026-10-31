import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import type { ModelConfig } from "./models";
import { createEmbeddings } from "./models";
import { getVectorStore } from "./vector-store";
import { validateVectors } from "./validate-vectors";

/**
 * Markdown 结构感知切分：按 "\n## "/"\n### "/代码块/分割线/空格的优先级递归切，
 * 标题、代码块、表格尽量不被撕开；纯文本只是匹配不到高级分隔符，自然退化为段落切分。
 */
const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
  chunkSize: 800,
  chunkOverlap: 120,
});

interface MarkdownHeading {
  index: number;
  level: number;
  title: string;
}

/** 提取 Markdown 标题（# ~ ######），按出现顺序返回。 */
function extractHeadings(text: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const re = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const hashes = match[0].trimStart().match(/^#+/)?.[0].length ?? 1;
    headings.push({ index: match.index, level: hashes, title: match[1].trim() });
  }
  return headings;
}

/** 定位 chunk 在原文中的起始下标（chunks 按原文顺序切出，逐个向后找即可）。
 *  splitter 在边界可能丢弃分隔符，chunk 不一定是原文子串，所以用逐步缩短的前缀探测。 */
function locateChunks(text: string, chunks: string[]): number[] {
  const positions: number[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    let pos = -1;
    for (const probe of [trimmed, trimmed.slice(0, 40), trimmed.slice(0, 20)]) {
      if (!probe) break;
      pos = text.indexOf(probe, cursor);
      if (pos !== -1) break;
    }
    positions.push(pos === -1 ? cursor : pos);
    if (pos !== -1) cursor = pos + 1;
  }
  return positions;
}

/** 计算某位置生效的标题路径（如 "第一章 考勤 / 1.1 工作时间"）。 */
function headingPathAt(headings: MarkdownHeading[], position: number): string {
  const stack: MarkdownHeading[] = [];
  for (const heading of headings) {
    if (heading.index >= position) break;
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
    stack.push(heading);
  }
  return stack.map((h) => h.title).join(" / ");
}

/**
 * 给每个 chunk 注入所属章节路径作为上下文（不改变原文，只加在 chunk 开头）。
 * embedding 带着章节语义，召回质量更高；引用段落展示时读者也能看到出处。
 */
function injectHeadingContext(text: string, chunks: string[]): string[] {
  if (!/^ {0,3}#{1,6}\s/m.test(text)) return chunks;
  const headings = extractHeadings(text);
  if (headings.length === 0) return chunks;
  const positions = locateChunks(text, chunks);
  return chunks.map((chunk, i) => {
    const path = headingPathAt(headings, positions[i]);
    return path ? `【章节：${path}】\n\n${chunk}` : chunk;
  });
}

/**
 * Markdown 结构感知切分 + 章节上下文注入。
 * 纯文本（无标题）原样返回切分结果。
 */
export async function splitDocumentText(text: string): Promise<string[]> {
  const rawChunks = await splitter.splitText(text);
  if (rawChunks.length === 0) return [];
  return injectHeadingContext(text, rawChunks);
}

export interface IngestInput {
  /** 已解析的 Markdown/纯文本（由 @kqa/ai 的 extractText 在上传时完成，队列消费时直接传入） */
  text: string;
  documentId: string;
  filename: string;
  tenantId: string;
}

/** 文档入库：切分 -> 注入章节上下文 -> embedding -> 写入 Milvus，返回 chunk 数 */
export async function ingestDocument(input: IngestInput, config: ModelConfig): Promise<number> {
  const chunks = await splitDocumentText(input.text);
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
