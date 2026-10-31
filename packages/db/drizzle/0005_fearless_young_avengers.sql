ALTER TABLE "documents" ADD COLUMN "sha256" text;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_tenant_sha256_active_uniq" ON "documents" USING btree ("tenant_id","sha256") WHERE "documents"."deleted_at" is null;
--> statement-breakpoint
-- 旧记录的 MIME 来自浏览器，可能为空或为通用类型；按原解析格式一次性规范化。
UPDATE "documents" SET "mime_type" = CASE
  WHEN lower("filename") ~ '\.pdf$' THEN 'application/pdf'
  WHEN lower("filename") ~ '\.docx$' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  WHEN lower("filename") ~ '\.html?$' THEN 'text/html'
  WHEN lower("filename") ~ '\.(md|markdown)$' THEN 'text/markdown'
  WHEN lower("filename") ~ '\.txt$' THEN 'text/plain'
  ELSE "mime_type"
END;
