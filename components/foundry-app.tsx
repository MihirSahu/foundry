"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftOpen, Plus, Send } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import type {
  BuildEvent,
  Message,
  Project,
  ProjectArtifact,
  ProjectSessionState,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

const sidebarAscii = String.raw`███████╗███╗   ██╗
██╔════╝████╗  ██║
█████╗  ██╔██╗ ██║
██╔══╝  ██║╚██╗██║
██║     ██║ ╚████║`;

const starters = [
  "repo-first MVP",
  "make it smaller",
  "launchable later",
];

type GitHubStatus =
  | { configured?: boolean; connected: false; username?: never; scope?: never }
  | { configured?: boolean; connected: true; username?: string | null; scope?: string | null };

type OpenCodeJob = {
  id: string;
  projectId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectRepository = {
  owner: string;
  name: string;
  url: string;
  visibility: string;
  defaultBranch: string;
};

type SessionPayload = {
  project: Project;
  messages: Message[];
  artifacts: ProjectArtifact[];
  sessionState: ProjectSessionState;
  latestJob: OpenCodeJob | null;
  repository: ProjectRepository | null;
};

type ViewMode = "chat" | "settings";
type BusyAction = "none" | "start" | "send" | "spec" | "submit" | "save" | "pause";

function mergeBuildEvents(current: BuildEvent[], incoming: BuildEvent[]) {
  const eventsByKey = new Map<string, BuildEvent>();

  for (const event of [...current, ...incoming]) {
    eventsByKey.set(`${event.id}:${event.sequence}`, event);
  }

  return [...eventsByKey.values()].sort((a, b) => a.sequence - b.sequence);
}

export function FoundryApp() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [view, setView] = useState<ViewMode>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composer, setComposer] = useState("");
  const [specDraft, setSpecDraft] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction>("none");
  const [error, setError] = useState<string | null>(null);
  const [githubStatus, setGitHubStatus] = useState<GitHubStatus>({ configured: false, connected: false });
  const [githubStatusState, setGitHubStatusState] = useState<"loading" | "ready" | "error">("loading");
  const [conduitStatusState, setConduitStatusState] = useState<"ready" | "checking">("ready");
  const [buildEvents, setBuildEvents] = useState<BuildEvent[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const didSelectInitialProject = useRef(false);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? session?.project ?? null,
    [activeProjectId, projects, session],
  );

  const latestPrd = useMemo(
    () =>
      session?.artifacts
        .filter((artifact) => artifact.type === "prd")
        .sort((a, b) => b.version - a.version)[0],
    [session?.artifacts],
  );

  const loadProjects = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load projects.");
    const payload = (await response.json()) as { projects: Project[] };
    setProjects(payload.projects);

    if (!didSelectInitialProject.current) {
      didSelectInitialProject.current = true;
      const initialProjectId = payload.projects[0]?.id ?? null;
      setLoadingSessionId(initialProjectId);
      setActiveProjectId(initialProjectId);
    }
  }, []);

  const loadSession = useCallback(async (projectId: string) => {
    const response = await fetch(`/api/projects/${projectId}/session`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load session.");
    const payload = (await response.json()) as SessionPayload;
    setSession(payload);
    setActiveProjectId(payload.project.id);

    const prd = payload.artifacts
      .filter((artifact) => artifact.type === "prd")
      .sort((a, b) => b.version - a.version)[0];
    setSpecDraft(prd?.content ?? "");
  }, []);

  const refreshGitHubStatus = useCallback(async () => {
    try {
      setGitHubStatusState("loading");
      const response = await fetch("/api/auth/github/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load GitHub status.");
      setGitHubStatus((await response.json()) as GitHubStatus);
      setGitHubStatusState("ready");
    } catch {
      setGitHubStatus({ configured: false, connected: false });
      setGitHubStatusState("error");
    }
  }, []);

  const checkConduitStatus = useCallback(() => {
    setConduitStatusState("checking");
    window.setTimeout(() => {
      setConduitStatusState("ready");
    }, 500);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProjects()
        .catch(() => setError("Projects could not be loaded."))
        .finally(() => setIsBooting(false));
      void refreshGitHubStatus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProjects, refreshGitHubStatus]);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadingSessionId(activeProjectId);
      void loadSession(activeProjectId)
        .catch(() => setError("Session could not be loaded."))
        .finally(() => {
          setLoadingSessionId((current) => (current === activeProjectId ? null : current));
        });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeProjectId, loadSession]);

  useEffect(() => {
    if (!session?.latestJob?.id) {
      return;
    }

    let isMounted = true;
    let after = 0;
    const jobId = session.latestJob.id;

    async function poll() {
      while (isMounted) {
        const eventResponse = await fetch(`/api/opencode/jobs/${jobId}/events?after=${after}`, {
          cache: "no-store",
        });

        if (eventResponse.ok) {
          const payload = (await eventResponse.json()) as { events: BuildEvent[] };
          if (payload.events.length > 0) {
            after = payload.events[payload.events.length - 1].sequence;
            setBuildEvents((current) => mergeBuildEvents(current, payload.events));
          }
        }

        if (activeProjectId) {
          await loadSession(activeProjectId).catch(() => undefined);
        }

        const jobResponse = await fetch(`/api/opencode/jobs/${jobId}`, { cache: "no-store" });
        const jobPayload = jobResponse.ok
          ? ((await jobResponse.json()) as { job: OpenCodeJob | null })
          : { job: null };

        if (
          jobPayload.job?.status === "succeeded" ||
          jobPayload.job?.status === "failed" ||
          jobPayload.job?.status === "canceled"
        ) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    void poll().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [activeProjectId, loadSession, session?.latestJob?.id]);

  async function startSession(text = composer) {
    const idea = text.trim();
    if (!idea) return;

    setBusyAction("start");
    setError(null);

    try {
      const createResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      const createPayload = (await createResponse.json()) as { project?: Project };
      if (!createResponse.ok || !createPayload.project) throw new Error("Could not create session.");

      setProjects((current) => [createPayload.project!, ...current]);
      setLoadingSessionId(createPayload.project.id);
      setActiveProjectId(createPayload.project.id);
      setComposer("");

      await fetch(`/api/projects/${createPayload.project.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: idea }),
      });
      await loadSession(createPayload.project.id);
      setLoadingSessionId(null);
    } catch {
      setLoadingSessionId(null);
      setError("Could not start the session.");
    } finally {
      setBusyAction("none");
    }
  }

  async function sendMessage() {
    if (!activeProject || !composer.trim()) return;

    setBusyAction("send");
    setError(null);

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: composer }),
      });
      if (!response.ok) throw new Error("Message failed.");
      setComposer("");
      await loadSession(activeProject.id);
    } catch {
      setError("Could not send that message.");
    } finally {
      setBusyAction("none");
    }
  }

  async function generateSpec() {
    if (!activeProject) return;

    setBusyAction("spec");
    setError(null);

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/spec`, { method: "POST" });
      if (!response.ok) throw new Error("Spec generation failed.");
      await loadSession(activeProject.id);
    } catch {
      setError("The chat needs more product context before Foundry can generate a spec.");
    } finally {
      setBusyAction("none");
    }
  }

  async function submitSpec() {
    if (!activeProject) return;

    setBusyAction("submit");
    setError(null);

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/spec/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: specDraft,
          createRepo: session?.sessionState.repoRequested ?? false,
          runBuild: session?.sessionState.buildRequested ?? true,
        }),
      });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Spec submission failed.");
      await loadSession(activeProject.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit the spec.");
    } finally {
      setBusyAction("none");
    }
  }

  async function saveSpecDraft() {
    if (!activeProject || !specDraft.trim()) return;

    setBusyAction("save");
    setError(null);

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/spec`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: specDraft }),
      });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not save the draft.");
      await loadSession(activeProject.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the draft.");
    } finally {
      setBusyAction("none");
    }
  }

  async function pauseBuild() {
    const jobId = session?.latestJob?.id;
    if (!activeProject || !jobId) return;

    setBusyAction("pause");
    setError(null);

    try {
      const response = await fetch(`/api/opencode/jobs/${jobId}/pause`, { method: "POST" });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not pause the build.");
      await loadSession(activeProject.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not pause the build.");
    } finally {
      setBusyAction("none");
    }
  }

  function selectProject(projectId: string) {
    if (projectId === activeProjectId) {
      setView("chat");
      setSidebarOpen(false);

      if (!session || session.project.id !== projectId) {
        setLoadingSessionId(projectId);
        void loadSession(projectId)
          .catch(() => setError("Session could not be loaded."))
          .finally(() => {
            setLoadingSessionId((current) => (current === projectId ? null : current));
          });
      }

      return;
    }

    setLoadingSessionId(projectId);
    setSession(null);
    setSpecDraft("");
    setActiveProjectId(projectId);
    setBuildEvents([]);
    setView("chat");
    setSidebarOpen(false);
  }

  function newSession() {
    setActiveProjectId(null);
    setLoadingSessionId(null);
    setSession(null);
    setComposer("");
    setSpecDraft("");
    setView("chat");
    setSidebarOpen(false);
  }

  const main = isBooting ? (
    <BootView />
  ) : view === "settings" ? (
    <SettingsView
      githubStatus={githubStatus}
      githubStatusState={githubStatusState}
      conduitStatusState={conduitStatusState}
      onCheckConduitStatus={checkConduitStatus}
      onRefreshGitHubStatus={refreshGitHubStatus}
    />
  ) : (
    <ChatWorkspace
      activeProject={activeProject}
      busyAction={busyAction}
      buildEvents={buildEvents}
      composer={composer}
      error={error}
      latestPrd={latestPrd}
      isSessionLoading={Boolean(activeProjectId && loadingSessionId === activeProjectId)}
      onComposerChange={setComposer}
      onGenerateSpec={generateSpec}
      onSend={sendMessage}
      onSaveDraft={saveSpecDraft}
      onSpecDraftChange={setSpecDraft}
      onStart={startSession}
      onOpenRecent={() => {
        if (projects[0]) selectProject(projects[0].id);
      }}
      onPauseBuild={pauseBuild}
      onSubmitSpec={submitSpec}
      session={session}
      specDraft={specDraft}
    />
  );

  return (
    <main className="foundry-app-shell">
      <MobileHeader
        onNew={newSession}
        onOpenSidebar={() => setSidebarOpen(true)}
        title={view === "settings" ? "Settings" : activeProject?.name ?? "New session"}
      />

      <AppSidebar
        activeProjectId={activeProjectId}
        githubStatus={githubStatus}
        githubStatusState={githubStatusState}
        conduitStatusState={conduitStatusState}
        isOpen={sidebarOpen}
        isBooting={isBooting}
        loadingSessionId={loadingSessionId}
        onClose={() => setSidebarOpen(false)}
        onNew={newSession}
        onOpenSettings={() => {
          setView("settings");
          setSidebarOpen(false);
        }}
        onSelectProject={selectProject}
        projects={projects}
        view={view}
      />

      <section className="workspace-shell">{main}</section>
    </main>
  );
}

function BootView() {
  return (
    <div className="boot-view" aria-busy="true" aria-live="polite">
      <div className="boot-copy">
        <span>[+] loading sessions</span>
        <h1>Opening Foundry</h1>
      </div>
      <div className="boot-skeleton-grid" aria-hidden="true">
        <section className="skeleton-panel is-wide">
          <SkeletonLine className="skeleton-line-label" />
          <SkeletonLine className="skeleton-line-title" />
          <SkeletonLine />
          <SkeletonLine className="skeleton-line-short" />
        </section>
        <section className="skeleton-panel">
          <SkeletonLine className="skeleton-line-label" />
          <SkeletonLine />
          <SkeletonLine />
          <SkeletonLine className="skeleton-line-short" />
        </section>
      </div>
    </div>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("skeleton-line", className)} />;
}

function SidebarSessionSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="session-row session-row-skeleton" key={index} aria-hidden="true">
          <SkeletonLine className="skeleton-marker" />
          <div>
            <SkeletonLine className="skeleton-session-title" />
            <SkeletonLine className="skeleton-session-meta" />
          </div>
        </div>
      ))}
    </>
  );
}

function SessionSkeletonView() {
  return (
    <div className="session-loading-workspace" aria-busy="true" aria-live="polite">
      <section className="session-loading-main">
        <div className="session-loading-head" aria-hidden="true">
          <div>
            <SkeletonLine className="skeleton-line-title" />
            <SkeletonLine className="skeleton-line-label" />
          </div>
          <SkeletonLine className="skeleton-action" />
        </div>
        <div className="session-loading-messages" aria-hidden="true">
          <div className="chat-message skeleton-chat-message">
            <SkeletonLine className="skeleton-line-label" />
            <SkeletonLine />
            <SkeletonLine className="skeleton-line-short" />
          </div>
          <div className="chat-message skeleton-chat-message is-user">
            <SkeletonLine className="skeleton-line-label" />
            <SkeletonLine />
          </div>
          <div className="chat-composer skeleton-composer">
            <SkeletonLine className="skeleton-textarea" />
            <SkeletonLine className="skeleton-button" />
          </div>
        </div>
      </section>
      <aside className="session-loading-side" aria-hidden="true">
        <SkeletonLine className="skeleton-line-title" />
        <SkeletonLine />
        <SkeletonLine />
        <SkeletonLine className="skeleton-line-short" />
        <SkeletonLine className="skeleton-button" />
      </aside>
    </div>
  );
}

function MobileHeader({
  onNew,
  onOpenSidebar,
  title,
}: {
  onNew: () => void;
  onOpenSidebar: () => void;
  title: string;
}) {
  return (
    <header className="mobile-app-header">
      <Button aria-label="Open sidebar" onClick={onOpenSidebar} size="icon" variant="ghost">
        <PanelLeftOpen aria-hidden="true" size={18} strokeWidth={1.8} />
      </Button>
      {title === "New session" ? (
        <div className="mobile-header-brand">
          <pre>{sidebarAscii}</pre>
          <strong>Foundry</strong>
        </div>
      ) : (
        <div>
          <strong>{title}</strong>
          <span>chat {"->"} spec {"->"} build</span>
        </div>
      )}
      <Button aria-label="New session" onClick={onNew} size="icon" variant="ghost">
        <Plus aria-hidden="true" size={18} strokeWidth={1.8} />
      </Button>
    </header>
  );
}

function AppSidebar({
  activeProjectId,
  githubStatus,
  githubStatusState,
  conduitStatusState,
  isOpen,
  isBooting,
  loadingSessionId,
  onClose,
  onNew,
  onOpenSettings,
  onSelectProject,
  projects,
  view,
}: {
  activeProjectId: string | null;
  githubStatus: GitHubStatus;
  githubStatusState: "loading" | "ready" | "error";
  conduitStatusState: "ready" | "checking";
  isOpen: boolean;
  isBooting: boolean;
  loadingSessionId: string | null;
  onClose: () => void;
  onNew: () => void;
  onOpenSettings: () => void;
  onSelectProject: (projectId: string) => void;
  projects: Project[];
  view: ViewMode;
}) {
  return (
    <>
      <button
        aria-label="Close sidebar"
        className={cn("sidebar-backdrop", isOpen && "is-open")}
        onClick={onClose}
        type="button"
      />
      <aside className={cn("foundry-sidebar", isOpen && "is-open")}>
        <button className="sidebar-brand" onClick={onNew} type="button">
          <pre>{sidebarAscii}</pre>
          <span>Foundry</span>
        </button>

        <Button className="sidebar-new" onClick={onNew}>
          + New session
        </Button>

        <div className="sidebar-section">
          <div className="sidebar-section-label">
            <span>[+] recent sessions</span>
            <span>{isBooting ? "" : projects.length}</span>
          </div>
          <div className="session-list">
            {isBooting && projects.length === 0 ? (
              <SidebarSessionSkeleton />
            ) : (
              projects.map((project) => (
                <button
                  className={cn(
                    "session-row",
                    activeProjectId === project.id && view === "chat" && "is-active",
                    loadingSessionId === project.id && "is-loading",
                  )}
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  type="button"
                >
                  <span>{activeProjectId === project.id && view === "chat" ? "[x]" : "[ ]"}</span>
                  <strong>{project.name}</strong>
                  <small>{project.stage}</small>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="connection-hints">
            <div>
              <span>github</span>
              {githubStatusState === "loading" ? (
                <SkeletonLine className="connection-skeleton" />
              ) : (
                <span>
                  {!githubStatus.configured
                    ? "configure"
                    : githubStatus.connected
                      ? `@${githubStatus.username ?? "connected"}`
                      : "offline"}
                </span>
              )}
            </div>
            <div>
              <span>conduit</span>
              <span>{conduitStatusState}</span>
            </div>
          </div>
          <div className="sidebar-actions-row">
            <ThemeToggle />
            <button
              className={cn("settings-row", view === "settings" && "is-active")}
              onClick={onOpenSettings}
              type="button"
            >
              <span>{view === "settings" ? "[x] Settings" : "Settings"}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="settings-row theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      type="button"
    >
      {mounted ? (isDark ? "Light" : "Dark") : "Theme"}
    </button>
  );
}

function ChatWorkspace({
  activeProject,
  busyAction,
  buildEvents,
  composer,
  error,
  latestPrd,
  isSessionLoading,
  onComposerChange,
  onGenerateSpec,
  onSend,
  onSaveDraft,
  onSpecDraftChange,
  onStart,
  onOpenRecent,
  onPauseBuild,
  onSubmitSpec,
  session,
  specDraft,
}: {
  activeProject: Project | null;
  busyAction: BusyAction;
  buildEvents: BuildEvent[];
  composer: string;
  error: string | null;
  latestPrd?: ProjectArtifact;
  isSessionLoading: boolean;
  onComposerChange: (value: string) => void;
  onGenerateSpec: () => void;
  onSend: () => void;
  onSaveDraft: () => void;
  onSpecDraftChange: (value: string) => void;
  onStart: (text?: string) => void;
  onOpenRecent: () => void;
  onPauseBuild: () => void;
  onSubmitSpec: () => void;
  session: SessionPayload | null;
  specDraft: string;
}) {
  const state = session?.sessionState;
  const showSpec = state?.stage === "spec_ready" || state?.stage === "spec_approved";
  const showBuild =
    state?.stage === "building" ||
    state?.stage === "built" ||
    state?.stage === "repo_created" ||
    state?.stage === "handoff_ready";

  if (isSessionLoading) {
    return <SessionSkeletonView />;
  }

  if (!activeProject || !session) {
    return (
      <div className="chat-home">
        <div className="home-header">
          <div>
            <span>[+] new product session</span>
            <h1>New session</h1>
            <p>
              Start with a rough idea. Foundry will ask only the missing questions, then turn
              the chat into a spec and build run.
            </p>
          </div>
          <div className="home-header-actions">
            <Button disabled={busyAction === "start"} onClick={() => onStart()}>
              {busyAction === "start" ? "Starting..." : "Start chat"}
            </Button>
            <Button onClick={onOpenRecent} type="button" variant="secondary">
              Open recent
            </Button>
          </div>
        </div>

        <div className="mobile-home-intro">
          <span>[+] new product session</span>
          <h1>Tell Foundry what you want to build.</h1>
          <p>
            It will ask the missing questions, draft the MVP spec, then submit it into a build.
          </p>
        </div>

        <div className="mobile-first-message">
          <strong>[+] first message</strong>
          <span>questions {"->"} spec {"->"} build</span>
        </div>

        <div className="home-panels">
          <section className="home-composer-panel">
            <div className="panel-title">[x] session composer</div>
            <label>
              <textarea
                aria-label="Describe the product idea"
                onChange={(event) => onComposerChange(event.target.value)}
                placeholder="Describe the product idea..."
                value={composer}
              />
            </label>
            <div className="starter-chips">
              {starters.map((starter) => (
                <button key={starter} onClick={() => onStart(starter)} type="button">
                  {starter}
                </button>
              ))}
            </div>
            <Button
              className="mobile-start-session"
              disabled={busyAction === "start" || !composer.trim()}
              onClick={() => onStart()}
              type="button"
            >
              {busyAction === "start" ? "Starting..." : "Start session"}
            </Button>
          </section>

          <ArtifactPreview />
        </div>
        {error ? <p className="error-line">{error}</p> : null}
      </div>
    );
  }

  if (showSpec) {
    return (
      <div className="review-workspace">
        <section className="review-main">
          <div className="review-title">
            <span>[x] generated artifact</span>
            <h1>Spec review</h1>
          </div>
          <SpecReview
            latestPrd={latestPrd}
            onChange={onSpecDraftChange}
            value={specDraft}
          />
        </section>
        <aside className="review-side">
          <SubmitBehavior
            onSaveDraft={onSaveDraft}
            onSubmit={onSubmitSpec}
            saving={busyAction === "save"}
            submitting={busyAction === "submit"}
          />
          {error ? <p className="error-line">{error}</p> : null}
        </aside>
      </div>
    );
  }

  if (showBuild) {
    return (
      <div className="build-workspace">
        <section className="build-main">
          <div className="review-title">
            <span>[+] opencode worker</span>
            <h1>Build running</h1>
          </div>
          <BuildStatus events={buildEvents} job={session.latestJob} repository={session.repository} />
        </section>
        <aside className="build-side">
          <BuildContext
            busy={busyAction === "pause"}
            job={session.latestJob}
            onPause={onPauseBuild}
            repoRequested={session.sessionState.repoRequested}
          />
          {error ? <p className="error-line">{error}</p> : null}
        </aside>
      </div>
    );
  }

  return (
    <div className="active-session-workspace">
      <section className="active-chat-main">
        <div className="active-chat-top">
          <div>
            <strong>{activeProject.name}</strong>
            <span>question {Math.min(session.messages.length + 1, 5)} of 5</span>
          </div>
          <Button onClick={onGenerateSpec} type="button" variant="secondary">
            Infer defaults
          </Button>
        </div>
        <div className="message-list">
          {session.messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {state?.missingFields.length ? (
            <div className="missing-fields">
              <strong>[ ] still needed</strong>
              <span>{state.missingFields.join(", ")}</span>
            </div>
          ) : null}
        </div>
        <NextStepCallout
          busyAction={busyAction}
          onGenerateSpec={onGenerateSpec}
          onSubmitSpec={onSubmitSpec}
          state={state}
        />
        <Composer
          busy={busyAction === "send"}
          onChange={onComposerChange}
          onSubmit={onSend}
          placeholder="Answer, skip, or ask Foundry to infer..."
          submitLabel="Send"
          value={composer}
        />
        {error ? <p className="error-line">{error}</p> : null}
      </section>
      <aside className="active-summary-side">
        <ProductState state={state} />
        <NextActionHint state={state} />
      </aside>
    </div>
  );
}

function Composer({
  busy,
  onChange,
  onSubmit,
  placeholder,
  submitLabel,
  value,
}: {
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  submitLabel: string;
  value: string;
}) {
  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      <Button disabled={busy || !value.trim()} type="submit">
        {submitLabel === "Send" ? <Send aria-hidden="true" size={16} strokeWidth={1.8} /> : null}
        {busy ? "Working..." : submitLabel}
      </Button>
    </form>
  );
}

function ChatMessage({ message }: { message: Message }) {
  return (
    <article className={cn("chat-message", message.role === "user" && "is-user")}>
      <span>{message.role === "assistant" ? "foundry" : message.role}</span>
      <p>{message.content}</p>
    </article>
  );
}

function NextStepCallout({
  busyAction,
  onGenerateSpec,
  onSubmitSpec,
  state,
}: {
  busyAction: BusyAction;
  onGenerateSpec: () => void;
  onSubmitSpec: () => void;
  state?: ProjectSessionState;
}) {
  const action = state?.nextAction;

  if (!action || action.type === "ask_question") {
    return (
      <div className="next-step-callout">
        <div>
          <strong>[+] next step</strong>
          <span>Answer the latest question, or ask Foundry to infer a sensible default.</span>
        </div>
      </div>
    );
  }

  if (state?.nextAction.type === "generate_spec") {
    return (
      <div className="next-step-callout is-ready">
        <div>
          <strong>[x] ready for spec</strong>
          <span>Foundry has enough context. Generate the editable MVP spec.</span>
        </div>
        <Button disabled={busyAction === "spec"} onClick={onGenerateSpec}>
          {busyAction === "spec" ? "Generating..." : "Generate spec"}
        </Button>
      </div>
    );
  }

  if (state?.nextAction.type === "submit_spec") {
    return (
      <div className="next-step-callout is-ready">
        <div>
          <strong>[x] spec ready</strong>
          <span>Submit the approved spec to start the build workflow.</span>
        </div>
        <Button disabled={busyAction === "submit"} onClick={onSubmitSpec}>
          {busyAction === "submit" ? "Submitting..." : "Submit spec"}
        </Button>
      </div>
    );
  }

  if (state?.nextAction.type === "connect_github") {
    return (
      <div className="next-step-callout is-ready">
        <div>
          <strong>[ ] connect github</strong>
          <span>Connect GitHub so Foundry can create the requested repository.</span>
        </div>
        <Button asChild>
          <a href="/api/auth/github/start">Connect GitHub</a>
        </Button>
      </div>
    );
  }

  if (state?.nextAction.type === "open_repo") {
    return (
      <div className="next-step-callout">
        <div>
          <strong>[x] repo ready</strong>
          <span>The repository is ready. Open it from the build or repo status view.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="next-step-callout">
      <div>
        <strong>[+] view build</strong>
        <span>Foundry is building from the accepted spec. Watch the event stream for progress.</span>
      </div>
    </div>
  );
}

function NextActionHint({ state }: { state?: ProjectSessionState }) {
  const label = state?.nextAction.label ?? "Keep chatting";

  return <span className="state-pill is-subtle">next: {label}</span>;
}

function ProductState({ state }: { state?: ProjectSessionState }) {
  const summary = state?.summary;

  return (
    <div className="state-card">
      <div className="state-card-head">
        <strong>[+] live summary</strong>
        <span>structured</span>
      </div>
      <dl>
        <div>
          <dt>user</dt>
          <dd>{summary?.targetUser || "unknown"}</dd>
        </div>
        <div>
          <dt>problem</dt>
          <dd>{summary?.problem || "still being shaped"}</dd>
        </div>
        <div>
          <dt>smallest version</dt>
          <dd>{summary?.smallestUsefulVersion || "not decided yet"}</dd>
        </div>
        <div>
          <dt>repo</dt>
          <dd>{summary?.repoRequested === true ? "requested" : summary?.repoRequested === false ? "not requested" : "ask"}</dd>
        </div>
      </dl>
    </div>
  );
}

function SpecReview({
  latestPrd,
  onChange,
  value,
}: {
  latestPrd?: ProjectArtifact;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="spec-review">
      <div className="state-card-head">
        <strong>PRD.md</strong>
        <span>editable markdown</span>
      </div>
      <textarea onChange={(event) => onChange(event.target.value)} value={value} />
      <span className="spec-version">{latestPrd ? `version ${latestPrd.version}` : "draft"}</span>
    </div>
  );
}

function SubmitBehavior({
  onSaveDraft,
  onSubmit,
  saving,
  submitting,
}: {
  onSaveDraft: () => void;
  onSubmit: () => void;
  saving: boolean;
  submitting: boolean;
}) {
  return (
    <>
      <h2>[+] submit behavior</h2>
      <div className="side-rows">
        <div><span>repo</span><strong>private requested</strong></div>
        <div><span>build</span><strong>start after submit</strong></div>
        <div><span>issues</span><strong>create if planned</strong></div>
      </div>
      <Button disabled={submitting || saving} onClick={onSubmit}>
        {submitting ? "Submitting..." : "Submit spec"}
      </Button>
      <Button disabled={saving || submitting} onClick={onSaveDraft} type="button" variant="secondary">
        {saving ? "Saving..." : "Save draft"}
      </Button>
    </>
  );
}

function BuildStatus({
  events,
  job,
  repository,
}: {
  events: BuildEvent[];
  job: OpenCodeJob | null;
  repository: ProjectRepository | null;
}) {
  const visibleEvents = events.length
    ? events
    : [
        {
          id: "pending",
          sequence: 0,
          type: job?.status === "failed" ? "error" : "status",
          message: job?.status === "failed"
            ? job.error ?? "OpenCode worker failed before emitting build events."
            : job?.status === "canceled"
              ? job.error ?? "Build paused by user."
            : "Waiting for build events.",
        },
      ];

  return (
    <div className="build-status">
      <div className="build-terminal">
        <pre>{`${sidebarAscii}     BUILD STREAM`}</pre>
        <div className="terminal-command">
          <span>|</span>
          <strong>Run</strong>
          <span>opencode build</span>
        </div>
      </div>
      <div className="event-stream">
        {visibleEvents.map((event) => (
          <div className="event-row" key={event.id}>
            <span>{event.type}</span>
            <p>{event.message}</p>
          </div>
        ))}
      </div>
      {repository ? (
        <Button asChild>
          <a href={repository.url} rel="noreferrer" target="_blank">
            Open repo
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function BuildContext({
  busy,
  job,
  onPause,
  repoRequested,
}: {
  busy: boolean;
  job: OpenCodeJob | null;
  onPause: () => void;
  repoRequested?: boolean | null;
}) {
  const canPause = job?.status === "queued" || job?.status === "running";

  return (
    <>
      <h2>[+] build context</h2>
      <div className="side-rows is-stacked">
        <div><span>job</span><strong>{job?.status ? "opencode_build" : "queued"}</strong></div>
        <div><span>permissions</span><strong>edit on, shell on, web off</strong></div>
        <div><span>repo intent</span><strong>{repoRequested ? "private GitHub repo requested" : "local build only"}</strong></div>
      </div>
      <Button disabled={!canPause || busy} onClick={onPause} type="button" variant="secondary">
        {busy ? "Pausing..." : canPause ? "Pause" : "Paused"}
      </Button>
    </>
  );
}

function ArtifactPreview() {
  const outputs = [
    ["[1]", "editable MVP spec"],
    ["[2]", "repo files when requested"],
    ["[3]", "OpenCode build stream"],
  ] as const;

  return (
    <div className="artifact-preview">
      <div className="sidebar-section-label">
        <span>[+] outputs</span>
      </div>
      <div className="outputs-list">
        {outputs.map(([marker, label]) => (
          <div className="output-row" key={label}>
            <span>{marker}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsView({
  conduitStatusState,
  githubStatus,
  githubStatusState,
  onCheckConduitStatus,
  onRefreshGitHubStatus,
}: {
  conduitStatusState: "ready" | "checking";
  githubStatus: GitHubStatus;
  githubStatusState: "loading" | "ready" | "error";
  onCheckConduitStatus: () => void;
  onRefreshGitHubStatus: () => void;
}) {
  const githubConfigured = githubStatus.configured ?? true;

  return (
    <div className="settings-view">
      <div className="workspace-head">
        <div>
          <span>[+] integrations</span>
          <h1>Settings</h1>
          <p>Connection health for GitHub repo creation and Conduit product thinking.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="state-card-head">
            <strong>[x] GitHub OAuth</strong>
            {githubStatusState === "loading" ? (
              <SkeletonLine className="settings-status-skeleton" />
            ) : (
              <span>{githubStatusState}</span>
            )}
          </div>
          {githubStatusState === "loading" ? (
            <div className="settings-copy-skeleton" aria-hidden="true">
              <SkeletonLine />
              <SkeletonLine className="skeleton-line-short" />
            </div>
          ) : (
            <p>
              {!githubConfigured
                ? "Add GitHub OAuth credentials to your local environment, then restart Foundry."
                : githubStatus.connected
                ? `Connected as ${githubStatus.username ?? "GitHub user"}.`
                : "Connect GitHub to create private or public repositories from accepted specs."}
            </p>
          )}
          <div className="settings-actions">
            {githubStatusState === "loading" ? (
              <>
                <SkeletonLine className="skeleton-button" />
                <SkeletonLine className="skeleton-button" />
              </>
            ) : githubStatus.connected ? (
              <>
                <Button onClick={onRefreshGitHubStatus} variant="secondary">
                  Reconnect
                </Button>
                <Button asChild variant="secondary">
                  <a href="/api/auth/github/logout">Log out</a>
                </Button>
              </>
            ) : !githubConfigured ? (
              <Button disabled type="button" variant="secondary">
                Configure env
              </Button>
            ) : (
              <Button asChild>
                <a href="/api/auth/github/start">Connect GitHub</a>
              </Button>
            )}
          </div>
        </section>

        <section className="settings-card">
          <div className="state-card-head">
            <strong>[+] Conduit</strong>
            <span>{conduitStatusState}</span>
          </div>
          <p>
            Run the Conduit login locally so Foundry can use your ChatGPT subscription-backed
            product-thinking session. Credentials stay server-side and are never committed.
          </p>
          <code>pnpm dlx @conduit-llm/cli login</code>
          <div className="settings-actions">
            <Button
              disabled={conduitStatusState === "checking"}
              onClick={onCheckConduitStatus}
              variant="secondary"
            >
              {conduitStatusState === "checking" ? "Checking..." : "Check status"}
            </Button>
            <Button onClick={() => navigator.clipboard?.writeText("pnpm dlx @conduit-llm/cli login")}>
              Copy command
            </Button>
          </div>
        </section>
      </div>
      <div className="settings-safety-note">
        <span>token exposure: none in browser responses</span>
        <span>generated repos: auth files excluded</span>
      </div>
    </div>
  );
}
