import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

export function signWebhookPayload(rawBody: Uint8Array, secret: string): string {
  return `${SIGNATURE_PREFIX}${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifyWebhookSignature(rawBody: Uint8Array, signature: string | null, secret: string): boolean {
  if (!signature?.startsWith(SIGNATURE_PREFIX)) return false;
  const expected = Buffer.from(signWebhookPayload(rawBody, secret), "utf8");
  const received = Buffer.from(signature, "utf8");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
