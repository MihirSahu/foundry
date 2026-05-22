import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { authConnections, githubRepositories, projects, users } from "@/db/schema";

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
  const now = new Date();

  getDb()
    .insert(users)
    .values({
      id: localUserId,
      name: input?.name ?? null,
      email: input?.email ?? null,
      githubUserId: input?.githubUserId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: input?.name ?? null,
        email: input?.email ?? null,
        githubUserId: input?.githubUserId ?? null,
        updatedAt: now,
      },
    })
    .run();
}

export function upsertGitHubConnection(input: UpsertGitHubConnectionInput) {
  const now = new Date();

  ensureLocalUser({
    githubUserId: input.providerAccountId,
    name: input.name,
    email: input.email,
  });

  getDb()
    .insert(authConnections)
    .values({
      id: "github:local-user",
      userId: localUserId,
      provider: "github",
      storageType: "encrypted_db",
      status: "connected",
      accessTokenEncrypted: input.accessTokenEncrypted,
      scope: input.scope,
      providerAccountId: input.providerAccountId,
      providerUsername: input.providerUsername,
      lastValidatedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: authConnections.id,
      set: {
        storageType: "encrypted_db",
        status: "connected",
        accessTokenEncrypted: input.accessTokenEncrypted,
        scope: input.scope,
        providerAccountId: input.providerAccountId,
        providerUsername: input.providerUsername,
        lastValidatedAt: now,
        updatedAt: now,
      },
    })
    .run();
}

export function getGitHubConnection(): GitHubConnectionRecord | undefined {
  ensureLocalUser();

  return getDb()
    .select({
      id: authConnections.id,
      userId: authConnections.userId,
      accessTokenEncrypted: authConnections.accessTokenEncrypted,
      scope: authConnections.scope,
      providerAccountId: authConnections.providerAccountId,
      providerUsername: authConnections.providerUsername,
      status: authConnections.status,
    })
    .from(authConnections)
    .where(
      and(
        eq(authConnections.userId, localUserId),
        eq(authConnections.provider, "github"),
        eq(authConnections.status, "connected"),
      ),
    )
    .get();
}

export function deleteGitHubConnection() {
  ensureLocalUser();

  getDb()
    .delete(authConnections)
    .where(and(eq(authConnections.userId, localUserId), eq(authConnections.provider, "github")))
    .run();
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
  const now = new Date();
  ensureLocalUser();

  getDb()
    .insert(projects)
    .values({
      id: input.id,
      userId: localUserId,
      name: input.name,
      slug: input.slug,
      oneLiner: input.oneLiner,
      status: input.status,
      scopeLevel: input.scopeLevel,
      repoUrl: input.repoUrl ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        name: input.name,
        slug: input.slug,
        oneLiner: input.oneLiner,
        status: input.status,
        scopeLevel: input.scopeLevel,
        ...(input.repoUrl ? { repoUrl: input.repoUrl } : {}),
        updatedAt: now,
      },
    })
    .run();
}

export function persistGitHubRepository(input: PersistGitHubRepositoryInput) {
  const now = new Date();

  getDb()
    .insert(githubRepositories)
    .values({
      id: `${input.projectId}:${input.githubRepoId}`,
      projectId: input.projectId,
      githubRepoId: input.githubRepoId,
      owner: input.owner,
      name: input.name,
      url: input.url,
      visibility: input.visibility,
      defaultBranch: input.defaultBranch,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: githubRepositories.id,
      set: {
        owner: input.owner,
        name: input.name,
        url: input.url,
        visibility: input.visibility,
        defaultBranch: input.defaultBranch,
      },
    })
    .run();

  getDb()
    .update(projects)
    .set({ repoUrl: input.url, updatedAt: now })
    .where(eq(projects.id, input.projectId))
    .run();
}
