const RETRY_DELAYS_SECONDS = [30, 120, 600, 1800] as const;

export function nextRetryDate(attemptCount: number, now = new Date()): Date | null {
  const delaySeconds = RETRY_DELAYS_SECONDS[attemptCount - 1];
  return delaySeconds === undefined ? null : new Date(now.getTime() + delaySeconds * 1000);
}
