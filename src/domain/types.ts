export const supportedEventNames = ["issues", "pull_request", "push"] as const;
export type SupportedEventName = (typeof supportedEventNames)[number];

export const ruleEventTypes = [
  "issues.opened",
  "issues.reopened",
  "pull_request.opened",
  "pull_request.reopened",
  "pull_request.synchronize",
  "push",
] as const;
export type RuleEventType = (typeof ruleEventTypes)[number];

export const actionTypes = ["add_label", "post_comment", "slack", "ai_triage"] as const;
export type ActionType = (typeof actionTypes)[number];

export type RuleAction =
  | { type: "add_label"; label: string }
  | { type: "post_comment"; body: string }
  | { type: "slack" }
  | { type: "ai_triage" };

export interface NormalizedEvent {
  deliveryId: string;
  eventType: SupportedEventName;
  action: string;
  repository: {
    githubId: string;
    owner: string;
    name: string;
    fullName: string;
  };
  installationId: string | null;
  actor: string;
  title: string;
  body: string;
  labels: string[];
  url: string;
  number: number | null;
  ref: string | null;
}

export interface RuleDefinition {
  id: string;
  name: string;
  eventType: RuleEventType;
  titleContains: string | null;
  authorEquals: string | null;
  labelContains: string | null;
  actions: RuleAction[];
}

export interface AITriageResult {
  summary: string;
  suggestedLabel: string;
  priority: "low" | "medium" | "high";
  reason: string;
}
