import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runWorker } from "@/services/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : request.headers.get("x-worker-secret") ?? "";
  const allowed = [optionalEnv("WORKER_SECRET"), optionalEnv("CRON_SECRET")].filter((value): value is string => Boolean(value));
  return allowed.some((secret) => {
    const left = Buffer.from(supplied);
    const right = Buffer.from(secret);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const configured = Number.parseInt(process.env.WORKER_BATCH_SIZE ?? "10", 10);
    const result = await runWorker(Number.isFinite(configured) ? configured : 10);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Worker invocation failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Worker invocation failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
