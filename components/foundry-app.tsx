"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { artifacts, brainstormMessages, buildEvents, projects as mockProjects } from "@/lib/mock-data";
import type { BuildEvent, Project } from "@/lib/domain";
import { cn } from "@/lib/utils";

const mark = `███████╗███╗   ██╗
██╔════╝████╗  ██║
█████╗  ██╔██╗ ██║
██╔══╝  ██║╚██╗██║
██║     ██║ ╚████║`;

const navItems = [
  { id: "projects", label: "Projects", short: "proj" },
  { id: "idea", label: "Idea", short: "idea" },
  { id: "spec", label: "Spec", short: "spec" },
  { id: "build", label: "Build", short: "build" },
  { id: "repo", label: "Repo", short: "repo" },
] as const;

type TabId = (typeof navItems)[number]["id"];

type GitHubStatus =
  | { connected: false; username?: never; scope?: never }
  | { connected: true; username?: string | null; scope?: string | null };

type OpenCodeJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  error?: string | null;
};

export function FoundryApp() {
  const [activeTab, setActiveTab] = useState<TabId>("projects");
  const [projectList, setProjectList] = useState<Project[]>(mockProjects);
  const [activeProject, setActiveProject] = useState<Project>(mockProjects[0]);
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>({ connected: false });
  const [githubStatusState, setGithubStatusState] = useState<"loading" | "ready" | "error">("loading");

  const activeArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.projectId === activeProject.id && artifact.type === "prd") ?? artifacts[0],
    [activeProject.id],
  );

  async function refreshGitHubStatus() {
    try {
      setGithubStatusState("loading");
      const response = await fetch("/api/auth/github/status", { cache: "no-store" });

      if (!response.ok) throw new Error("GitHub status failed.");

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
        if (!response.ok) throw new Error("Project fetch failed.");
        return response.json() as Promise<{ projects: Project[] }>;
      })
      .then((payload) => {
        if (isMounted && payload.projects.length > 0) {
          setProjectList(payload.projects);
          setActiveProject(payload.projects[0]);
        }
      })
      .catch(() => undefined);

    void fetch("/api/auth/github/status", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("GitHub status failed.");
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
    <main className="foundry-shell">
      <MobileStatusBar />
      <TopNav activeTab={activeTab} onNew={() => setActiveTab("idea")} onSelect={setActiveTab} />

      {activeTab === "projects" ? (
        <ProjectsView
          activeProject={activeProject}
          onContinue={() => setActiveTab("idea")}
          onSelect={(project) => setActiveProject(project)}
          projects={projectList}
        />
      ) : null}

      {activeTab === "idea" || activeTab === "spec" ? (
        <IdeaSpecView
          activeArtifact={activeArtifact}
          activeProject={activeProject}
          onProjectCreated={(project) => {
            setProjectList((current) => [project, ...current]);
            setActiveProject(project);
            setActiveTab("spec");
          }}
        />
      ) : null}

      {activeTab === "build" || activeTab === "repo" ? (
        <RepoBuildView
          githubStatus={githubStatus}
          githubStatusState={githubStatusState}
          key={activeProject.id}
          onRefreshGitHubStatus={refreshGitHubStatus}
          project={activeProject}
        />
      ) : null}

      <MobileTabs activeTab={activeTab} setActiveTab={setActiveTab} />
    </main>
  );
}

function MobileStatusBar() {
  return (
    <div className="mobile-status" aria-hidden="true">
      <span>9:41</span>
      <span>•••  􀙇  ▰</span>
    </div>
  );
}

function TopNav({
  activeTab,
  onNew,
  onSelect,
}: {
  activeTab: TabId;
  onNew: () => void;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <header className="paper-nav">
      <button className="brand-lockup" onClick={() => onSelect("projects")} type="button">
        <pre>{mark}</pre>
        <span>Foundry</span>
      </button>

      <nav aria-label="Primary" className="paper-nav-items">
        {navItems.map((item) => (
          <button
            className={cn("paper-nav-item", activeTab === item.id && "is-active")}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            {activeTab === item.id ? `[x] ${item.label}` : item.label}
          </button>
        ))}
        <Button onClick={onNew}>New</Button>
      </nav>

      <Button className="mobile-create" onClick={onNew} size="icon" aria-label="New project">
        +
      </Button>
    </header>
  );
}

function ProjectsView({
  activeProject,
  onContinue,
  onSelect,
  projects,
}: {
  activeProject: Project;
  onContinue: () => void;
  onSelect: (project: Project) => void;
  projects: Project[];
}) {
  return (
    <section className="projects-body">
      <div className="projects-table" role="table" aria-label="Projects">
        <div className="projects-header" role="row">
          <span>state</span>
          <span>project</span>
          <span>stage</span>
          <span>repo</span>
        </div>
        {projects.map((project) => (
          <button
            className="project-table-row"
            key={project.id}
            onClick={() => onSelect(project)}
            type="button"
          >
            <span className={activeProject.id === project.id ? "ink-strong" : "ink-muted"}>
              {activeProject.id === project.id ? "[x]" : "[+]"}
            </span>
            <strong>{project.name}</strong>
            <span>{project.stage}</span>
            <span className="ink-muted">{project.repoUrl ? "connected" : "pending"}</span>
            <span className="mobile-chevron">›</span>
          </button>
        ))}
      </div>

      <div className="quick-start">
        <h2>[+] quick start</h2>
        <button className="snippet-row" onClick={onContinue} type="button">
          <span>new idea --voice</span>
          <span>enter</span>
        </button>
      </div>
    </section>
  );
}

function IdeaSpecView({
  activeArtifact,
  activeProject,
  onProjectCreated,
}: {
  activeArtifact: (typeof artifacts)[number];
  activeProject: Project;
  onProjectCreated: (project: Project) => void;
}) {
  const [idea, setIdea] = useState(
    "A mobile app that turns product ideas into scoped MVP repositories.",
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
      const payload = (await response.json()) as { project?: Project };

      if (!response.ok || !payload.project) throw new Error("Project creation failed.");

      onProjectCreated(payload.project);
      setCreateState("idle");
    } catch {
      setCreateState("error");
    }
  }

  return (
    <section className="workbench-body">
      <div className="brainstorm-pane">
        <label className="idea-input">
          <textarea value={idea} onChange={(event) => setIdea(event.target.value)} />
          <span>shift-enter newline</span>
        </label>

        <div className="paper-actions">
          <Button disabled={createState === "creating"} onClick={createProject}>
            {createState === "creating" ? "Creating..." : "Ask next"}
          </Button>
          <Button variant="secondary" onClick={createProject}>
            Infer defaults
          </Button>
        </div>

        <div className="transcript-block">
          <h2>[+] guided questions</h2>
          {brainstormMessages.slice(0, 2).map((message) => (
            <div className="transcript-row" key={message.id}>
              <span>{message.role === "assistant" ? "ai" : "you"}</span>
              <p>{message.content}</p>
            </div>
          ))}
        </div>
        {createState === "error" ? <p className="error-line">Could not create project.</p> : null}
      </div>

      <div className="spec-pane">
        <div className="section-row section-row-head">
          <strong>[+] product summary</strong>
          <span>structured</span>
        </div>
        <div className="section-row">
          <span>user</span>
          <p>Solo technical founder</p>
        </div>
        <div className="section-row">
          <span>scope</span>
          <p>{activeProject.scopeLevel} · repo + handoff first</p>
        </div>

        <div className="prd-preview">
          <h2>[x] PRD.md preview</h2>
          <pre>{activeArtifact.content.split("\n").slice(0, 3).join("\n")}</pre>
        </div>
      </div>
    </section>
  );
}

function RepoBuildView({
  githubStatus,
  githubStatusState,
  onRefreshGitHubStatus,
  project,
}: {
  githubStatus: GitHubStatus;
  githubStatusState: "loading" | "ready" | "error";
  onRefreshGitHubStatus: () => Promise<void>;
  project: Project;
}) {
  const [repoName, setRepoName] = useState(project.slug);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [includeIssues, setIncludeIssues] = useState(true);
  const [repoState, setRepoState] = useState<{
    status: "idle" | "creating" | "success" | "error";
    message?: string;
    url?: string;
  }>({ status: "idle" });
  const [buildJob, setBuildJob] = useState<OpenCodeJob | null>(null);
  const [buildEventRows, setBuildEventRows] = useState<BuildEvent[]>([]);
  const [buildState, setBuildState] = useState<"idle" | "starting" | "error">("idle");
  const buildJobId = buildJob?.id;

  useEffect(() => {
    let isMounted = true;

    void Promise.resolve().then(() => {
      if (isMounted) setBuildEventRows([]);
    });

    void fetch(`/api/opencode/jobs?projectId=${encodeURIComponent(project.id)}`, {
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error("Latest job fetch failed.");
        return response.json() as Promise<{ job: OpenCodeJob | null }>;
      })
      .then((payload) => {
        if (isMounted) setBuildJob(payload.job);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [project.id]);

  useEffect(() => {
    if (!buildJobId) return;

    let isMounted = true;
    let after = 0;
    const jobId = buildJobId;

    async function pollEvents() {
      while (isMounted) {
        const response = await fetch(`/api/opencode/jobs/${jobId}/events?after=${after}`, {
          cache: "no-store",
        });

        if (response.ok) {
          const payload = (await response.json()) as { events: BuildEvent[] };
          if (payload.events.length > 0) {
            after = payload.events[payload.events.length - 1].sequence;
            setBuildEventRows((current) => [...current, ...payload.events]);
          }
        }

        const jobResponse = await fetch(`/api/opencode/jobs/${jobId}`, { cache: "no-store" });
        if (jobResponse.ok) {
          const payload = (await jobResponse.json()) as { job: OpenCodeJob };
          setBuildJob(payload.job);

          if (payload.job.status === "succeeded" || payload.job.status === "failed") {
            return;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }

    void pollEvents().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [buildJobId]);

  async function createRepo() {
    if (!githubStatus.connected) {
      window.location.href = "/api/auth/github/start";
      return;
    }

    setRepoState({ status: "creating", message: "creating repo..." });

    try {
      const response = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          name: repoName,
          description: project.oneLiner,
          visibility,
          includeStarterFiles: true,
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

      setRepoState({ status: "success", message: "repo created", url: payload.repository.url });
    } catch (error) {
      setRepoState({
        status: "error",
        message: error instanceof Error ? error.message : "Repository creation failed.",
      });
    }
  }

  async function runBuild() {
    setBuildState("starting");
    setBuildEventRows([]);

    try {
      const response = await fetch("/api/opencode/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          permissions: {
            edit: true,
            shell: true,
            web: false,
            subagents: false,
          },
        }),
      });
      const payload = (await response.json()) as {
        job?: OpenCodeJob;
        error?: { message: string };
      };

      if (!response.ok || !payload.job) {
        throw new Error(payload.error?.message ?? "Unable to start OpenCode build.");
      }

      setBuildJob(payload.job);
      setBuildState("idle");
    } catch (error) {
      setBuildState("error");
      setBuildEventRows([
        {
          id: "local-build-error",
          sequence: 1,
          type: "error",
          message: error instanceof Error ? error.message : "Unable to start OpenCode build.",
        },
      ]);
    }
  }

  return (
    <section className="repo-build-body">
      <div className="repo-form">
        <ConfigRow label="repo">
          <input value={repoName} onChange={(event) => setRepoName(event.target.value)} />
        </ConfigRow>
        <ConfigRow label="visibility">
          <button onClick={() => setVisibility(visibility === "private" ? "public" : "private")} type="button">
            {visibility}
          </button>
        </ConfigRow>
        <ConfigRow label="issues">
          <button onClick={() => setIncludeIssues((value) => !value)} type="button">
            {includeIssues ? "[x]" : "[ ]"}
          </button>
        </ConfigRow>
        <ConfigRow label="github">
          <button
            onClick={githubStatus.connected ? onRefreshGitHubStatus : () => { window.location.href = "/api/auth/github/start"; }}
            type="button"
          >
            {githubStatusState === "loading"
              ? "checking"
              : githubStatus.connected
                ? `@${githubStatus.username ?? "connected"}`
                : "connect"}
          </button>
        </ConfigRow>

        <div className="paper-actions">
          <Button disabled={repoState.status === "creating"} onClick={createRepo}>
            {repoState.status === "creating" ? "Creating..." : "Create repo"}
          </Button>
          <Button disabled={buildState === "starting"} onClick={runBuild} variant="secondary">
            {buildState === "starting" ? "Starting..." : "Run build"}
          </Button>
          <Button variant="secondary">Copy prompt</Button>
        </div>

        {repoState.message ? (
          <p className={cn("repo-message", repoState.status === "error" && "is-error")}>
            {repoState.url ? <a href={repoState.url}>{repoState.message}</a> : repoState.message}
          </p>
        ) : null}

        <div className="generated-files">
          <h2>[x] generated files</h2>
          {["README.md", "PRD.md", "AGENTS.md"].map((file) => (
            <p key={file}>[x] {file}</p>
          ))}
        </div>
      </div>

      <div className="build-terminal">
        <pre>{mark}</pre>
        <div className="terminal-prompt">
          <span>|</span>
          <span>Run</span>
          <strong>opencode build</strong>
        </div>
        <div className="terminal-events">
          {(buildEventRows.length > 0 ? buildEventRows : buildEvents).map((event, index) => (
            <p key={event.id} className={index === 0 ? "success-line" : undefined}>
              {index === 0 ? "[x]" : "[+]"} {event.message.toLowerCase()}
            </p>
          ))}
          {buildJob ? <p>job {buildJob.status}</p> : null}
          <p>tab switch agent ctrl-p commands</p>
        </div>
      </div>
    </section>
  );
}

function ConfigRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="config-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function MobileTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}) {
  const mobileItems =
    activeTab === "projects"
      ? [navItems[0], navItems[1], navItems[2], navItems[4]]
      : [navItems[1], navItems[2], navItems[3], navItems[4]];

  return (
    <nav aria-label="Mobile primary" className="mobile-tabs">
      {mobileItems.map((item) => (
        <button
          className={cn("mobile-tab", activeTab === item.id && "is-active")}
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          type="button"
        >
          <span>{activeTab === item.id ? "[x]" : "[ ]"}</span>
          <small>{item.short}</small>
        </button>
      ))}
    </nav>
  );
}
