import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

afterEach(() => vi.unstubAllEnvs());

describe("stored credential encryption", () => {
  it("round-trips without embedding plaintext", () => {
    vi.stubEnv("AUTH_SECRET", "first-test-key-with-sufficient-entropy");
    const encrypted = encryptSecret("github-user-token");
    expect(encrypted).not.toContain("github-user-token");
    expect(decryptSecret(encrypted)).toBe("github-user-token");
  });

  it("fails authentication under a different key", () => {
    vi.stubEnv("AUTH_SECRET", "first-test-key-with-sufficient-entropy");
    const encrypted = encryptSecret("github-user-token");
    vi.stubEnv("AUTH_SECRET", "different-test-key-with-enough-entropy");
    expect(() => decryptSecret(encrypted)).toThrow();
  });
});
