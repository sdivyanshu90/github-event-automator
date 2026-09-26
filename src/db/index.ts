import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { requiredEnv } from "@/lib/env";

let client: ReturnType<typeof postgres> | undefined;

function getClient(): ReturnType<typeof postgres> {
  client ??= postgres(requiredEnv("DATABASE_URL"), {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return client;
}

export function database() {
  return drizzle(getClient(), { schema });
}

export type Database = ReturnType<typeof database>;
