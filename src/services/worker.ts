import { and, eq, inArray, sql } from "drizzle-orm";
import { database } from "@/db";
import { actionJobs, activityLogs, githubInstallations, repositories } from "@/db/schema";
import type { ActionJob } from "@/db/schema";
import type { AITriageResult } from "@/domain/types";
import { AppError, ConfigurationError, errorDetails, ProviderError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { GeminiClient } from "@/services/ai";
import { GitHubClient } from "@/services/github/client";
import { nextRetryDate } from "@/services/retry";
import { SlackClient } from "@/services/slack";

interface WorkerDependencies {
  github: GitHubClient;
  slack: SlackClient;
  ai: GeminiClient;
}

const defaultDependencies: WorkerDependencies = {
  github: new GitHubClient(),
  slack: new SlackClient(),
  ai: new GeminiClient(),
};

export async function claimNextJob(): Promise<ActionJob | null> {
  const db = database();
  return db.transaction(async (transaction) => {
    const claimed = await transaction.execute(sql<{ id: string }>`
      WITH candidate AS (
        SELECT id
        FROM action_jobs
        WHERE (
          (status IN ('pending', 'retry_scheduled') AND next_retry_at <= now())
          OR (status = 'running' AND locked_at < now() - interval '10 minutes')
        )
        AND attempt_count < max_attempts
        ORDER BY
          CASE action_type WHEN 'ai_triage' THEN 0 WHEN 'add_label' THEN 1 WHEN 'post_comment' THEN 2 ELSE 3 END,
          next_retry_at ASC,
          created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE action_jobs AS job
      SET status = 'running', locked_at = now(), attempt_count = attempt_count + 1, updated_at = now()
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.id
    `);
    const id = (claimed[0] as { id?: string } | undefined)?.id;
    if (!id) return null;
    const [job] = await transaction.select().from(actionJobs).where(eq(actionJobs.id, id)).limit(1);
    return job ?? null;
  });
}

export async function runWorker(batchSize = 10, dependencies = defaultDependencies): Promise<{ processed: number; succeeded: number; failed: number }> {
  const boundedSize = Math.max(1, Math.min(batchSize, 50));
  const summary = { processed: 0, succeeded: 0, failed: 0 };
  await database()
    .update(actionJobs)
    .set({ status: "failed", lastError: "Worker lease expired after the final attempt", lockedAt: null, updatedAt: new Date() })
    .where(sql`${actionJobs.status} = 'running' AND ${actionJobs.lockedAt} < now() - interval '10 minutes' AND ${actionJobs.attemptCount} >= ${actionJobs.maxAttempts}`);
  for (let index = 0; index < boundedSize; index += 1) {
    const job = await claimNextJob();
    if (!job) break;
    summary.processed += 1;
    const succeeded = await processJob(job, dependencies);
    if (succeeded) summary.succeeded += 1;
    else summary.failed += 1;
  }
  return summary;
}

export async function processJob(job: ActionJob, dependencies = defaultDependencies): Promise<boolean> {
  const started = Date.now();
  try {
    const result = await executeJob(job, dependencies);
    await database().transaction(async (transaction) => {
      await transaction
        .update(actionJobs)
        .set({ status: "completed", result, lastError: null, lockedAt: null, completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(actionJobs.id, job.id), eq(actionJobs.status, "running")));
      await transaction.insert(activityLogs).values({
        userId: job.userId,
        repositoryId: job.repositoryId,
        deliveryId: job.deliveryId,
        ruleId: job.ruleId,
        jobId: job.id,
        kind: `${job.actionType}_completed`,
        status: "success",
        message: actionSuccessMessage(job.actionType),
        metadata: { attempt: job.attemptCount },
      });
    });
    logger.info("Action job completed", { jobId: job.id, action: job.actionType, attempt: job.attemptCount, durationMs: Date.now() - started, status: "completed" });
    return true;
  } catch (error) {
    const details = errorDetails(error);
    if (job.actionType === "ai_triage" && error instanceof ConfigurationError) {
      await markSkipped(job, details.safeMessage);
      return true;
    }
    const retryAt = details.retryable && job.attemptCount < job.maxAttempts ? nextRetryDate(job.attemptCount) : null;
    const status = retryAt ? "retry_scheduled" : "failed";
    await database().transaction(async (transaction) => {
      await transaction
        .update(actionJobs)
        .set({ status, nextRetryAt: retryAt ?? job.nextRetryAt, lastError: details.safeMessage, lockedAt: null, updatedAt: new Date() })
        .where(and(eq(actionJobs.id, job.id), eq(actionJobs.status, "running")));
      await transaction.insert(activityLogs).values({
        userId: job.userId,
        repositoryId: job.repositoryId,
        deliveryId: job.deliveryId,
        ruleId: job.ruleId,
        jobId: job.id,
        kind: retryAt ? "retry_scheduled" : "action_failed",
        status: retryAt ? "warning" : "error",
        message: retryAt ? `${job.actionType} retry scheduled` : `${job.actionType} failed permanently`,
        metadata: { attempt: job.attemptCount, error: details.safeMessage, nextRetryAt: retryAt?.toISOString() },
      });
    });
    logger.error("Action job failed", {
      jobId: job.id,
      action: job.actionType,
      attempt: job.attemptCount,
      status,
      retryable: details.retryable,
      error: details.safeMessage,
      durationMs: Date.now() - started,
    });
    return false;
  }
}

async function executeJob(job: ActionJob, dependencies: WorkerDependencies): Promise<Record<string, unknown> | AITriageResult> {
  const { event, action, ruleName } = job.payload;
  const db = database();
  const [repository] = await db
    .select({ installationId: githubInstallations.installationId })
    .from(repositories)
    .innerJoin(githubInstallations, eq(repositories.installationId, githubInstallations.id))
    .where(and(eq(repositories.id, job.repositoryId), eq(repositories.active, true), eq(githubInstallations.active, true)))
    .limit(1);
  if (!repository) throw new ProviderError("Repository installation is inactive", "GITHUB_API", false, 404, "The repository installation is no longer active");

  if (action.type === "add_label") {
    if (!event.number) throw new ProviderError("Event has no issue number", "GITHUB_API", false, 422, "Labels require an issue or pull request event");
    await dependencies.github.addLabel(repository.installationId, event.repository.owner, event.repository.name, event.number, action.label);
    return { label: action.label };
  }
  if (action.type === "post_comment") {
    if (!event.number) throw new ProviderError("Event has no issue number", "GITHUB_API", false, 422, "Comments require an issue or pull request event");
    return dependencies.github.postComment(
      repository.installationId,
      event.repository.owner,
      event.repository.name,
      event.number,
      action.body,
      `github-event-automator:${job.id}`,
    );
  }
  if (action.type === "ai_triage") return dependencies.ai.triage(event);
  if (action.type === "slack") {
    const [aiJob] = await db
      .select({ result: actionJobs.result })
      .from(actionJobs)
      .where(and(eq(actionJobs.deliveryId, job.deliveryId), eq(actionJobs.ruleId, job.ruleId), eq(actionJobs.actionType, "ai_triage"), eq(actionJobs.status, "completed")))
      .limit(1);
    await dependencies.slack.notify({ event, ruleName, ai: aiJob?.result as AITriageResult | undefined });
    return { delivered: true };
  }
  throw new AppError(`Unsupported action type: ${job.actionType}`, "VALIDATION", false, 422, "Unsupported action type");
}

async function markSkipped(job: ActionJob, reason: string): Promise<void> {
  await database().transaction(async (transaction) => {
    await transaction
      .update(actionJobs)
      .set({ status: "skipped", lastError: reason, lockedAt: null, completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(actionJobs.id, job.id), eq(actionJobs.status, "running")));
    await transaction.insert(activityLogs).values({
      userId: job.userId,
      repositoryId: job.repositoryId,
      deliveryId: job.deliveryId,
      ruleId: job.ruleId,
      jobId: job.id,
      kind: "ai_triage_skipped",
      status: "warning",
      message: "AI triage skipped because it is not configured",
      metadata: {},
    });
  });
}

function actionSuccessMessage(actionType: string): string {
  const messages: Record<string, string> = {
    add_label: "GitHub label added",
    post_comment: "GitHub comment posted",
    slack: "Slack notification delivered",
    ai_triage: "AI triage completed",
  };
  return messages[actionType] ?? "Action completed";
}

export async function retryFailedJob(userId: string, jobId: string): Promise<boolean> {
  const updated = await database()
    .update(actionJobs)
    .set({ status: "pending", attemptCount: 0, nextRetryAt: new Date(), lastError: null, lockedAt: null, updatedAt: new Date() })
    .where(and(eq(actionJobs.id, jobId), eq(actionJobs.userId, userId), inArray(actionJobs.status, ["failed", "skipped"])))
    .returning({ id: actionJobs.id });
  return updated.length === 1;
}
