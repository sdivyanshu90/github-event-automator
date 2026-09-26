import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AITriageResult, NormalizedEvent, RuleAction } from "@/domain/types";

export const deliveryStatus = pgEnum("delivery_status", ["accepted", "queued", "no_match", "unroutable", "failed"]);
export const jobStatus = pgEnum("job_status", ["pending", "running", "retry_scheduled", "completed", "failed", "skipped"]);
export const activityStatus = pgEnum("activity_status", ["info", "success", "warning", "error"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    githubId: text("github_id").notNull(),
    login: text("login").notNull(),
    name: text("name"),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    githubTokenEncrypted: text("github_token_encrypted"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_github_id_unique").on(table.githubId)],
);

export const githubInstallations = pgTable(
  "github_installations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    installationId: text("installation_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("github_installations_installation_id_unique").on(table.installationId),
    index("github_installations_user_idx").on(table.userId),
  ],
);

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    githubId: text("github_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    installationId: uuid("installation_id").notNull().references(() => githubInstallations.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("repositories_github_id_unique").on(table.githubId),
    index("repositories_user_idx").on(table.userId),
    index("repositories_installation_idx").on(table.installationId),
  ],
);

export const rules = pgTable(
  "rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    eventType: text("event_type").notNull(),
    titleContains: text("title_contains"),
    authorEquals: text("author_equals"),
    labelContains: text("label_contains"),
    actions: jsonb("actions").$type<RuleAction[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("rules_repository_enabled_idx").on(table.repositoryId, table.enabled, table.deletedAt), index("rules_user_idx").on(table.userId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deliveryId: text("delivery_id").notNull(),
    repositoryId: uuid("repository_id").references(() => repositories.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    installationExternalId: text("installation_external_id"),
    eventType: text("event_type").notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    normalizedEvent: jsonb("normalized_event").$type<NormalizedEvent>(),
    payloadHash: text("payload_hash").notNull(),
    status: deliveryStatus("status").default("accepted").notNull(),
    error: text("error"),
    duplicateCount: integer("duplicate_count").default(0).notNull(),
    lastDuplicateAt: timestamp("last_duplicate_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("webhook_deliveries_delivery_id_unique").on(table.deliveryId),
    index("webhook_deliveries_user_received_idx").on(table.userId, table.receivedAt),
  ],
);

export const actionJobs = pgTable(
  "action_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deliveryId: uuid("delivery_id").notNull().references(() => webhookDeliveries.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").notNull().references(() => rules.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    payload: jsonb("payload").$type<{ event: NormalizedEvent; action: RuleAction; ruleName: string }>().notNull(),
    result: jsonb("result").$type<Record<string, unknown> | AITriageResult>(),
    status: jobStatus("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("action_jobs_delivery_rule_type_unique").on(table.deliveryId, table.ruleId, table.actionType),
    index("action_jobs_due_idx").on(table.status, table.nextRetryAt),
    index("action_jobs_user_idx").on(table.userId, table.createdAt),
  ],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").references(() => repositories.id, { onDelete: "set null" }),
    deliveryId: uuid("delivery_id").references(() => webhookDeliveries.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => actionJobs.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    status: activityStatus("status").default("info").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("activity_logs_user_created_idx").on(table.userId, table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Repository = typeof repositories.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type ActionJob = typeof actionJobs.$inferSelect;
