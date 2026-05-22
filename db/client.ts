import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type FoundryDb = ReturnType<typeof drizzle<typeof schema>>;

let client:
  | {
      db: FoundryDb;
      sqlite: Database.Database;
      path: string;
    }
  | undefined;

export function getDatabasePath() {
  const configured = process.env.FOUNDRY_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!configured) {
    return join(process.cwd(), "foundry.sqlite");
  }

  return configured.startsWith("file:") ? configured.slice("file:".length) : configured;
}

export function createDatabaseClient(databasePath = getDatabasePath()) {
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  runCompatibilityMigrations(sqlite);
  migrate(db, { migrationsFolder: getMigrationsFolder() });

  return { db, sqlite, path: databasePath };
}

export function getDb() {
  if (!client || client.path !== getDatabasePath()) {
    client = createDatabaseClient();
  }

  return client.db;
}

export function closeDatabase() {
  client?.sqlite.close();
  client = undefined;
}

function getMigrationsFolder() {
  return process.env.FOUNDRY_MIGRATIONS_DIR ?? join(process.cwd(), "db/migrations");
}

function runCompatibilityMigrations(sqlite: Database.Database) {
  ensureColumn(sqlite, "auth_connections", "access_token_encrypted", "TEXT");
  ensureColumn(sqlite, "auth_connections", "scope", "TEXT");
  ensureColumn(sqlite, "auth_connections", "provider_account_id", "TEXT");
  ensureColumn(sqlite, "auth_connections", "provider_username", "TEXT");
}

function ensureColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  if (!tableExists(sqlite, table)) {
    return;
  }

  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;

  if (!columns.some((entry) => entry.name === column)) {
    sqlite.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function tableExists(sqlite: Database.Database, table: string) {
  return Boolean(
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}
