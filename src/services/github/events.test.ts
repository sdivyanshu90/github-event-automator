import { describe, expect, it } from "vitest";
import { normalizeGithubEvent } from "@/services/github/events";
import { ValidationError } from "@/lib/errors";

const repository = { id: 123, name: "project", full_name: "acme/project", owner: { login: "acme" }, html_url: "https://github.com/acme/project" };
const sender = { login: "sender" };
const installation = { id: 456 };

describe("GitHub event normalization", () => {
  it("normalizes an issue without retaining the large provider shape", () => {
    const event = normalizeGithubEvent("issues", "delivery-1", {
      action: "opened", repository, sender, installation,
      issue: { number: 42, title: "Bug: broken", body: "Details", html_url: "https://github.com/acme/project/issues/42", user: { login: "alice" }, labels: [{ name: "bug" }] },
      ignored: { huge: "provider field" },
    });
    expect(event).toMatchObject({ deliveryId: "delivery-1", eventType: "issues", action: "opened", actor: "alice", number: 42, labels: ["bug"] });
    expect(event).not.toHaveProperty("ignored");
  });

  it("normalizes pull requests and pushes", () => {
    const pull = normalizeGithubEvent("pull_request", "delivery-2", {
      action: "synchronize", repository, sender, installation,
      pull_request: { number: 7, title: "Update", body: null, html_url: "https://github.com/acme/project/pull/7", user: { login: "bob" }, labels: [] },
    });
    const push = normalizeGithubEvent("push", "delivery-3", { repository, sender, installation, ref: "refs/heads/main", compare: "https://github.com/acme/project/compare/a...b", head_commit: { message: "Ship it\nmore" } });
    expect(pull.action).toBe("synchronize");
    expect(push).toMatchObject({ action: "push", title: "Ship it", ref: "refs/heads/main", number: null });
  });

  it("rejects malformed supported payloads", () => {
    expect(() => normalizeGithubEvent("issues", "delivery-4", { action: "opened" })).toThrow(ValidationError);
  });
});
