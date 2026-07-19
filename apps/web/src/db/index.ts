import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database access.");
  }

  return drizzle(neon(databaseUrl), { schema });
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDb() {
  if (!database) {
    database = createDatabase();
  }

  return database;
}
