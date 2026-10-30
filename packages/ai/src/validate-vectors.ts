/** 在写入 Milvus 前验证行数、数值和集合维度，避免底层把错误维度解释成额外行。 */
export function validateVectors(vectors: number[][], documentCount: number, expectedDimension?: number): number {
  if (vectors.length !== documentCount) {
    throw new Error(`向量服务返回 ${vectors.length} 条向量，但文档有 ${documentCount} 个分块，请检查 embedding 服务配置。`);
  }
  const dimension = expectedDimension ?? vectors[0]?.length;
  if (!dimension) throw new Error("向量服务返回空向量，请检查 embedding 模型。");
  for (const [index, vector] of vectors.entries()) {
    if (!Array.isArray(vector) || vector.length !== dimension) {
      throw new Error(`第 ${index + 1} 个分块的向量维度为 ${vector?.length ?? 0}，预期 ${dimension}。请使用与现有知识库一致的 embedding 模型；更换模型需要重建向量索引。`);
    }
    if (!vector.every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`第 ${index + 1} 个分块包含无效向量数值，请检查 embedding 服务。`);
    }
  }
  return dimension;
}
