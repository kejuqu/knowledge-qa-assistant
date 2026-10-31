import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index, uniqueIndex, unique, customType } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array }>({
  dataType() {
    return "bytea";
  },
});

/** 用户 —— 由 auth app 写入，web app 只读 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 租户（企业/团队）—— 数据隔离的边界 */
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 租户成员：role 决定能否管理知识库/模型配置 */
export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("tenant_members_tenant_user_uniq").on(t.tenantId, t.userId),
    index("tenant_members_user_idx").on(t.userId),
  ]
);

/** 员工上传的知识文档（向量本身存 Milvus，这里存元数据）；归属租户，ownerId 仅记录上传人 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),
    ownerId: uuid("owner_id").references(() => users.id).notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    /** 原始文件字节的 SHA-256；旧文档允许为空。 */
    sha256: text("sha256"),
    sizeBytes: integer("size_bytes").notNull(),
    chunkCount: integer("chunk_count").notNull().default(0),
    status: text("status", { enum: ["pending", "processing", "ready", "failed"] })
      .notNull()
      .default("pending"),
    error: text("error"),
    /** 上传时提取的原文，用于失败后不必重新上传即可重新入库。 */
    sourceText: text("source_text"),
    /** MinIO 对象 key 与持久化地址；bucket 保持私有，通过鉴权接口读取。 */
    objectKey: text("object_key"),
    objectUrl: text("object_url"),
    /** 兼容迁移到 MinIO 之前上传的文档；新上传不再写入此列。 */
    fileData: bytea("file_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    /** 软删除：有值表示已删除，列表查询默认过滤掉 */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("documents_tenant_idx").on(t.tenantId),
    uniqueIndex("documents_tenant_sha256_active_uniq")
      .on(t.tenantId, t.sha256)
      .where(sql`${t.deletedAt} is null`),
  ]
);

/** 问答会话 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").references(() => users.id).notNull(),
    title: text("title").notNull().default("新的对话"),
    pinned: boolean("pinned").notNull().default(false),
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
    /** RAG 命中的引用段落 [{ documentId, filename, chunkIndex, content, score }] */
    citations: jsonb("citations"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)]
);

/** 租户级模型配置：apiKey/baseURL 存这里，直接传给 LangChain 初始化；仅 admin 可改 */
export const modelSettings = pgTable("model_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id).notNull().unique(),
  llmBaseUrl: text("llm_base_url").notNull(),
  llmApiKey: text("llm_api_key").notNull(),
  llmModel: text("llm_model").notNull(),
  embeddingBaseUrl: text("embedding_base_url").notNull(),
  embeddingApiKey: text("embedding_api_key").notNull(),
  embeddingModel: text("embedding_model").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type TenantMember = typeof tenantMembers.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ModelSetting = typeof modelSettings.$inferSelect;
