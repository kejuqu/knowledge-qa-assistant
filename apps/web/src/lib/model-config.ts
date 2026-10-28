import { eq } from "drizzle-orm";
import { db, modelSettings } from "@kqa/db";
import { getDefaultModelConfig, type ModelConfig } from "@kqa/ai";

/**
 * 模型配置优先级：用户在 settings 页保存的配置 > 环境变量默认值
 * 配置（含 apiKey/baseURL）原样传给 LangChain 的 ChatOpenAI/OpenAIEmbeddings 初始化
 */
export async function getModelConfigForUser(userId: string): Promise<ModelConfig> {
  const [row] = await db
    .select()
    .from(modelSettings)
    .where(eq(modelSettings.ownerId, userId))
    .limit(1);

  const fallback = getDefaultModelConfig();
  if (!row) return fallback;

  return {
    llmBaseUrl: row.llmBaseUrl || fallback.llmBaseUrl,
    llmApiKey: row.llmApiKey || fallback.llmApiKey,
    llmModel: row.llmModel || fallback.llmModel,
    embeddingBaseUrl: row.embeddingBaseUrl || fallback.embeddingBaseUrl,
    embeddingApiKey: row.embeddingApiKey || fallback.embeddingApiKey,
    embeddingModel: row.embeddingModel || fallback.embeddingModel,
  };
}
