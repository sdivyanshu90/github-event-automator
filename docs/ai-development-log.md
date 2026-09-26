# AI development evidence log

This is a factual working log used to prepare `AI_NOTES.md`. It records only meaningful design, verification, and correction events.

## 2026-09-25 — Initial architecture

- The repository had only a one-line README. Codex proposed a modular Next.js/PostgreSQL application and generated the first implementation pass.
- The assignment itself established the decisive reliability constraints: persist webhooks before side effects, database-backed delivery/action idempotency, deterministic rules, and per-action retries. The implementation adopts those constraints rather than a synchronous webhook handler.
- Current official GitHub documentation was checked before implementation. It confirms RS256 App JWTs, an `iat` backdated for clock drift, an expiration no more than ten minutes ahead, `Bearer` authentication, and one-hour installation access tokens. Current Next.js documentation was checked for asynchronous request APIs and route-handler behavior. Auth.js official guidance was checked for its current Next.js API shape.
- A deliberate limitation was chosen for serverless deployment: PostgreSQL is the durable queue and a protected one-minute cron worker drains it. This avoids a paid queue while preserving events across restarts. It trades sub-minute action latency for a simpler free-tier deployment.

## 2026-09-25 — First generated-code review

- Type checking caught an over-specific webhook helper type: the helper accepted an `issues` payload even though pull requests share the same normalized subject shape. The implementation was narrowed to the common validated base payload instead of using a cast.
- Manual review found two non-type-level defects in Codex's first pass. Duplicate observation used a row-count expression, which would keep `duplicate_count` at one instead of incrementing it; it was replaced with an atomic SQL increment. Installation synchronization fetched only the first 100 repositories and then deactivated everything absent from that partial page. That looked reasonable for small installations but was destructive for larger ones. The GitHub adapter now paginates all installation repositories before the transaction is allowed to deactivate missing records.
- The first test command could not start because Codex had pinned Vitest 4 while the provided environment runs Node 21; Vitest 4 supports Node 20/22/24 but not 21. The runner was deliberately downgraded to Vitest 2 instead of treating the startup failure as a test result. Production guidance remains Node 22 LTS.
- Security review challenged the generated GitHub setup callback because it trusted a signed-in user plus an unclaimed `installation_id`. GitHub's setup-URL documentation explicitly warns that attackers can spoof that parameter. The corrected flow starts installation through a server endpoint with an HTTP-only, short-lived state cookie, verifies the returned state in constant time, and uses the signed-in user's encrypted GitHub App user token to call GitHub's `/user/installations/{id}` endpoint before associating the installation. The OAuth token is encrypted at rest with AES-256-GCM under `AUTH_SECRET` and is never placed in the browser session.
- Review also found that a literal rule deletion would cascade-delete its action-job history. Rule deletion was changed to a soft delete (`deleted_at` plus disabled), and every live rule query excludes deleted rows. Historical jobs and activity remain available for incident review.
- Current Vercel documentation was checked and contradicted the original minute-cron deployment assumption: Hobby cron jobs can run only once per day. The Vercel cron was removed. The webhook now uses Next.js `after()` for best-effort immediate draining only after durable commit/response, while a public-repository GitHub Actions schedule calls the protected worker every five minutes for free recovery. PostgreSQL remains the source of truth if either execution is interrupted.
- Next.js compilation succeeded but its default TypeScript CLI subprocess produced unparsable captured output on the provided Node 21 host, even though `tsc --showConfig` and `tsc --noEmit` succeeded independently. Setting Next's `experimental.useTypeScriptCli` to `false` made the production build use the compiler API; the subsequent build completed with exit code 0.
- A final full `npm audit` showed zero production advisories but retained a development-only Vitest/Vite advisory because the working runner had been downgraded for Node 21. Rather than ship that compromise, the project baseline was made explicit as Node 22.12+ and Vitest was upgraded to the patched v5 line; final tests were moved to a Node 22 container because the provided Node 21 host is outside Vitest's support matrix.

## 2026-09-25 — Final verification

- Under Node 22.14: 10 test files and 30 tests passed; ESLint completed with zero warnings; strict `tsc --noEmit` passed; and the Next.js production build completed with exit code 0.
- Drizzle reported no schema drift after the three migrations, and the final full `npm audit` reported zero vulnerabilities. The migration-backed test applied all migrations before exercising delivery/job uniqueness.
- External credentials were not available. GitHub, Slack, and Gemini HTTP semantics were verified with mocks, but no live provider action or production deployment was claimed.
