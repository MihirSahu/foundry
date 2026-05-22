"use client";

import {
  ArrowRight,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  FileText,
  GitBranch,
  Hammer,
  Layers3,
  MessageSquareText,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { artifacts, brainstormMessages, buildEvents, projects, summaryCards } from "@/lib/mock-data";
import type { ArtifactType, Project, ScopeLevel } from "@/lib/domain";
import { cn } from "@/lib/utils";

const stageOrder = [
  "Idea",
  "Brainstorming",
  "PRD",
  "Build Plan",
  "Repo Created",
  "Codex Handoff Ready",
] as const;

const navItems = [
  { id: "projects", label: "Projects", icon: Boxes },
  { id: "idea", label: "Idea", icon: MessageSquareText },
  { id: "spec", label: "Spec", icon: FileText },
  { id: "build", label: "Build", icon: Hammer },
  { id: "repo", label: "Repo", icon: GitBranch },
] as const;

const scopeOptions: Array<{
  id: ScopeLevel;
  icon: typeof Sparkles;
  description: string;
  included: string;
  excluded: string;
}> = [
  {
    id: "Prototype",
    icon: Sparkles,
    description: "Clickable workflow with mocked repo and build data.",
    included: "UI, cards, PRD preview, handoff prompt",
    excluded: "Real persistence, GitHub writes, worker execution",
  },
  {
    id: "MVP",
    icon: Layers3,
    description: "Real artifacts, repo setup path, auth health, and starter files.",
    included: "SQLite model, Conduit service, GitHub creation, docs",
    excluded: "Hosted multi-user credential brokerage",
  },
  {
    id: "Launchable",
    icon: Rocket,
    description: "Production hardening with analytics, deployment, and repair loops.",
    included: "Auth polish, queueing, PRs, previews, monitoring",
    excluded: "Marketplace, team collaboration, full IDE surface",
  },
];

const artifactLabels: Record<ArtifactType, string> = {
  prd: "PRD",
  build_plan: "Plan",
  agents_md: "Agents",
  readme: "README",
  handoff_prompt: "Handoff",
  roadmap: "Roadmap",
};

type TabId = (typeof navItems)[number]["id"];

type GitHubStatus =
  | {
      connected: false;
      username?: never;
      scope?: never;
    }
  | {
      connected: true;
      username?: string | null;
      scope?: string | null;
    };

export function FoundryApp() {
  const [activeTab, setActiveTab] = useState<TabId>("projects");
  const [projectList, setProjectList] = useState<Project[]>(projects);
  const [activeProject, setActiveProject] = useState<Project>(projects[0]);
  const [scope, setScope] = useState<ScopeLevel>(activeProject.scopeLevel);
  const [artifactId, setArtifactId] = useState("prd");
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>({ connected: false });
  const [githubStatusState, setGithubStatusState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const activeArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === artifactId) ?? artifacts[0],
    [artifactId],
  );

  const stageIndex = stageOrder.indexOf(activeProject.stage);

  async function refreshGitHubStatus() {
    try {
      setGithubStatusState("loading");
      const response = await fetch("/api/auth/github/status", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("GitHub status failed.");
      }

      setGithubStatus((await response.json()) as GitHubStatus);
      setGithubStatusState("ready");
    } catch {
      setGithubStatus({ connected: false });
      setGithubStatusState("error");
    }
  }

  useEffect(() => {
    let isMounted = true;

    void fetch("/api/projects", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Project fetch failed.");
        }

        return response.json() as Promise<{ projects: Project[] }>;
      })
      .then((payload) => {
        if (isMounted && payload.projects.length > 0) {
          setProjectList(payload.projects);
          setActiveProject(payload.projects[0]);
          setScope(payload.projects[0].scopeLevel);
        }
      })
      .catch(() => undefined);

    void fetch("/api/auth/github/status", {
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("GitHub status failed.");
        }

        return response.json() as Promise<GitHubStatus>;
      })
      .then((status) => {
        if (isMounted) {
          setGithubStatus(status);
          setGithubStatusState("ready");
        }
      })
      .catch(() => {
        if (isMounted) {
          setGithubStatus({ connected: false });
          setGithubStatusState("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen pb-24 lg:pb-0">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col lg:flex-row">
        <aside className="hidden w-72 shrink-0 border-r bg-[var(--panel)]/85 px-4 py-5 lg:block">
          <BrandBlock />
          <nav aria-label="Primary" className="mt-8 grid gap-1">
            {navItems.map((item) => (
              <NavButton
                key={item.id}
                active={activeTab === item.id}
                icon={item.icon}
                label={item.label}
                onClick={() => setActiveTab(item.id)}
              />
            ))}
          </nav>
          <AuthStatus
            githubStatus={githubStatus}
            githubStatusState={githubStatusState}
            onRefresh={refreshGitHubStatus}
          />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b bg-[var(--background)]/92 px-4 py-3 backdrop-blur lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-[var(--primary)]">Current project</p>
                <h1 className="truncate text-xl font-bold tracking-normal sm:text-2xl">
                  {activeProject.name}
                </h1>
              </div>
              <Button size="sm" className="hidden sm:inline-flex">
                <Plus size={16} aria-hidden="true" />
                New Project
              </Button>
              <Button size="icon" className="sm:hidden" aria-label="New project">
                <Plus size={18} aria-hidden="true" />
              </Button>
            </div>
          </header>

          <div className="px-4 py-5 lg:px-8 lg:py-8">
            <WorkflowHeader project={activeProject} stageIndex={stageIndex} />

            {activeTab === "projects" ? (
              <ProjectsView
                activeProject={activeProject}
                projects={projectList}
                onSelect={(project) => {
                  setActiveProject(project);
                  setScope(project.scopeLevel);
                }}
                onContinue={() => setActiveTab("idea")}
              />
            ) : null}

            {activeTab === "idea" ? (
              <IdeaView
                onProjectCreated={(project) => {
                  setProjectList((current) => [project, ...current]);
                  setActiveProject(project);
                  setScope(project.scopeLevel);
                  setActiveTab("spec");
                }}
                onGenerateSpec={() => setActiveTab("spec")}
              />
            ) : null}

            {activeTab === "spec" ? (
              <SpecView
                scope={scope}
                setScope={setScope}
                activeArtifactId={artifactId}
                setArtifactId={setArtifactId}
                activeArtifact={activeArtifact}
                onCreateRepo={() => setActiveTab("repo")}
              />
            ) : null}

            {activeTab === "build" ? <BuildView /> : null}

            {activeTab === "repo" ? (
              <RepoView
                key={activeProject.id}
                githubStatus={githubStatus}
                onRefreshGitHubStatus={refreshGitHubStatus}
                project={activeProject}
              />
            ) : null}
          </div>
        </section>
      </div>

      <MobileTabs activeTab={activeTab} setActiveTab={setActiveTab} />
    </main>
  );
}

function BrandBlock() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
        <Hammer size={22} aria-hidden="true" />
      </div>
      <div>
        <p className="text-lg font-black">Foundry</p>
        <p className="text-sm text-[var(--muted-foreground)]">Idea to MVP repo</p>
      </div>
    </div>
  );
}

function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Boxes;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors",
        active ? "bg-[var(--muted)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon size={18} aria-hidden="true" />
      {label}
    </button>
  );
}

function AuthStatus({
  githubStatus,
  githubStatusState,
  onRefresh,
}: {
  githubStatus: GitHubStatus;
  githubStatusState: "loading" | "ready" | "error";
  onRefresh: () => Promise<void>;
}) {
  async function disconnectGitHub() {
    await fetch("/api/auth/github/logout", { method: "POST" });
    await onRefresh();
  }

  return (
    <div className="mt-8 rounded-lg border bg-[var(--panel-strong)] p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-[var(--primary)]" aria-hidden="true" />
        <p className="text-sm font-bold">Auth health</p>
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        <StatusRow
          label="GitHub"
          status={
            githubStatusState === "loading"
              ? "Checking"
              : githubStatus.connected
                ? `@${githubStatus.username ?? "connected"}`
                : "Needs connect"
          }
        />
        <StatusRow label="Conduit" status="Local only" />
        <StatusRow label="OpenCode" status="Experimental" />
      </div>
      <div className="mt-4 flex gap-2">
        {githubStatus.connected ? (
          <Button size="sm" variant="secondary" onClick={disconnectGitHub}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={() => { window.location.href = "/api/auth/github/start"; }}>
            Connect GitHub
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="text-xs font-semibold">{status}</span>
    </div>
  );
}

function WorkflowHeader({
  project,
  stageIndex,
}: {
  project: Project;
  stageIndex: number;
}) {
  return (
    <section className="mb-5 rounded-lg border bg-[var(--panel)] p-4 lg:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">{project.stage}</Badge>
            <Badge tone="violet">{project.scopeLevel}</Badge>
            <Badge>{project.repoUrl ? "Repo connected" : "Repo pending"}</Badge>
          </div>
          <p className="mt-3 text-lg font-semibold leading-snug lg:text-xl">
            {project.oneLiner}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="secondary" size="sm">
            <RefreshCw size={15} aria-hidden="true" />
            Smaller
          </Button>
          <Button size="sm">
            <Play size={15} aria-hidden="true" />
            Continue
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-6 gap-2" aria-label="Workflow progress">
        {stageOrder.map((stage, index) => (
          <div
            key={stage}
            className={cn(
              "h-2 rounded-full",
              index <= stageIndex ? "bg-[var(--primary)]" : "bg-[var(--muted)]",
            )}
            title={stage}
          />
        ))}
      </div>
    </section>
  );
}

function ProjectsView({
  activeProject,
  projects,
  onSelect,
  onContinue,
}: {
  activeProject: Project;
  projects: Project[];
  onSelect: (project: Project) => void;
  onContinue: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="grid gap-3">
        {projects.map((project) => (
          <button
            key={project.id}
            className={cn(
              "rounded-lg border bg-[var(--panel)] p-4 text-left shadow-sm transition-colors hover:bg-[var(--panel-strong)]",
              activeProject.id === project.id && "border-[var(--primary)]",
            )}
            onClick={() => onSelect(project)}
            type="button"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold">{project.name}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                  {project.oneLiner}
                </p>
              </div>
              <ChevronRight size={18} aria-hidden="true" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={project.status === "active" ? "success" : "default"}>
                {project.stage}
              </Badge>
              <Badge tone="warning">{project.scopeLevel}</Badge>
              <Badge>{project.repoUrl ? "GitHub ready" : "No repo"}</Badge>
            </div>
          </button>
        ))}
      </section>

      <section className="rounded-lg border bg-[var(--panel)] p-4">
        <h2 className="text-lg font-bold">Fast start</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          Drop in a rough idea, let Conduit shape the product thinking, then generate a PRD, build plan, and repo handoff.
        </p>
        <div className="mt-4 grid gap-2">
          {["Mobile MVP helper", "AI workflow studio", "Internal ops tool"].map((prompt) => (
            <button
              key={prompt}
              className="flex items-center justify-between rounded-md border bg-[var(--panel-strong)] px-3 py-2 text-left text-sm font-semibold"
              type="button"
            >
              {prompt}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={onContinue}>
          Start Brainstorming
        </Button>
      </section>
    </div>
  );
}

function IdeaView({
  onGenerateSpec,
  onProjectCreated,
}: {
  onGenerateSpec: () => void;
  onProjectCreated: (project: Project) => void;
}) {
  const [idea, setIdea] = useState(
    "I want to build a mobile-friendly app that helps me brainstorm MVPs and create GitHub repos for them.",
  );
  const [createState, setCreateState] = useState<"idle" | "creating" | "error">("idle");

  async function createProject() {
    setCreateState("creating");

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const payload = (await response.json()) as {
        project?: Project;
      };

      if (!response.ok || !payload.project) {
        throw new Error("Project creation failed.");
      }

      onProjectCreated(payload.project);
      setCreateState("idle");
    } catch {
      setCreateState("error");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="grid gap-4">
        <div className="rounded-lg border bg-[var(--panel)] p-4">
          <label htmlFor="idea" className="text-sm font-bold">
            Describe the product you want to build
          </label>
          <textarea
            id="idea"
            className="mt-3 min-h-36 w-full resize-none rounded-md border bg-[var(--panel-strong)] p-3 text-base leading-6"
            onChange={(event) => setIdea(event.target.value)}
            value={idea}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={createState === "creating"} onClick={createProject}>
              <Bot size={16} aria-hidden="true" />
              {createState === "creating" ? "Creating..." : "Start brainstorming"}
            </Button>
            <Button variant="secondary" onClick={onGenerateSpec}>
              Generate from idea
            </Button>
          </div>
          {createState === "error" ? (
            <p className="mt-3 text-sm font-semibold text-[var(--danger)]">
              Could not create the project. Check the idea and try again.
            </p>
          ) : null}
        </div>

        <section className="grid gap-3">
          {brainstormMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[92%] rounded-lg border p-3 text-sm leading-6",
                message.role === "user"
                  ? "ml-auto bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--panel)]",
              )}
            >
              {message.content}
            </div>
          ))}
        </section>
      </section>

      <section className="grid gap-3">
        {summaryCards.map((card) => (
          <SummaryCardView key={card.id} card={card} />
        ))}
      </section>
    </div>
  );
}

function SummaryCardView({ card }: { card: (typeof summaryCards)[number] }) {
  const toneClass = {
    teal: "border-l-[var(--primary)]",
    amber: "border-l-[var(--warning)]",
    orange: "border-l-[var(--accent)]",
    violet: "border-l-[var(--violet)]",
    neutral: "border-l-[var(--border)]",
  }[card.tone];

  return (
    <Card className={cn("border-l-4", toneClass)}>
      <CardHeader>
        <p className="text-xs font-bold uppercase text-[var(--muted-foreground)]">
          {card.eyebrow}
        </p>
        <h3 className="mt-1 text-lg font-bold">{card.title}</h3>
      </CardHeader>
      <CardContent>
        <p className="text-base font-semibold">{card.value}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {card.detail}
        </p>
      </CardContent>
    </Card>
  );
}

function SpecView({
  scope,
  setScope,
  activeArtifactId,
  setArtifactId,
  activeArtifact,
  onCreateRepo,
}: {
  scope: ScopeLevel;
  setScope: (scope: ScopeLevel) => void;
  activeArtifactId: string;
  setArtifactId: (id: string) => void;
  activeArtifact: (typeof artifacts)[number];
  onCreateRepo: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="grid gap-3">
        {scopeOptions.map((option) => (
          <button
            key={option.id}
            className={cn(
              "rounded-lg border bg-[var(--panel)] p-4 text-left transition-colors",
              scope === option.id && "border-[var(--primary)] bg-[var(--panel-strong)]",
            )}
            onClick={() => setScope(option.id)}
            type="button"
          >
            <div className="flex items-center gap-3">
              <option.icon size={20} className="text-[var(--primary)]" aria-hidden="true" />
              <div>
                <h2 className="font-bold">{option.id}</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {option.description}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div>
                <dt className="font-semibold">Includes</dt>
                <dd className="text-[var(--muted-foreground)]">{option.included}</dd>
              </div>
              <div>
                <dt className="font-semibold">Excludes</dt>
                <dd className="text-[var(--muted-foreground)]">{option.excluded}</dd>
              </div>
            </dl>
          </button>
        ))}
      </section>

      <section className="min-w-0 rounded-lg border bg-[var(--panel)]">
        <div className="border-b p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[var(--primary)]">Generated artifacts</p>
              <h2 className="text-xl font-bold">{activeArtifact.title}</h2>
            </div>
            <Button onClick={onCreateRepo}>
              <GitBranch size={16} aria-hidden="true" />
              Create repo
            </Button>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                className={cn(
                  "h-9 shrink-0 rounded-md border px-3 text-sm font-semibold",
                  activeArtifactId === artifact.id
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--panel-strong)]",
                )}
                onClick={() => setArtifactId(artifact.id)}
                type="button"
              >
                {artifactLabels[artifact.type]}
              </button>
            ))}
          </div>
        </div>
        <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap p-4 font-mono text-sm leading-6">
          {activeArtifact.content}
        </pre>
      </section>
    </div>
  );
}

function BuildView() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-lg border bg-[var(--panel)]">
        <div className="border-b p-4">
          <p className="text-sm font-bold text-[var(--primary)]">Build runner</p>
          <h2 className="text-xl font-bold">Experimental OpenCode worker</h2>
        </div>
        <div className="grid gap-3 p-4">
          {buildEvents.map((event) => (
            <div key={event.id} className="flex gap-3 rounded-lg border bg-[var(--panel-strong)] p-3">
              <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--muted)]">
                <Check size={15} className="text-[var(--primary)]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-[var(--muted-foreground)]">
                  {event.type.replace("_", " ")}
                </p>
                <p className="text-sm leading-6">{event.message}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--panel)] p-4">
        <h2 className="text-lg font-bold">Permissions</h2>
        <div className="mt-4 grid gap-3">
          {[
            "Workspace-scoped file edits",
            "Explicit shell command access",
            "Sanitized stream events",
            "No browser token exposure",
          ].map((item) => (
            <label key={item} className="flex items-center gap-3 text-sm font-semibold">
              <input className="h-4 w-4 accent-[var(--primary)]" type="checkbox" defaultChecked />
              {item}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function RepoView({
  githubStatus,
  onRefreshGitHubStatus,
  project,
}: {
  githubStatus: GitHubStatus;
  onRefreshGitHubStatus: () => Promise<void>;
  project: Project;
}) {
  const [repoName, setRepoName] = useState(project.slug);
  const [description, setDescription] = useState(project.oneLiner);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [includeStarterFiles, setIncludeStarterFiles] = useState(true);
  const [includeIssues, setIncludeIssues] = useState(false);
  const [repoState, setRepoState] = useState<{
    status: "idle" | "creating" | "success" | "error";
    message?: string;
    url?: string;
  }>({ status: "idle" });

  async function createRepo() {
    setRepoState({ status: "creating", message: "Creating repository..." });

    try {
      const response = await fetch("/api/github/repos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
          name: repoName,
          description,
          visibility,
          includeStarterFiles,
          includeIssues,
        }),
      });

      const payload = (await response.json()) as {
        repository?: { url: string };
        error?: { message: string };
      };

      if (!response.ok || !payload.repository) {
        throw new Error(payload.error?.message ?? "Repository creation failed.");
      }

      setRepoState({
        status: "success",
        message: "Repository created.",
        url: payload.repository.url,
      });
    } catch (error) {
      setRepoState({
        status: "error",
        message: error instanceof Error ? error.message : "Repository creation failed.",
      });
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border bg-[var(--panel)] p-4">
        <h2 className="text-xl font-bold">GitHub repository</h2>
        <div className="mt-3 rounded-md border bg-[var(--panel-strong)] p-3 text-sm">
          {githubStatus.connected ? (
            <p>
              Connected as <span className="font-bold">@{githubStatus.username}</span>
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[var(--muted-foreground)]">
                Connect GitHub to create private or public repositories.
              </p>
              <Button size="sm" onClick={() => { window.location.href = "/api/auth/github/start"; }}>
                Connect GitHub
              </Button>
            </div>
          )}
        </div>
        <div className="mt-4 grid gap-4">
          <Field label="Repo name" value={repoName} onChange={setRepoName} />
          <Field label="Description" value={description} onChange={setDescription} />
          <div>
            <p className="text-sm font-bold">Visibility</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant={visibility === "private" ? "secondary" : "ghost"}
                onClick={() => setVisibility("private")}
              >
                Private
              </Button>
              <Button
                variant={visibility === "public" ? "secondary" : "ghost"}
                onClick={() => setVisibility("public")}
              >
                Public
              </Button>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                checked={includeStarterFiles}
                className="h-4 w-4 accent-[var(--primary)]"
                onChange={(event) => setIncludeStarterFiles(event.target.checked)}
                type="checkbox"
              />
              Include starter app and generated docs
            </label>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                checked={includeIssues}
                className="h-4 w-4 accent-[var(--primary)]"
                onChange={(event) => setIncludeIssues(event.target.checked)}
                type="checkbox"
              />
              Create GitHub issues
            </label>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input className="h-4 w-4 accent-[var(--primary)]" type="checkbox" checked readOnly />
              Prepare Codex handoff prompt
            </label>
          </div>
        </div>
        {repoState.message ? (
          <div
            className={cn(
              "mt-4 rounded-md border p-3 text-sm",
              repoState.status === "error"
                ? "border-[var(--danger)] text-[var(--danger)]"
                : "bg-[var(--panel-strong)]",
            )}
          >
            <p>{repoState.message}</p>
            {repoState.url ? (
              <a className="mt-1 block font-bold underline" href={repoState.url}>
                {repoState.url}
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button
            disabled={!githubStatus.connected || repoState.status === "creating"}
            onClick={createRepo}
          >
            <GitBranch size={16} aria-hidden="true" />
            {repoState.status === "creating" ? "Creating..." : "Create repo"}
          </Button>
          {!githubStatus.connected ? (
            <Button variant="secondary" onClick={onRefreshGitHubStatus}>
              Refresh status
            </Button>
          ) : null}
          <Button variant="secondary">Copy handoff</Button>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--panel)] p-4">
        <AuthHealthPanel githubStatus={githubStatus} />
        <h2 className="text-lg font-bold">Generated structure</h2>
        <pre className="mt-3 overflow-auto rounded-md border bg-[var(--panel-strong)] p-3 font-mono text-xs leading-6">
{`my-product/
  README.md
  PRD.md
  AGENTS.md
  app/
    layout.tsx
    page.tsx
  components/
    app-shell.tsx
  lib/
    utils.ts
  db/
    schema.ts
  docs/
    decisions.md
    roadmap.md
    prompts.md`}
        </pre>
      </section>
    </div>
  );
}

function AuthHealthPanel({ githubStatus }: { githubStatus: GitHubStatus }) {
  return (
    <div className="mb-4 rounded-md border bg-[var(--panel-strong)] p-3">
      <h2 className="text-sm font-bold">Auth health</h2>
      <div className="mt-3 grid gap-2 text-sm">
        <StatusRow
          label="GitHub OAuth"
          status={githubStatus.connected ? `@${githubStatus.username ?? "connected"}` : "Disconnected"}
        />
        <StatusRow label="Conduit" status="Local session" />
        <StatusRow label="OpenCode" status="Feature flagged" />
      </div>
    </div>
  );
}

function Field({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded-md border bg-[var(--panel-strong)] px-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function MobileTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}) {
  return (
    <nav
      aria-label="Mobile primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-[var(--panel)]/96 px-2 py-2 backdrop-blur lg:hidden"
    >
      {navItems.map((item) => (
        <button
          key={item.id}
          className={cn(
            "grid h-14 place-items-center rounded-md text-[11px] font-bold",
            activeTab === item.id ? "bg-[var(--muted)] text-[var(--foreground)]" : "text-[var(--muted-foreground)]",
          )}
          onClick={() => setActiveTab(item.id)}
          type="button"
        >
          <item.icon size={19} aria-hidden="true" />
          {item.label}
        </button>
      ))}
    </nav>
  );
}
