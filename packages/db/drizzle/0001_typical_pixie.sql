ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_text" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_at" timestamp with time zone;