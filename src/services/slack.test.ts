import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizedEvent } from "@/domain/types";
import { ConfigurationError, ProviderError } from "@/lib/errors";
import { SlackClient } from "@/services/slack";

const event: NormalizedEvent = { deliveryId: "d", eventType: "issues", action: "opened", repository: { githubId: "1", owner: "acme", name: "app", fullName: "acme/app" }, installationId: "2", actor: "alice", title: "Bug", body: "", labels: [], url: "https://github.com/acme/app/issues/1", number: 1, ref: null };
afterEach(() => vi.unstubAllEnvs());

describe("Slack adapter", () => {
  it("sends useful structured context", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/fake/test/value");
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { blocks: Array<{ text: { text: string } }> };
      expect(body.blocks[0]?.text.text).toContain("acme/app");
      expect(body.blocks[0]?.text.text).toContain("alice");
      expect(body.blocks[0]?.text.text).toContain("Bug rule");
      return new Response("ok", { status: 200 });
    });
    await new SlackClient(fetcher as typeof fetch).notify({ event, ruleName: "Bug rule" });
  });

  it("classifies 500 as retryable and missing configuration as permanent", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/fake/test/value");
    const client = new SlackClient(vi.fn(async () => new Response("down", { status: 500 })) as typeof fetch);
    await expect(client.notify({ event, ruleName: "rule" })).rejects.toMatchObject({ retryable: true });
    vi.stubEnv("SLACK_WEBHOOK_URL", "");
    await expect(client.notify({ event, ruleName: "rule" })).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("classifies invalid Slack requests as terminal", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/fake/test/value");
    const client = new SlackClient(vi.fn(async () => new Response("invalid_payload", { status: 400 })) as typeof fetch);
    await expect(client.notify({ event, ruleName: "rule" })).rejects.toMatchObject({ retryable: false } satisfies Partial<ProviderError>);
  });
});
