CREATE TYPE "public"."activity_status" AS ENUM('info', 'success', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('accepted', 'queued', 'no_match', 'unroutable', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'retry_scheduled', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "action_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"repository_id" uuid,
	"delivery_id" uuid,
	"rule_id" uuid,
	"job_id" uuid,
	"kind" text NOT NULL,
	"status" "activity_status" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"event_type" text NOT NULL,
	"title_contains" text,
	"author_equals" text,
	"label_contains" text,
	"actions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" text NOT NULL,
	"login" text NOT NULL,
	"name" text,
	"email" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" text NOT NULL,
	"repository_id" uuid,
	"user_id" uuid,
	"installation_external_id" text,
	"event_type" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"normalized_event" jsonb,
	"payload_hash" text NOT NULL,
	"status" "delivery_status" DEFAULT 'accepted' NOT NULL,
	"error" text,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"last_duplicate_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "action_jobs" ADD CONSTRAINT "action_jobs_delivery_id_webhook_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_jobs" ADD CONSTRAINT "action_jobs_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_jobs" ADD CONSTRAINT "action_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_jobs" ADD CONSTRAINT "action_jobs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_delivery_id_webhook_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_job_id_action_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."action_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_jobs_delivery_rule_type_unique" ON "action_jobs" USING btree ("delivery_id","rule_id","action_type");--> statement-breakpoint
CREATE INDEX "action_jobs_due_idx" ON "action_jobs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "action_jobs_user_idx" ON "action_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_user_created_idx" ON "activity_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_installation_id_unique" ON "github_installations" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "github_installations_user_idx" ON "github_installations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_github_id_unique" ON "repositories" USING btree ("github_id");--> statement-breakpoint
CREATE INDEX "repositories_user_idx" ON "repositories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "repositories_installation_idx" ON "repositories" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "rules_repository_enabled_idx" ON "rules" USING btree ("repository_id","enabled");--> statement-breakpoint
CREATE INDEX "rules_user_idx" ON "rules" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_github_id_unique" ON "users" USING btree ("github_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_delivery_id_unique" ON "webhook_deliveries" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_user_received_idx" ON "webhook_deliveries" USING btree ("user_id","received_at");