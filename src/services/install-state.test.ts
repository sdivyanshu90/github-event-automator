import { describe, expect, it } from "vitest";
import { validInstallationState } from "@/services/install-state";

describe("GitHub installation state", () => {
  it("accepts the state returned to the initiating browser", () => expect(validInstallationState("known-state", "known-state")).toBe(true));
  it("rejects missing, different, and length-mismatched state", () => {
    expect(validInstallationState("", "")).toBe(false);
    expect(validInstallationState("known-state", "spoof-state")).toBe(false);
    expect(validInstallationState("known-state", "short")).toBe(false);
  });
});
