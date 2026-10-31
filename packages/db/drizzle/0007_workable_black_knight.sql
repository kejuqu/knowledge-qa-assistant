ALTER TABLE "notifications" ALTER COLUMN "body" SET DATA TYPE jsonb
USING jsonb_build_object('message', "body", 'legacy', true);
