import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureProject,
  getGitHubConnection,
  persistGitHubRepository,
} from "@/lib/server/auth-store";
import { decryptSecret } from "@/lib/server/crypto";
import { getProject } from "@/lib/server/project-store";
import { createRepository, GitHubApiError } from "@/lib/services/github";
import { createGitHubIssues, createStarterFiles } from "@/lib/services/starter-files";

export const runtime = "nodejs";

const createRepoSchema = z.object({
  projectId: z.string().min(1).optional(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dashes, underscores, or periods."),
  description: z.string().trim().max(350).optional(),
  visibility: z.enum(["private", "public"]).default("private"),
  includeStarterFiles: z.boolean().default(true),
  includeIssues: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const connection = getGitHubConnection();

  if (!connection?.accessTokenEncrypted) {
    return repoError("not_connected", "Connect GitHub before creating a repository.", 401);
  }

  const parsed = createRepoSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return repoError("validation_failed", "Check the repository details and try again.", 400);
  }

  let token: string;

  try {
    token = decryptSecret(connection.accessTokenEncrypted);
  } catch {
    return repoError("auth_invalid", "Reconnect GitHub before creating a repository.", 401);
  }

  const input = parsed.data;
  const persistedProject = input.projectId ? getProject(input.projectId) : undefined;
  const project = {
    ...(persistedProject ?? {
      id: "foundry",
      name: input.name,
      slug: input.name,
      oneLiner: input.description || "Generated Foundry project.",
      status: "active" as const,
      stage: "Build Plan" as const,
      scopeLevel: "MVP" as const,
      updatedAt: new Date().toISOString(),
    }),
    slug: input.name,
    oneLiner: input.description || persistedProject?.oneLiner || "Generated Foundry project.",
  };

  ensureProject(project);

  try {
    const repository = await createRepository({
      token,
      name: input.name,
      description: input.description || project.oneLiner,
      visibility: input.visibility,
      files: input.includeStarterFiles ? createStarterFiles(project) : [],
      issues: input.includeIssues ? createGitHubIssues(project) : [],
    });

    persistGitHubRepository({
      projectId: project.id,
      githubRepoId: String(repository.id),
      owner: repository.owner,
      name: repository.name,
      url: repository.url,
      visibility: input.visibility,
      defaultBranch: repository.defaultBranch,
    });

    return NextResponse.json({
      repository: {
        owner: repository.owner,
        name: repository.name,
        url: repository.url,
        defaultBranch: repository.defaultBranch,
        visibility: input.visibility,
      },
    });
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return repoError(error.code, error.message, mapGitHubStatus(error));
    }

    return repoError("upstream_failure", "GitHub repository creation failed.", 502);
  }
}

function repoError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function mapGitHubStatus(error: GitHubApiError) {
  if (error.code === "repo_exists") {
    return 409;
  }

  if (error.code === "validation_failed") {
    return 400;
  }

  if (error.code === "insufficient_scope") {
    return 403;
  }

  if (error.code === "rate_limited") {
    return 429;
  }

  return error.status >= 500 ? error.status : 502;
}
