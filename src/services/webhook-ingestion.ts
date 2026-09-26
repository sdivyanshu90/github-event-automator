import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { database } from "@/db";
import { actionJobs, activityLogs, githubInstallations, repositories, rules, webhookDeliveries } from "@/db/schema";
import type { RuleDefinition } from "@/domain/types";
import { ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isSupportedEvent, normalizeGithubEvent } from "@/services/github/events";
import { matchesRule } from "@/services/rules";

export interface WebhookInput {
  deliveryId: string;
  eventType: string;
  rawBody: Uint8Array;
  payload: unknown;
}

export type IngestionResult =
  | { outcome: "duplicate"; deliveryId: string; payloadMismatch: boolean }
  | { outcome: "accepted"; deliveryId: string; jobsCreated: number; status: "queued" | "no_match" | "unroutable" };

export async function ingestWebhook(input: WebhookInput): Promise<IngestionResult> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(input.deliveryId)) throw new ValidationError("Invalid X-GitHub-Delivery header");
  if (!/^[a-z_]{1,100}$/.test(input.eventType)) throw new ValidationError("Invalid X-GitHub-Event header");
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) throw new ValidationError("Webhook payload must be a JSON object");

  const payload = input.payload as Record<string, unknown>;
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
  const normalized = isSupportedEvent(input.eventType) ? normalizeGithubEvent(input.eventType, input.deliveryId, payload) : null;
  const db = database();

  return db.transaction(async (transaction) => {
    let repository: typeof repositories.$inferSelect | undefined;
    if (normalized) {
      [repository] = await transaction.select().from(repositories).where(eq(repositories.githubId, normalized.repository.githubId)).limit(1);
      if (!repository && normalized.installationId) {
        const [installation] = await transaction
          .select()
          .from(githubInstallations)
          .where(and(eq(githubInstallations.installationId, normalized.installationId), eq(githubInstallations.active, true)))
          .limit(1);
        if (installation) {
          [repository] = await transaction
            .insert(repositories)
            .values({
              ...normalized.repository,
              userId: installation.userId,
              installationId: installation.id,
              active: true,
            })
            .onConflictDoUpdate({
              target: repositories.githubId,
              set: {
                owner: normalized.repository.owner,
                name: normalized.repository.name,
                fullName: normalized.repository.fullName,
                updatedAt: new Date(),
              },
            })
            .returning();
        }
      }
    }

    const [delivery] = await transaction
      .insert(webhookDeliveries)
      .values({
        deliveryId: input.deliveryId,
        repositoryId: repository?.id ?? null,
        userId: repository?.userId ?? null,
        installationExternalId: normalized?.installationId ?? null,
        eventType: input.eventType,
        action: normalized?.action ?? String(payload.action ?? "unknown").slice(0, 100),
        payload,
        normalizedEvent: normalized,
        payloadHash,
        status: repository?.active ? "accepted" : "unroutable",
      })
      .onConflictDoNothing({ target: webhookDeliveries.deliveryId })
      .returning();

    if (!delivery) {
      const [existing] = await transaction
        .select({ id: webhookDeliveries.id, payloadHash: webhookDeliveries.payloadHash })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.deliveryId, input.deliveryId))
        .limit(1);
      await transaction
        .update(webhookDeliveries)
        .set({ duplicateCount: sql`${webhookDeliveries.duplicateCount} + 1`, lastDuplicateAt: new Date() })
        .where(eq(webhookDeliveries.deliveryId, input.deliveryId));
      const payloadMismatch = existing?.payloadHash !== payloadHash;
      logger.warn("Duplicate webhook delivery ignored", { deliveryId: input.deliveryId, payloadMismatch });
      return { outcome: "duplicate", deliveryId: input.deliveryId, payloadMismatch };
    }

    if (!normalized || !repository?.active) {
      await transaction.update(webhookDeliveries).set({ status: "unroutable", processedAt: new Date() }).where(eq(webhookDeliveries.id, delivery.id));
      logger.info("Webhook persisted without connected repository", { deliveryId: input.deliveryId, eventType: input.eventType });
      return { outcome: "accepted", deliveryId: input.deliveryId, jobsCreated: 0, status: "unroutable" };
    }

    await transaction.insert(activityLogs).values({
      userId: repository.userId,
      repositoryId: repository.id,
      deliveryId: delivery.id,
      kind: "webhook_received",
      message: `Received ${normalized.eventType}.${normalized.action}`,
      metadata: { deliveryId: input.deliveryId, eventType: input.eventType },
    });

    const candidates = await transaction.select().from(rules).where(and(eq(rules.repositoryId, repository.id), eq(rules.enabled, true), isNull(rules.deletedAt)));
    let jobsCreated = 0;
    for (const candidate of candidates) {
      const definition: RuleDefinition = {
        id: candidate.id,
        name: candidate.name,
        eventType: candidate.eventType as RuleDefinition["eventType"],
        titleContains: candidate.titleContains,
        authorEquals: candidate.authorEquals,
        labelContains: candidate.labelContains,
        actions: candidate.actions,
      };
      if (!matchesRule(definition, normalized)) continue;
      await transaction.insert(activityLogs).values({
        userId: repository.userId,
        repositoryId: repository.id,
        deliveryId: delivery.id,
        ruleId: candidate.id,
        kind: "rule_matched",
        message: `Rule “${candidate.name}” matched`,
        metadata: { ruleId: candidate.id },
      });
      for (const action of candidate.actions) {
        const inserted = await transaction
          .insert(actionJobs)
          .values({
            deliveryId: delivery.id,
            ruleId: candidate.id,
            userId: repository.userId,
            repositoryId: repository.id,
            actionType: action.type,
            payload: { event: normalized, action, ruleName: candidate.name },
          })
          .onConflictDoNothing({ target: [actionJobs.deliveryId, actionJobs.ruleId, actionJobs.actionType] })
          .returning({ id: actionJobs.id });
        jobsCreated += inserted.length;
      }
    }

    const status = jobsCreated > 0 ? "queued" : "no_match";
    await transaction.update(webhookDeliveries).set({ status, processedAt: new Date() }).where(eq(webhookDeliveries.id, delivery.id));
    logger.info("Webhook ingestion completed", {
      deliveryId: input.deliveryId,
      repositoryId: repository.githubId,
      eventType: input.eventType,
      action: normalized.action,
      jobsCreated,
      status,
    });
    return { outcome: "accepted", deliveryId: input.deliveryId, jobsCreated, status };
  });
}
