import { after, NextResponse } from "next/server";
import { requiredEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { verifyWebhookSignature } from "@/services/github/signature";
import { ingestWebhook } from "@/services/webhook-ingestion";
import { runWorker } from "@/services/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 1_000_000;

export async function POST(request: Request) {
  const signature = request.headers.get("x-hub-signature-256");
  const eventType = request.headers.get("x-github-event");
  const deliveryId = request.headers.get("x-github-delivery");
  const rawBody = new Uint8Array(await request.arrayBuffer());

  if (rawBody.byteLength > MAX_WEBHOOK_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (!verifyWebhookSignature(rawBody, signature, requiredEnv("GITHUB_WEBHOOK_SECRET"))) {
    logger.warn("Webhook signature rejected", { deliveryId, eventType });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (!eventType || !deliveryId) return NextResponse.json({ error: "Missing GitHub delivery headers" }, { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
  }

  try {
    const result = await ingestWebhook({ deliveryId, eventType, rawBody, payload });
    if (result.outcome === "accepted" && result.jobsCreated > 0) {
      after(async () => {
        try {
          await runWorker(Math.min(result.jobsCreated, 10));
        } catch (error) {
          logger.error("Post-response worker failed; durable jobs remain queued", { deliveryId, error: error instanceof Error ? error.message : "unknown" });
        }
      });
    }
    return NextResponse.json(result, { status: result.outcome === "duplicate" ? 200 : 202 });
  } catch (error) {
    if (error instanceof AppError && error.status < 500) return NextResponse.json({ error: error.safeMessage }, { status: error.status });
    logger.error("Webhook persistence failed", { deliveryId, eventType, error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Webhook could not be persisted" }, { status: 503 });
  }
}
