import "server-only";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { database } from "@/db";
import { actionJobs, activityLogs, repositories, rules, webhookDeliveries } from "@/db/schema";

export async function overviewForUser(userId: string) {
  const db = database();
  const [[repoCount], [ruleCount], [eventCount], [successCount], [failureCount], recent] = await Promise.all([
    db.select({ value: count() }).from(repositories).where(and(eq(repositories.userId, userId), eq(repositories.active, true))),
    db.select({ value: count() }).from(rules).where(and(eq(rules.userId, userId), eq(rules.enabled, true), isNull(rules.deletedAt))),
    db.select({ value: count() }).from(webhookDeliveries).where(eq(webhookDeliveries.userId, userId)),
    db.select({ value: count() }).from(actionJobs).where(and(eq(actionJobs.userId, userId), eq(actionJobs.status, "completed"))),
    db.select({ value: count() }).from(actionJobs).where(and(eq(actionJobs.userId, userId), eq(actionJobs.status, "failed"))),
    db
      .select({
        id: activityLogs.id,
        createdAt: activityLogs.createdAt,
        kind: activityLogs.kind,
        status: activityLogs.status,
        message: activityLogs.message,
        repository: repositories.fullName,
      })
      .from(activityLogs)
      .leftJoin(repositories, eq(activityLogs.repositoryId, repositories.id))
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(8),
  ]);
  return {
    connectedRepositories: repoCount?.value ?? 0,
    activeRules: ruleCount?.value ?? 0,
    receivedEvents: eventCount?.value ?? 0,
    successfulActions: successCount?.value ?? 0,
    failedActions: failureCount?.value ?? 0,
    recent,
  };
}

export function repositoriesForUser(userId: string) {
  return database().select().from(repositories).where(eq(repositories.userId, userId)).orderBy(repositories.fullName);
}

export function rulesForUser(userId: string) {
  return database()
    .select({
      id: rules.id,
      name: rules.name,
      enabled: rules.enabled,
      eventType: rules.eventType,
      titleContains: rules.titleContains,
      authorEquals: rules.authorEquals,
      labelContains: rules.labelContains,
      actions: rules.actions,
      repository: repositories.fullName,
      repositoryId: repositories.id,
      updatedAt: rules.updatedAt,
    })
    .from(rules)
    .innerJoin(repositories, eq(rules.repositoryId, repositories.id))
    .where(and(eq(rules.userId, userId), isNull(rules.deletedAt)))
    .orderBy(desc(rules.updatedAt));
}

export async function ruleForUser(userId: string, ruleId: string) {
  const [rule] = await database().select().from(rules).where(and(eq(rules.id, ruleId), eq(rules.userId, userId), isNull(rules.deletedAt))).limit(1);
  return rule;
}

export function activityForUser(userId: string, status?: string) {
  const validStatuses = ["info", "success", "warning", "error"] as const;
  const statusCondition = validStatuses.includes(status as (typeof validStatuses)[number])
    ? eq(activityLogs.status, status as (typeof validStatuses)[number])
    : undefined;
  return database()
    .select({
      id: activityLogs.id,
      createdAt: activityLogs.createdAt,
      repository: repositories.fullName,
      eventType: webhookDeliveries.eventType,
      eventAction: webhookDeliveries.action,
      ruleName: rules.name,
      actionType: actionJobs.actionType,
      status: activityLogs.status,
      message: activityLogs.message,
      attempts: actionJobs.attemptCount,
      error: actionJobs.lastError,
      result: actionJobs.result,
    })
    .from(activityLogs)
    .leftJoin(repositories, eq(activityLogs.repositoryId, repositories.id))
    .leftJoin(webhookDeliveries, eq(activityLogs.deliveryId, webhookDeliveries.id))
    .leftJoin(rules, eq(activityLogs.ruleId, rules.id))
    .leftJoin(actionJobs, eq(activityLogs.jobId, actionJobs.id))
    .where(and(eq(activityLogs.userId, userId), statusCondition))
    .orderBy(desc(activityLogs.createdAt))
    .limit(100);
}

export function failuresForUser(userId: string) {
  return database()
    .select({
      id: actionJobs.id,
      actionType: actionJobs.actionType,
      status: actionJobs.status,
      attemptCount: actionJobs.attemptCount,
      maxAttempts: actionJobs.maxAttempts,
      nextRetryAt: actionJobs.nextRetryAt,
      lastError: actionJobs.lastError,
      createdAt: actionJobs.createdAt,
      repository: repositories.fullName,
      ruleName: rules.name,
    })
    .from(actionJobs)
    .innerJoin(repositories, eq(actionJobs.repositoryId, repositories.id))
    .innerJoin(rules, eq(actionJobs.ruleId, rules.id))
    .where(and(eq(actionJobs.userId, userId), inArray(actionJobs.status, ["failed", "retry_scheduled", "running"])))
    .orderBy(desc(actionJobs.updatedAt))
    .limit(100);
}

export async function recentDeliveriesForUser(userId: string) {
  return database()
    .select({
      id: webhookDeliveries.id,
      deliveryId: webhookDeliveries.deliveryId,
      repository: repositories.fullName,
      eventType: webhookDeliveries.eventType,
      action: webhookDeliveries.action,
      status: webhookDeliveries.status,
      duplicateCount: webhookDeliveries.duplicateCount,
      receivedAt: webhookDeliveries.receivedAt,
      jobCount: sql<number>`count(${actionJobs.id})::int`,
    })
    .from(webhookDeliveries)
    .leftJoin(repositories, eq(webhookDeliveries.repositoryId, repositories.id))
    .leftJoin(actionJobs, eq(webhookDeliveries.id, actionJobs.deliveryId))
    .where(eq(webhookDeliveries.userId, userId))
    .groupBy(webhookDeliveries.id, repositories.fullName)
    .orderBy(desc(webhookDeliveries.receivedAt))
    .limit(50);
}
