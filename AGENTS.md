# Project engineering instructions

## Priorities

1. Preserve end-to-end correctness, security, and recoverability before UI polish.
2. Keep this a modular monolith; do not introduce services or paid infrastructure without a demonstrated need.
3. Never add fake production behavior to make a demo appear functional.

## Non-negotiable invariants

- Read the GitHub webhook body exactly once as bytes. Verify `X-Hub-Signature-256` before JSON parsing or persistence, using constant-time comparison.
- Persist a unique delivery and unique per-rule action jobs before any external side effect. Idempotency must remain database-backed across restarts and instances.
- Acknowledge GitHub after the transaction commits. GitHub, Slack, and AI failures must not erase the original event.
- Retry one action job, never an entire delivery. Never move a completed sibling job back to pending.
- Use short-lived GitHub App installation tokens for automation. Do not persist them or expose any credential to client code.
- Treat GitHub installation IDs as untrusted until state and signed-in-user access are verified with GitHub.
- Every dashboard query and mutation must constrain resources by the authenticated application user.
- Keep rule matching deterministic. AI is advisory, schema-validated, receives no secrets, and cannot participate in authentication or authorization.
- Preserve activity history when users delete configuration. Prefer soft deletion for referenced control-plane records.

## Implementation conventions

- Keep TypeScript strict and avoid `any`. Validate external inputs with Zod or an equally explicit boundary.
- Put provider behavior in `src/services`; route handlers should verify/validate, delegate, and translate safe errors.
- Use `src/lib/logger.ts` for server logs. Never log private keys, OAuth/installation tokens, webhook/worker secrets, Slack URLs, or AI keys.
- Classify provider failures explicitly. Retry only rate limits, 5xx responses, and transient network errors; bound every retry schedule.
- Schema changes require a committed Drizzle migration. Do not hand-edit an already-applied migration.
- Add regression tests for reliability/security fixes. PGlite tests should execute every committed migration.
- Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` before handoff. Report failures honestly.

## Deployment constraints

- Required functionality must have a free-tier path. Vercel Hobby cannot schedule sub-daily cron jobs; use the protected GitHub Actions worker schedule or another free scheduler.
- Do not put real values in `.env.example`, source, fixtures, logs, or documentation.
- Never claim a live integration or deployment was verified without real credentials and an observed result.
