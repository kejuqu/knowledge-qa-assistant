import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";

/**
 * 模型配置：任何 OpenAI 兼容协议的服务都能接入
 * - OpenAI:        https://api.openai.com/v1
 * - DeepSeek:      https://api.deepseek.com/v1
 * - Ollama(本地):  http://localhost:11434/v1
 * - 企业内部网关:    https://llm-gateway.corp.internal/v1
 */
export interface ModelConfig {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
}

/** 从环境变量读取的兜底配置（用户未在 settings 页配置时使用） */
export function getDefaultModelConfig(): ModelConfig {
  return {
    llmBaseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
    llmApiKey: process.env.LLM_API_KEY ?? "",
    llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
    embeddingBaseUrl: process.env.EMBEDDING_BASE_URL ?? "https://api.openai.com/v1",
    embeddingApiKey: process.env.EMBEDDING_API_KEY ?? "",
    embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  };
}

/** 用配置直接初始化 LangChain ChatModel —— 本地模型走 OpenAI 兼容接口即可 */
export function createChatModel(config: ModelConfig, streaming = true) {
  return new ChatOpenAI({
    model: config.llmModel,
    apiKey: config.llmApiKey || "not-needed-for-local",
    configuration: { baseURL: config.llmBaseUrl },
    streaming,
    temperature: 0.2,
  });
}

export function createEmbeddings(config: ModelConfig) {
  return new OpenAIEmbeddings({
    model: config.embeddingModel,
    apiKey: config.embeddingApiKey || "not-needed-for-local",
    configuration: { baseURL: config.embeddingBaseUrl },
  });
}
