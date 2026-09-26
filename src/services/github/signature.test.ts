import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "@/services/github/signature";

describe("GitHub webhook signature verification", () => {
  const secret = "test-secret";
  const body = Buffer.from('{"action":"opened"}');

  it("accepts the exact body with a correct signature", () => {
    expect(verifyWebhookSignature(body, signWebhookPayload(body, secret), secret)).toBe(true);
  });

  it("rejects an incorrect signature", () => {
    expect(verifyWebhookSignature(body, `sha256=${"0".repeat(64)}`, secret)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });

  it("rejects a modified body even when JSON remains semantically equivalent", () => {
    const signature = signWebhookPayload(body, secret);
    expect(verifyWebhookSignature(Buffer.from('{ "action": "opened" }'), signature, secret)).toBe(false);
  });
});
