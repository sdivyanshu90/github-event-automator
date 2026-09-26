DROP INDEX "rules_repository_enabled_idx";--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "rules_repository_enabled_idx" ON "rules" USING btree ("repository_id","enabled","deleted_at");