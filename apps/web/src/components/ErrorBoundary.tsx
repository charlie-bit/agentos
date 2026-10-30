import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Crash surface (spec #285/#286). A render error or an unhandled rejection
 * must never leave a white screen. The report panel carries ONLY version /
 * preset / session id — never conversation content, tool payloads or local
 * paths (R5) — and the issue link is prefilled with exactly those fields.
 */
const APP_VERSION = "0.0.0-dev";
const ISSUE_BASE = "https://github.com/charlie-bit/agentos/issues/new";

function issueHref(kind: string, preset: string, sessionId: string): string {
  const title = encodeURIComponent(`[ui] ${kind} in preset ${preset}`);
  const body = encodeURIComponent(
    [
      "## What happened",
      "",
      "<!-- describe what you were doing; do NOT paste conversations or credentials -->",
      "",
      `- version: ${APP_VERSION}`,
      `- preset: ${preset}`,
      `- session: ${sessionId}`,
      `- kind: ${kind}`,
    ].join("\n"),
  );
  return `${ISSUE_BASE}?title=${title}&body=${body}`;
}

function ReportPanel({ kind, preset, sessionId, detail }: { kind: string; preset: string; sessionId: string; detail?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4">
      <div className="w-[min(520px,100%)] rounded-lg border border-err/50 bg-card p-4 text-sm">
        <div className="mb-1 font-semibold text-err">The console hit an unexpected error</div>
        <p className="mb-2 text-xs text-muted-foreground">
          Your session is safe. Copy the fields below into an issue — they contain no conversation content.
        </p>
        <pre className="mb-3 rounded bg-background p-2 font-mono text-[11px] text-muted-foreground">
          {`version: ${APP_VERSION}\npreset: ${preset}\nsession: ${sessionId}\nkind: ${kind}${detail ? `\nnote: ${detail}` : ""}`}
        </pre>
        <div className="flex justify-end gap-2">
          <button className="rounded border border-border px-2 py-1 text-xs" onClick={() => window.location.reload()}>
            reload
          </button>
          <a className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground" href={issueHref(kind, preset, sessionId)} target="_blank" rel="noreferrer">
            open issue (prefilled)
          </a>
        </div>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
  preset: string;
  sessionId: string;
}
interface State {
  error: Error | null;
  asyncError: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, asyncError: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidMount(): void {
    // spec #286: promise rejections are invisible to React; funnel them here.
    window.addEventListener("unhandledrejection", this.onRejection);
  }

  componentWillUnmount(): void {
    window.removeEventListener("unhandledrejection", this.onRejection);
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    /* no telemetry by design (R1): the panel IS the report */
  }

  private onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "unknown");
    this.setState({ asyncError: reason.slice(0, 200) });
  };

  render(): ReactNode {
    if (this.state.error) {
      return <ReportPanel kind="render-error" preset={this.props.preset} sessionId={this.props.sessionId} />;
    }
    return (
      <>
        {this.props.children}
        {this.state.asyncError !== null && (
          <ReportPanel
            kind="unhandled-rejection"
            preset={this.props.preset}
            sessionId={this.props.sessionId}
            detail={this.state.asyncError}
          />
        )}
      </>
    );
  }
}
