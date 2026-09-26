import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  const migrationDirectory = path.resolve(import.meta.dirname, "../../drizzle");
  const migrations = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of migrations) {
    const migration = await readFile(path.join(migrationDirectory, file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await db.exec(statement);
  }
}, 30_000);
afterAll(async () => db.close());

describe("database idempotency constraints", () => {
  it("permits only one logical delivery and one action type per delivery/rule", async () => {
    const user = await db.query<{ id: string }>("INSERT INTO users (github_id, login) VALUES ('1', 'alice') RETURNING id");
    const userId = user.rows[0]!.id;
    const installation = await db.query<{ id: string }>("INSERT INTO github_installations (installation_id, user_id, account_login, account_type) VALUES ('2', $1, 'acme', 'Organization') RETURNING id", [userId]);
    const repository = await db.query<{ id: string }>("INSERT INTO repositories (github_id, user_id, installation_id, owner, name, full_name) VALUES ('3', $1, $2, 'acme', 'app', 'acme/app') RETURNING id", [userId, installation.rows[0]!.id]);
    const repositoryId = repository.rows[0]!.id;
    const rule = await db.query<{ id: string }>("INSERT INTO rules (user_id, repository_id, name, event_type, actions) VALUES ($1, $2, 'rule', 'issues.opened', '[{\"type\":\"slack\"}]') RETURNING id", [userId, repositoryId]);
    const delivery = await db.query<{ id: string }>("INSERT INTO webhook_deliveries (delivery_id, repository_id, user_id, event_type, action, payload, payload_hash) VALUES ('delivery-1', $1, $2, 'issues', 'opened', '{}', 'hash') RETURNING id", [repositoryId, userId]);

    await expect(db.query("INSERT INTO webhook_deliveries (delivery_id, event_type, action, payload, payload_hash) VALUES ('delivery-1', 'issues', 'opened', '{}', 'hash')")).rejects.toThrow();

    const jobValues = [delivery.rows[0]!.id, rule.rows[0]!.id, userId, repositoryId];
    await db.query("INSERT INTO action_jobs (delivery_id, rule_id, user_id, repository_id, action_type, payload) VALUES ($1, $2, $3, $4, 'slack', '{}')", jobValues);
    await expect(db.query("INSERT INTO action_jobs (delivery_id, rule_id, user_id, repository_id, action_type, payload) VALUES ($1, $2, $3, $4, 'slack', '{}')", jobValues)).rejects.toThrow();
    const counts = await db.query<{ deliveries: number; jobs: number }>("SELECT (SELECT count(*)::int FROM webhook_deliveries) AS deliveries, (SELECT count(*)::int FROM action_jobs) AS jobs");
    expect(counts.rows[0]).toEqual({ deliveries: 1, jobs: 1 });
  });
});
