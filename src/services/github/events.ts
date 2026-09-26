import { z } from "zod";
import type { NormalizedEvent, SupportedEventName } from "@/domain/types";
import { supportedEventNames } from "@/domain/types";
import { ValidationError } from "@/lib/errors";

const userSchema = z.object({ login: z.string().min(1).max(255) });
const repositorySchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  name: z.string().min(1).max(255),
  full_name: z.string().min(3).max(512),
  owner: userSchema,
  html_url: z.string().url().optional(),
});
const labelSchema = z.object({ name: z.string().min(1).max(255) });
const issueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().max(2000),
  body: z.string().nullable().optional(),
  html_url: z.string().url(),
  user: userSchema,
  labels: z.array(labelSchema).default([]),
});
const pullRequestSchema = issueSchema;

const baseSchema = z.object({
  action: z.string().max(100).optional(),
  repository: repositorySchema,
  sender: userSchema,
  installation: z.object({ id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]) }).optional(),
});

const issuePayloadSchema = baseSchema.extend({ issue: issueSchema });
const pullRequestPayloadSchema = baseSchema.extend({ pull_request: pullRequestSchema });
const pushPayloadSchema = baseSchema.extend({
  ref: z.string().max(1024),
  compare: z.string().url().optional(),
  head_commit: z.object({ message: z.string().max(10000) }).nullable().optional(),
  pusher: z.object({ name: z.string().max(255) }).optional(),
});

export function isSupportedEvent(value: string): value is SupportedEventName {
  return (supportedEventNames as readonly string[]).includes(value);
}

export function normalizeGithubEvent(eventType: SupportedEventName, deliveryId: string, payload: unknown): NormalizedEvent {
  try {
    if (eventType === "issues") {
      const parsed = issuePayloadSchema.parse(payload);
      return normalizedFromSubject(eventType, deliveryId, parsed, parsed.issue);
    }
    if (eventType === "pull_request") {
      const parsed = pullRequestPayloadSchema.parse(payload);
      return normalizedFromSubject(eventType, deliveryId, parsed, parsed.pull_request);
    }
    const parsed = pushPayloadSchema.parse(payload);
    return {
      deliveryId,
      eventType,
      action: "push",
      repository: repositoryFrom(parsed.repository),
      installationId: parsed.installation ? String(parsed.installation.id) : null,
      actor: parsed.sender.login || parsed.pusher?.name || "unknown",
      title: parsed.head_commit?.message.split("\n", 1)[0] ?? `Push to ${parsed.ref}`,
      body: parsed.head_commit?.message ?? "",
      labels: [],
      url: parsed.compare ?? parsed.repository.html_url ?? `https://github.com/${parsed.repository.full_name}`,
      number: null,
      ref: parsed.ref,
    };
  } catch (error) {
    if (error instanceof z.ZodError) throw new ValidationError(`Malformed ${eventType} webhook payload`);
    throw error;
  }
}

function normalizedFromSubject(
  eventType: "issues" | "pull_request",
  deliveryId: string,
  payload: z.infer<typeof baseSchema>,
  subject: z.infer<typeof issueSchema>,
): NormalizedEvent {
  return {
    deliveryId,
    eventType,
    action: payload.action ?? "unknown",
    repository: repositoryFrom(payload.repository),
    installationId: payload.installation ? String(payload.installation.id) : null,
    actor: subject.user.login || payload.sender.login,
    title: subject.title,
    body: subject.body ?? "",
    labels: subject.labels.map((label) => label.name),
    url: subject.html_url,
    number: subject.number,
    ref: null,
  };
}

function repositoryFrom(repository: z.infer<typeof repositorySchema>): NormalizedEvent["repository"] {
  return {
    githubId: String(repository.id),
    owner: repository.owner.login,
    name: repository.name,
    fullName: repository.full_name,
  };
}
