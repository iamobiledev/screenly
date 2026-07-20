import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database access.");
  }

  const cloudSqlInstance = process.env.CLOUD_SQL_INSTANCE;
  const maxConnections = Number(process.env.DATABASE_MAX_CONNECTIONS ?? "5");
  if (!Number.isInteger(maxConnections) || maxConnections < 1) {
    throw new Error("DATABASE_MAX_CONNECTIONS must be a positive integer.");
  }

  const client = postgres(databaseUrl, {
    max: maxConnections,
    ...(cloudSqlInstance
      ? {
          path: `/cloudsql/${cloudSqlInstance}/.s.PGSQL.5432`,
          ssl: false,
        }
      : {}),
  });

  return drizzle(client, { schema });
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDb() {
  if (!database) {
    database = createDatabase();
  }

  return database;
}
