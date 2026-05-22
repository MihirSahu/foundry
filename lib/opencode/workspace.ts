import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { Project } from "../domain";

export function getWorkspacesRoot() {
  return resolve(
    process.env.FOUNDRY_WORKSPACES_DIR ??
      join(/* turbopackIgnore: true */ process.cwd(), ".foundry", "workspaces"),
  );
}

export function getProjectWorkspace(project: Project) {
  const root = getWorkspacesRoot();
  const workspace = resolve(root, `${project.slug || "project"}-${project.id}`);

  assertInsideRoot(root, workspace);

  return workspace;
}

export async function materializeProjectWorkspace(project: Project) {
  const workspacePath = getProjectWorkspace(project);
  mkdirSync(workspacePath, { recursive: true });
  const { createStarterFiles } = await import("../services/starter-files");

  for (const file of createStarterFiles(project)) {
    const target = resolve(workspacePath, file.path);
    assertInsideRoot(workspacePath, target);

    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }
  }

  return workspacePath;
}

function assertInsideRoot(root: string, target: string) {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;

  if (target !== root && !target.startsWith(normalizedRoot)) {
    throw new Error("Resolved workspace path escaped the Foundry workspace root.");
  }
}
