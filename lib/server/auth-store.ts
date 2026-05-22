import "server-only";

import { getStatement } from "@/db/client";

export const localUserId = "local-user";

export type GitHubConnectionRecord = {
  id: string;
  userId: string;
  accessTokenEncrypted: string | null;
  scope: string | null;
  providerAccountId: string | null;
  providerUsername: string | null;
  status: string;
};

export type UpsertGitHubConnectionInput = {
  accessTokenEncrypted: string;
  scope: string;
  providerAccountId: string;
  providerUsername: string;
  name?: string | null;
  email?: string | null;
};

export type PersistGitHubRepositoryInput = {
  projectId: string;
  githubRepoId: string;
  owner: string;
  name: string;
  url: string;
  visibility: "private" | "public";
  defaultBranch: string;
};

export function ensureLocalUser(input?: {
  githubUserId?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  const now = Date.now();

  getStatement<[string, string | null, string | null, string | null, number, number]>(`
    INSERT INTO users (id, name, email, github_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      github_user_id = excluded.github_user_id,
      updated_at = excluded.updated_at
  `).run(
    localUserId,
    input?.name ?? null,
    input?.email ?? null,
    input?.githubUserId ?? null,
    now,
    now,
  );
}

export function upsertGitHubConnection(input: UpsertGitHubConnectionInput) {
  const now = Date.now();

  ensureLocalUser({
    githubUserId: input.providerAccountId,
    name: input.name,
    email: input.email,
  });

  getStatement<
    [
      string,
      string,
      string,
      string,
      string,
      string,
      number,
      number,
      number,
    ]
  >(`
    INSERT INTO auth_connections (
      id,
      user_id,
      provider,
      storage_type,
      status,
      access_token_encrypted,
      scope,
      provider_account_id,
      provider_username,
      last_validated_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, 'github', 'encrypted_db', 'connected', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = 'connected',
      storage_type = 'encrypted_db',
      access_token_encrypted = excluded.access_token_encrypted,
      scope = excluded.scope,
      provider_account_id = excluded.provider_account_id,
      provider_username = excluded.provider_username,
      last_validated_at = excluded.last_validated_at,
      updated_at = excluded.updated_at
  `).run(
    "github:local-user",
    localUserId,
    input.accessTokenEncrypted,
    input.scope,
    input.providerAccountId,
    input.providerUsername,
    now,
    now,
    now,
  );
}

export function getGitHubConnection() {
  ensureLocalUser();

  return getStatement<[], GitHubConnectionRecord>(`
    SELECT
      id,
      user_id AS userId,
      access_token_encrypted AS accessTokenEncrypted,
      scope,
      provider_account_id AS providerAccountId,
      provider_username AS providerUsername,
      status
    FROM auth_connections
    WHERE user_id = '${localUserId}' AND provider = 'github' AND status = 'connected'
    LIMIT 1
  `).get();
}

export function deleteGitHubConnection() {
  ensureLocalUser();

  getStatement<[string]>(`
    DELETE FROM auth_connections
    WHERE user_id = ? AND provider = 'github'
  `).run(localUserId);
}

export function ensureProject(input: {
  id: string;
  name: string;
  slug: string;
  oneLiner: string;
  status: string;
  scopeLevel: string;
  repoUrl?: string | null;
}) {
  const now = Date.now();
  ensureLocalUser();

  getStatement<[string, string, string, string, string, string, string, string | null, number, number]>(`
    INSERT INTO projects (
      id,
      user_id,
      name,
      slug,
      one_liner,
      status,
      scope_level,
      repo_url,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      slug = excluded.slug,
      one_liner = excluded.one_liner,
      status = excluded.status,
      scope_level = excluded.scope_level,
      repo_url = COALESCE(excluded.repo_url, projects.repo_url),
      updated_at = excluded.updated_at
  `).run(
    input.id,
    localUserId,
    input.name,
    input.slug,
    input.oneLiner,
    input.status,
    input.scopeLevel,
    input.repoUrl ?? null,
    now,
    now,
  );
}

export function persistGitHubRepository(input: PersistGitHubRepositoryInput) {
  const now = Date.now();

  getStatement<[string, string, string, string, string, string, string, string, number]>(`
    INSERT INTO github_repositories (
      id,
      project_id,
      github_repo_id,
      owner,
      name,
      url,
      visibility,
      default_branch,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      owner = excluded.owner,
      name = excluded.name,
      url = excluded.url,
      visibility = excluded.visibility,
      default_branch = excluded.default_branch
  `).run(
    `${input.projectId}:${input.githubRepoId}`,
    input.projectId,
    input.githubRepoId,
    input.owner,
    input.name,
    input.url,
    input.visibility,
    input.defaultBranch,
    now,
  );

  getStatement<[string, number, string]>(`
    UPDATE projects
    SET repo_url = ?, updated_at = ?
    WHERE id = ?
  `).run(input.url, now, input.projectId);
}
