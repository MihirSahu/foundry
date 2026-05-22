import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
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
  ensureSchema(db);

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

function ensureSchema(db: FoundryDb) {
  for (const statement of schemaStatements) {
    db.run(sql.raw(statement));
  }

  ensureColumn(db, "auth_connections", "access_token_encrypted", "TEXT");
  ensureColumn(db, "auth_connections", "scope", "TEXT");
  ensureColumn(db, "auth_connections", "provider_account_id", "TEXT");
  ensureColumn(db, "auth_connections", "provider_username", "TEXT");
}

function ensureColumn(db: FoundryDb, table: string, column: string, definition: string) {
  const columns = db.all(sql.raw(`PRAGMA table_info(${table})`)) as Array<{ name: string }>;

  if (!columns.some((entry) => entry.name === column)) {
    db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`));
  }
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    github_user_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    one_liner TEXT NOT NULL,
    status TEXT NOT NULL,
    scope_level TEXT NOT NULL,
    repo_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS project_artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS github_repositories (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    github_repo_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    visibility TEXT NOT NULL,
    default_branch TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS generation_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    input TEXT,
    output TEXT,
    error TEXT,
    provider TEXT,
    model TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS build_events (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES generation_jobs(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    payload TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    provider TEXT NOT NULL,
    storage_type TEXT NOT NULL,
    status TEXT NOT NULL,
    access_token_encrypted TEXT,
    scope TEXT,
    provider_account_id TEXT,
    provider_username TEXT,
    last_validated_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS auth_connections_provider_idx ON auth_connections(provider, user_id)",
  "CREATE INDEX IF NOT EXISTS project_artifacts_project_idx ON project_artifacts(project_id, type, version)",
  "CREATE INDEX IF NOT EXISTS messages_project_idx ON messages(project_id, created_at)",
  "CREATE INDEX IF NOT EXISTS build_events_job_idx ON build_events(job_id, sequence)",
];
