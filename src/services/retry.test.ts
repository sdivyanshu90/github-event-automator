import { describe, expect, it } from "vitest";
import { nextRetryDate } from "@/services/retry";

describe("bounded retry schedule", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  it.each([[1, 30], [2, 120], [3, 600], [4, 1800]])("schedules attempt %i after %i seconds", (attempt, seconds) => {
    expect(nextRetryDate(attempt, now)?.getTime()).toBe(now.getTime() + seconds * 1000);
  });
  it("stops after the bounded schedule", () => expect(nextRetryDate(5, now)).toBeNull());
});
