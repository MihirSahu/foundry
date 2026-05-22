import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";

describe("database client migrations", () => {
  it("adds encrypted GitHub auth columns to existing local databases", () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "foundry-db-client-")), "foundry.sqlite");
    const sqlite = new Database(databasePath);
    sqlite.exec(`
      CREATE TABLE auth_connections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        storage_type TEXT NOT NULL,
        status TEXT NOT NULL,
        last_validated_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    sqlite.close();

    const client = createDatabaseClient(databasePath);
    const columns = client.sqlite.prepare("PRAGMA table_info(auth_connections)").all() as Array<{ name: string }>;
    client.sqlite.close();

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "access_token_encrypted",
        "scope",
        "provider_account_id",
        "provider_username",
      ]),
    );
  });
});
