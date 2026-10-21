import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Production uses Neon's pooled connection, which does not support prepared statements.
const client = postgres(process.env.DATABASE_URL!, {
  prepare: process.env.APP_ENV !== "production",
});

export const db = drizzle(client, { schema });
export const closeDb = () => client.end();
