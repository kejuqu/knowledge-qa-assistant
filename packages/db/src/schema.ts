import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

/** 用户 —— 由 auth app 写入，web app 只读 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 员工上传的知识文档（向量本身存 Milvus，这里存元数据） */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").references(() => users.id).notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    chunkCount: integer("chunk_count").notNull().default(0),
    status: text("status", { enum: ["processing", "ready", "failed"] })
      .notNull()
      .default("processing"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("documents_owner_idx").on(t.ownerId)]
);

/** 问答会话 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").references(() => users.id).notNull(),
    title: text("title").notNull().default("新的对话"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("conversations_owner_idx").on(t.ownerId)]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    /** RAG 命中的文档引用 [{ documentId, filename, chunkIndex, score }] */
    citations: jsonb("citations"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)]
);

/** 每用户/全局的模型配置：apiKey/baseURL 存这里，直接传给 LangChain 初始化 */
export const modelSettings = pgTable("model_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id).notNull().unique(),
  llmBaseUrl: text("llm_base_url").notNull(),
  llmApiKey: text("llm_api_key").notNull(),
  llmModel: text("llm_model").notNull(),
  embeddingBaseUrl: text("embedding_base_url").notNull(),
  embeddingApiKey: text("embedding_api_key").notNull(),
  embeddingModel: text("embedding_model").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ModelSetting = typeof modelSettings.$inferSelect;
