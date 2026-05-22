import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  githubUserId: text("github_user_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  oneLiner: text("one_liner").notNull(),
  status: text("status").notNull(),
  scopeLevel: text("scope_level").notNull(),
  repoUrl: text("repo_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const projectArtifacts = sqliteTable("project_artifacts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  version: integer("version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const githubRepositories = sqliteTable("github_repositories", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  githubRepoId: text("github_repo_id").notNull(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  visibility: text("visibility").notNull(),
  defaultBranch: text("default_branch").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const generationJobs = sqliteTable("generation_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  type: text("type").notNull(),
  status: text("status").notNull(),
  input: text("input", { mode: "json" }),
  output: text("output", { mode: "json" }),
  error: text("error"),
  provider: text("provider"),
  model: text("model"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const buildEvents = sqliteTable("build_events", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => generationJobs.id),
  projectId: text("project_id").notNull().references(() => projects.id),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  payload: text("payload", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const authConnections = sqliteTable("auth_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(),
  storageType: text("storage_type").notNull(),
  status: text("status").notNull(),
  accessTokenEncrypted: text("access_token_encrypted"),
  scope: text("scope"),
  providerAccountId: text("provider_account_id"),
  providerUsername: text("provider_username"),
  lastValidatedAt: integer("last_validated_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
