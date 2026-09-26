import { describe, expect, it } from "vitest";
import type { NormalizedEvent, RuleDefinition } from "@/domain/types";
import { matchesRule, ruleInputSchema } from "@/services/rules";

const event: NormalizedEvent = {
  deliveryId: "d1", eventType: "issues", action: "opened", repository: { githubId: "1", owner: "acme", name: "app", fullName: "acme/app" },
  installationId: "2", actor: "OctoCat", title: "Critical BUG in checkout", body: "body", labels: ["Needs-Triage", "backend"], url: "https://github.com/acme/app/issues/1", number: 1, ref: null,
};
const baseRule: RuleDefinition = { id: "r1", name: "bugs", eventType: "issues.opened", titleContains: null, authorEquals: null, labelContains: null, actions: [{ type: "slack" }] };

describe("deterministic rules", () => {
  it("matches the event and all optional conditions case-insensitively", () => {
    expect(matchesRule({ ...baseRule, titleContains: "bug", authorEquals: "octocat", labelContains: "needs-triage" }, event)).toBe(true);
  });

  it("does not match an incorrect event, keyword, author, or label", () => {
    expect(matchesRule({ ...baseRule, eventType: "issues.reopened" }, event)).toBe(false);
    expect(matchesRule({ ...baseRule, titleContains: "feature" }, event)).toBe(false);
    expect(matchesRule({ ...baseRule, authorEquals: "someone" }, event)).toBe(false);
    expect(matchesRule({ ...baseRule, labelContains: "frontend" }, event)).toBe(false);
  });

  it("rejects duplicate action types and issue conditions on push rules", () => {
    const duplicate = ruleInputSchema.safeParse({ repositoryId: crypto.randomUUID(), name: "x", eventType: "issues.opened", actions: [{ type: "slack" }, { type: "slack" }], enabled: true });
    const push = ruleInputSchema.safeParse({ repositoryId: crypto.randomUUID(), name: "x", eventType: "push", titleContains: "x", actions: [{ type: "slack" }], enabled: true });
    expect(duplicate.success).toBe(false);
    expect(push.success).toBe(false);
  });
});
