/**
 * Console shell: a persistent work rail (zones + mounted roles + mount health)
 * around one work area. The rail is navigation, not decoration: every row maps
 * to a real entity — a zone, a mounted agent role, a provider mount.
 */
import { useCallback, useEffect, useState } from "react";
import { Boxes, Bot, FolderKanban, House, Menu, MessageSquare, Plus, Workflow, X } from "lucide-react";
import { webExternalKey } from "@agentos/contracts/session-key";
import {
  deleteSession,
  getAgents,
  getEscalations,
  getSessions,
  getStatus,
  HttpError,
  renameSession,
  setAccessToken,
  type AgentInfo,
  type SessionRow,
  type StatusResponse,
} from "./lib/api";
import { useAgentChat } from "./lib/useAgentChat";
import { emptyVariant } from "./lib/empty-state";
import { ChatStream } from "./components/ChatStream";
import { Composer } from "./components/Composer";
import { ConfirmModal } from "./components/ConfirmModal";
import { SessionSidebar } from "./components/SessionSidebar";
import { StatusStrip } from "./components/StatusStrip";
import { TokenGate } from "./components/TokenGate";
import { FilePanel } from "./components/FilePanel";
import { DraftInbox } from "./components/DraftInbox";
import { LogsPanel } from "./components/LogsPanel";
import { ToolsPanel } from "./components/ToolsPanel";
import { EscalationsPanel } from "./components/EscalationsPanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { TodoPanel } from "./components/TodoPanel";
import { AgentsPanel } from "./components/AgentsPanel";
import { UsagePanel } from "./components/UsagePanel";
import { WorkflowsPanel } from "./components/WorkflowsPanel";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { CommandPalette } from "./components/CommandPalette";
import { HomePanel } from "./components/HomePanel";
import { UsageBar } from "./components/UsageBar";

/** Sidebar polling cadence — a session running from another tab/device must
 * become visible here without the viewer having to complete a turn of their
 * own (previously the ledger only refreshed after `state.turns` changed). */
const SESSIONS_POLL_MS = 4000;

const ZONES = [
  {
    key: "home",
    label: "Home",
    Icon: House,
    title: "Home",
    description: "Today's focus, workflow runs, recent chats and mount health.",
  },
  {
    key: "chats",
    label: "Chats",
    Icon: MessageSquare,
    title: "Chats",
    description: "Talk to the kernel. Actionable tool results become todos.",
  },
  {
    key: "workflows",
    label: "Workflows",
    Icon: Workflow,
    title: "Workflows",
    description: "Repeatable runs — manual, scheduled, or webhook.",
  },
  {
    key: "projects",
    label: "Projects",
    Icon: FolderKanban,
    title: "Projects",
    description: "Templates are config; instances are your data.",
  },
] as const;

type Zone = (typeof ZONES)[number]["key"];

export default function App() {
  const { state, send, stop, sessionId, pickSession, newSession, resolveConfirm, setScope } = useAgentChat();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [escalations, setEscalations] = useState(0);
  const [quote, setQuote] = useState<{ text: string; nonce: number } | undefined>();
  const [needsToken, setNeedsToken] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showEscalations, setShowEscalations] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false); // sessions drawer (mobile)
  const [showRail, setShowRail] = useState(false); // work rail drawer (mobile)
  const [showTimeline, setShowTimeline] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showUsagePanel, setShowUsagePanel] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [zone, setZone] = useState<Zone>("home");
  const [clearNonce, setClearNonce] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [s, l, e, a] = await Promise.all([
        getStatus(sessionId),
        getSessions(),
        getEscalations(),
        getAgents().catch(() => ({ agents: [] as AgentInfo[] })),
      ]);
      setStatus(s);
      setSessions(l.sessions);
      setEscalations(e.count);
      setAgents(a.agents);
    } catch (err) {
      // 403 = the local token gate (spec #287); everything else is a server
      // that is (re)starting and the next poll recovers.
      if (err instanceof HttpError && err.status === 403) setNeedsToken(true);
    }
  }, [sessionId]);

  /** Zones are pages: the rail switches what fills the work area. */
  const goZone = useCallback((z: Zone) => {
    setZone(z);
    setShowRail(false);
  }, []);

  // Keyboard paths (spec #281): Esc clears the draft, Alt+↑/↓ walks sessions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClearNonce((n) => n + 1);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
      // Zone shortcuts (#430): Alt+1..4, matching the rail order.
      if (e.altKey && /^[1-4]$/.test(e.key)) {
        const z = ZONES[Number(e.key) - 1]?.key;
        if (z) {
          e.preventDefault();
          goZone(z);
        }
      }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const keys = sessions.map((s) => s.external_key.replace(/^web-/, ""));
        const at = keys.indexOf(sessionId);
        if (keys.length === 0) return;
        const next = e.key === "ArrowUp" ? Math.max(0, at - 1) : Math.min(keys.length - 1, at + 1);
        if (keys[next] !== undefined && next !== at) pickSession(keys[next] as string);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessions, sessionId, pickSession, goZone]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), SESSIONS_POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);
  // after every completed turn, the ledger + drift picture changes
  useEffect(() => {
    if (state.turns > 0) void refresh();
  }, [state.turns, refresh]);

  const handleRename = useCallback(
    async (id: string, title: string) => {
      await renameSession(id, title);
      void refresh();
    },
    [refresh],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void (async () => {
        // If the row being deleted is the one currently open, don't leave the
        // console pointed at a session that no longer exists in the ledger.
        const row = sessions.find((s) => s.id === id);
        const deletingActive = row && row.external_key === webExternalKey(sessionId);
        await deleteSession(id).catch(() => undefined);
        if (deletingActive) newSession();
        void refresh();
      })();
    },
    [sessions, sessionId, newSession, refresh],
  );

  const zoneMeta = ZONES.find((z) => z.key === zone) ?? ZONES[0];
  const mounted = status?.mounts ?? [];
  const degraded = mounted.filter((m) => m.degraded === true).length;
  const startChat = () => {
    newSession();
    goZone("chats");
  };

  const rail = (
    <aside
      className={
        (showRail ? "fixed inset-y-0 left-0 z-50 flex" : "hidden") +
        " w-64 shrink-0 flex-col border-r border-border bg-card/40 md:static md:z-auto md:flex"
      }
      aria-label="workspace"
    >
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Boxes className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight">AgentOS</span>
          <span className="block truncate text-[11px] text-muted-foreground">{status?.preset ?? "connecting…"}</span>
        </span>
        <button
          onClick={() => setShowRail(false)}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-card md:hidden"
          aria-label="close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2" aria-label="zones">
        {ZONES.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => goZone(key)}
            aria-current={zone === key ? "page" : undefined}
            className={
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors " +
              (zone === key
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-card hover:text-foreground")
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-6 flex items-center justify-between px-4 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Agents</span>
        <button
          onClick={() => setShowAgents(true)}
          className="rounded p-0.5 text-muted-foreground hover:bg-card hover:text-foreground"
          title="agent roles"
          aria-label="agent roles"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {agents.length === 0 ? (
          <p className="px-2.5 py-1 text-[11px] leading-relaxed text-muted-foreground">
            No roles mounted.
          </p>
        ) : (
          agents.slice(0, 8).map((a) => (
            <button
              key={a.name}
              onClick={() => {
                setScope({ agent: a.name });
                goZone("chats");
              }}
              title={a.promptPreview}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-card hover:text-foreground"
            >
              <Bot className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{a.name}</span>
              {a.baseAgent && <span className="ml-auto truncate text-[10px] opacity-60">← {a.baseAgent}</span>}
            </button>
          ))
        )}
      </div>

      <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span
            className={
              "inline-block h-1.5 w-1.5 rounded-full " +
              (degraded > 0 ? "bg-warn" : mounted.length > 0 ? "bg-ok" : "bg-muted-foreground")
            }
          />
          {mounted.length === 0
            ? "no tools mounted"
            : `${mounted.length - degraded}/${mounted.length} mounts healthy`}
        </div>
        {status?.model?.provider && <div className="mt-1 truncate opacity-70">model · {status.model.provider}</div>}
      </div>
    </aside>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        {rail}
        {showRail && <div className="fixed inset-0 z-40 bg-background/70 md:hidden" onClick={() => setShowRail(false)} />}

        <main className="flex min-w-0 flex-1 flex-col">
          <StatusStrip
            status={status}
            hideBrand
            onSearch={() => setShowPalette(true)}
            onToggleFiles={() => setShowFiles((v) => !v)}
            onToggleDrafts={() => setShowDrafts((v) => !v)}
            onToggleLogs={() => setShowLogs((v) => !v)}
            onToggleTools={() => setShowTools((v) => !v)}
            onToggleEscalations={() => setShowEscalations((v) => !v)}
            onToggleTimeline={() => setShowTimeline((v) => !v)}
            onToggleTodos={() => setShowTodos((v) => !v)}
            onToggleAgents={() => setShowAgents((v) => !v)}
            onToggleUsage={() => setShowUsagePanel((v) => !v)}
            onToggleWorkflows={() => goZone("workflows")}
            onToggleProjects={() => goZone("projects")}
          />

          <header className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-5 md:px-6">
            <button
              onClick={() => setShowRail(true)}
              className="mt-0.5 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-card md:hidden"
              aria-label="open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1 basis-64">
              <h1 className="text-2xl font-semibold tracking-tight">{zoneMeta.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{zoneMeta.description}</p>
            </div>
            {(zone === "home" || zone === "chats") && (
              <button
                onClick={startChat}
                className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                New chat
              </button>
            )}
          </header>

          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {zone === "home" && (
              <HomePanel
                onZone={(z) => goZone(z)}
                onPickSession={pickSession}
                onOpenAgents={() => setShowAgents(true)}
                onOpenTodos={() => setShowTodos(true)}
                onAsk={(prompt) => {
                  goZone("chats");
                  void send(prompt);
                }}
              />
            )}

            {zone === "workflows" && <WorkflowsPanel onOpenSession={(key) => pickSession(key)} />}
            {zone === "projects" && (
              <ProjectsPanel
                onStartRole={(agent, project) => {
                  // Scope rides the next turn; the server fences it (#392/#403).
                  setScope({ agent, project });
                  goZone("chats");
                }}
              />
            )}

            {zone === "chats" && (
              <>
                <button
                  onClick={() => setShowSidebar((v) => !v)}
                  className="absolute left-2 top-12 z-40 rounded border border-border bg-card px-2 py-1 text-xs md:hidden"
                  aria-label="sessions"
                >
                  sessions
                </button>
                <div className={showSidebar ? "fixed inset-y-12 left-0 z-30 flex md:static md:z-auto" : "hidden md:flex"}>
                  <SessionSidebar
                    sessions={sessions}
                    activeKey={sessionId}
                    onPick={pickSession}
                    onNew={newSession}
                    onRename={handleRename}
                    onDelete={handleDelete}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <ChatStream
                    state={state}
                    onQuote={(text) => setQuote({ text, nonce: Date.now() })}
                    empty={emptyVariant({
                      sessionCount: sessions.length,
                      mountCount: mounted.filter((m) => m.degraded !== true).length,
                      hasKnowledge: Boolean(status?.knowledge),
                    })}
                  />
                  {/* key=sessionId: creating/switching sessions must be visible
                      immediately, not only once a reply comes back. */}
                  <Composer
                    key={sessionId}
                    sessionId={sessionId}
                    busy={state.conn !== "idle"}
                    onSend={(t) => void send(t)}
                    onStop={() => void stop()}
                    quote={quote}
                    clearNonce={clearNonce}
                  />
                </div>
              </>
            )}

            <div className="fixed inset-y-12 right-0 z-30 flex max-w-full md:static md:inset-auto md:max-w-none">
              {showFiles && <FilePanel sessionId={sessionId} onClose={() => setShowFiles(false)} />}
              {showDrafts && <DraftInbox sessionId={sessionId} onClose={() => setShowDrafts(false)} />}
              {showLogs && <LogsPanel onClose={() => setShowLogs(false)} />}
              {showTools && <ToolsPanel onClose={() => setShowTools(false)} />}
              {showEscalations && <EscalationsPanel onClose={() => setShowEscalations(false)} />}
              {showTimeline && <TimelinePanel state={state} onClose={() => setShowTimeline(false)} />}
              {showTodos && <TodoPanel onClose={() => setShowTodos(false)} onOpenSession={(key) => pickSession(key)} />}
              {showAgents && <AgentsPanel onClose={() => setShowAgents(false)} />}
              {showUsagePanel && <UsagePanel onClose={() => setShowUsagePanel(false)} />}
            </div>
          </div>
        </main>
      </div>
      <UsageBar usage={state.usage} live={state.live} escalations={escalations} sessionId={sessionId} onEscalated={setEscalations} modelShort={state.modelShort} />
      <ConfirmModal pending={state.pending} onResolved={resolveConfirm} />
      <CommandPalette
        open={showPalette}
        onOpenChange={setShowPalette}
        onPickSession={(id) => pickSession(id)}
        onPickRole={(agent) => setScope({ agent })}
        onOpenPanel={(panel) => {
          if (panel === "workflows") goZone("workflows");
          if (panel === "projects") goZone("projects");
          if (panel === "todos") setShowTodos(true);
        }}
      />
      {needsToken && (
        <TokenGate
          onSubmit={(token) => {
            setAccessToken(token);
            setNeedsToken(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
