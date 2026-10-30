import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Flag, GripVertical, Inbox, ListTree, Plus, Send, Target, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { getAgents, getSkills, getTools, type AgentInfo, type SkillInfo } from "../lib/api";
import { cn } from "../lib/utils";
import {
  composeWorkflowYaml,
  emptyDraft,
  validateDraft,
  type StepDraft,
  type WorkflowDraft,
} from "../lib/workflow-compose";

const IN_PROCESS_TOOLS = ["todo_list", "todo_add", "todo_update", "todo_remove"];

const STEP_TYPES = [
  { type: "agent", label: "Agent" },
  { type: "tool", label: "Tool" },
  { type: "skill", label: "Skill" },
  { type: "kb_search", label: "Knowledge" },
  { type: "review", label: "Review" },
] as const;

type StepType = StepDraft["type"];

function freshStep(type: StepType): StepDraft {
  switch (type) {
    case "agent":
      return { type, agent: "", prompt: "" };
    case "tool":
      return { type, tool: "", args: "" };
    case "skill":
      return { type, skill: "", prompt: "" };
    case "kb_search":
      return { type, query: "" };
    case "review":
      return { type, agent: "", prompt: "" };
  }
}

const input =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary";

/**
 * Visual step composer (stage A): it builds the closed five-step pipeline and
 * hands back a file. It deliberately has no write path — config edits still go
 * through git; an API write is the next stage, not this one.
 */
export function WorkflowComposer({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<WorkflowDraft>(emptyDraft);
  const [copied, setCopied] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  // Mount-driven options: the editor offers what this deployment actually has.
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  useEffect(() => {
    void getAgents().then((b) => setAgents(b.agents)).catch(() => undefined);
    void getSkills().then((b) => setSkills(b.skills)).catch(() => undefined);
    void getTools()
      .then((b) => setTools([...new Set(b.tools.flatMap((t) => t.allowedTools ?? []))]))
      .catch(() => undefined);
  }, []);

  const problems = useMemo(() => validateDraft(draft), [draft]);
  const yaml = useMemo(() => (problems.length === 0 ? composeWorkflowYaml(draft) : ""), [draft, problems]);

  const patch = (p: Partial<WorkflowDraft>) => setDraft((d) => ({ ...d, ...p }));
  const patchStep = (i: number, p: Partial<StepDraft>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, k) => (k === i ? ({ ...s, ...p } as StepDraft) : s)) }));
  const move = (i: number, delta: -1 | 1) =>
    setDraft((d) => {
      const at = i + delta;
      if (at < 0 || at >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[i], steps[at]] = [steps[at]!, steps[i]!];
      return { ...d, steps };
    });

  const reorder = (from: number, to: number) =>
    setDraft((d) => {
      if (from === to || from < 0 || to < 0 || from >= d.steps.length || to >= d.steps.length) return d;
      const steps = [...d.steps];
      const [moved] = steps.splice(from, 1);
      if (moved) steps.splice(to, 0, moved);
      return { ...d, steps };
    });

  const download = () => {
    if (yaml.length === 0) return;
    const url = URL.createObjectURL(new Blob([yaml], { type: "text/yaml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.name}.yml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    if (yaml.length === 0) return;
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the preview is selectable */
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 md:p-6" aria-label="workflow composer">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">Compose a workflow</h2>
          <p className="text-xs text-muted-foreground">
            A linear pipeline: drag to reorder. The file is the product — download it, commit it under{" "}
            <code>config/workflows/</code>, restart.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>
          Back to workflows
        </Button>
      </div>

      {/* Review first: a five-stage map of what the run does, before any editing. */}
      <div className="rounded-lg border border-border bg-card/40 p-3">
        <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>review</span>
          <span>what → input → how → result → output</span>
        </div>
        <div className="flex flex-col items-stretch gap-1 lg:flex-row lg:items-center">
          {[
            {
              key: "what",
              kicker: "what",
              Icon: Target,
              title: draft.category.trim() || draft.name.trim() || "untitled",
              detail: draft.description.trim() || "category + name define the theme",
              foot: `trigger: ${draft.trigger}`,
            },
            {
              key: "input",
              kicker: "input",
              Icon: Inbox,
              title: draft.inputSource === "manual" ? "manual prompt" : "none",
              detail: draft.inputSource === "manual" ? "supplied at run time ({input}, first {prev})" : "the run starts empty",
              foot: "",
            },
            {
              key: "how",
              kicker: "how",
              Icon: ListTree,
              title: `${draft.steps.length} step(s)`,
              detail:
                draft.steps
                  .map((st, i) => `${i + 1}. ${STEP_TYPES.find((t) => t.type === st.type)?.label ?? st.type}`)
                  .join(" → ") || "add a step",
              foot: "",
            },
            {
              key: "result",
              kicker: "result",
              Icon: Flag,
              title: "last step output",
              detail: "bounded to 1KB, larger results pass as a pointer",
              foot: "",
            },
            {
              key: "output",
              kicker: "output",
              Icon: Send,
              title: draft.outputSink === "slack" ? "Slack" : "none",
              detail: draft.outputSink === "slack" ? draft.outputChannel.trim() || "channel missing" : "the run record only",
              foot: "",
            },
          ].map((stage, i) => (
            <div key={stage.key} className="flex flex-1 flex-col items-stretch lg:flex-row lg:items-center">
              {i > 0 && (
                <svg viewBox="0 0 24 24" className="mx-auto my-0.5 h-4 w-4 shrink-0 rotate-90 text-muted-foreground lg:mx-1 lg:rotate-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 12h14" />
                  <path d="M13 7l5 5-5 5" />
                </svg>
              )}
              <div className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-2">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <stage.Icon className="h-3 w-3" />
                  {stage.kicker}
                </div>
                <div className="truncate text-sm font-medium">{stage.title}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{stage.detail}</div>
                {stage.foot && <div className="mt-1 text-[10px] text-muted-foreground">{stage.foot}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              name
              <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="daily-triage" className={input} />
            </label>
            <label className="text-xs text-muted-foreground">
              description (optional)
              <input value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="morning run" className={input} />
            </label>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              category / theme
              <input value={draft.category} onChange={(e) => patch({ category: e.target.value })} placeholder="sre" className={input} />
            </label>
            <label className="text-xs text-muted-foreground">
              input
              <select value={draft.inputSource} onChange={(e) => patch({ inputSource: e.target.value as "none" | "manual" })} className={input}>
                <option value="manual">manual prompt</option>
                <option value="none">none</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              output
              <select value={draft.outputSink} onChange={(e) => patch({ outputSink: e.target.value as "none" | "slack" })} className={input}>
                <option value="none">none</option>
                <option value="slack">Slack</option>
              </select>
            </label>
          </div>
          {draft.outputSink === "slack" && (
            <label className="mt-2 block text-xs text-muted-foreground">
              Slack channel id
              <input value={draft.outputChannel} onChange={(e) => patch({ outputChannel: e.target.value })} placeholder="C0123456789" className={cn(input, "font-mono sm:w-64")} />
            </label>
          )}

          <div className="mt-3">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">trigger</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["manual", "schedule", "webhook"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => patch({ trigger: t })}
                  className={cn(
                    "rounded-md border border-border px-2.5 py-1 text-xs",
                    draft.trigger === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card",
                  )}
                >
                  {t}
                </button>
              ))}
              {draft.trigger === "schedule" && (
                <input
                  value={draft.cron}
                  onChange={(e) => patch({ cron: e.target.value })}
                  placeholder="0 9 * * 1-5"
                  aria-label="cron"
                  className={cn(input, "w-44 font-mono")}
                />
              )}
              {draft.trigger === "webhook" && (
                <input
                  value={draft.secretEnv}
                  onChange={(e) => patch({ secretEnv: e.target.value })}
                  placeholder="TRIAGE_HOOK_SECRET"
                  aria-label="webhook secret env name"
                  className={cn(input, "w-56 font-mono")}
                />
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {draft.trigger === "manual" && "manual: runs only when someone presses Run now or calls the run endpoint."}
              {draft.trigger === "schedule" && "schedule: the server fires at the cron boundary; missed windows are reported, never replayed."}
              {draft.trigger === "webhook" && "webhook: POST /api/hooks/<name> with this env var's value as the Bearer secret."}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">steps</div>
            <div className="text-[11px] text-muted-foreground">{draft.steps.length} step(s), run in order</div>
          </div>

          <ol className="mt-2 space-y-2">
            {draft.steps.map((s, i) => (
              <li
                key={i}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragEnd={() => setDragFrom(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) reorder(dragFrom, i);
                  setDragFrom(null);
                }}
                className={
                  "rounded-lg border border-border bg-card/40 p-2.5 transition-opacity " +
                  (dragFrom === i ? "opacity-40" : "")
                }
              >
                <div className="flex items-center gap-2">
                  <span className="cursor-grab text-muted-foreground" title="drag to reorder" aria-hidden>
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <span className="w-5 text-center text-[11px] text-muted-foreground">{i + 1}</span>
                  <select
                    value={s.type}
                    onChange={(e) => patchStep(i, freshStep(e.target.value as StepType) as Partial<StepDraft>)}
                    aria-label={`step ${i + 1} type`}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    {STEP_TYPES.map((t) => (
                      <option key={t.type} value={t.type}>{t.label}</option>
                    ))}
                  </select>
                  <span className="flex-1" />
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-muted-foreground hover:bg-card disabled:opacity-30" aria-label="move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === draft.steps.length - 1} className="rounded p-1 text-muted-foreground hover:bg-card disabled:opacity-30" aria-label="move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDraft((d) => ({ ...d, steps: d.steps.filter((_, k) => k !== i) }))}
                    className="rounded p-1 text-muted-foreground hover:text-err"
                    aria-label="remove step"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {s.type === "agent" && (
                    <>
                      <select
                        value={s.agent}
                        onChange={(e) => patchStep(i, { agent: e.target.value })}
                        aria-label={`step ${i + 1} agent role`}
                        className={input}
                      >
                        <option value="">{agents.length === 0 ? "no roles mounted" : "select a mounted role"}</option>
                        {s.agent !== "" && !agents.some((a) => a.name === s.agent) && <option value={s.agent}>{s.agent} (not mounted)</option>}
                        {agents.map((a) => (
                          <option key={a.name} value={a.name}>{a.available === false ? `${a.name} (unavailable)` : a.name}</option>
                        ))}
                      </select>
                      <input value={s.prompt} onChange={(e) => patchStep(i, { prompt: e.target.value })} placeholder="prompt — use {prev} for the previous result" className={input} />
                    </>
                  )}
                  {s.type === "tool" && (
                    <>
                      <select
                        value={s.tool}
                        onChange={(e) => patchStep(i, { tool: e.target.value })}
                        aria-label={`step ${i + 1} tool`}
                        className={input}
                      >
                        <option value="">select a mounted tool</option>
                        {s.tool !== "" && ![...IN_PROCESS_TOOLS, ...tools].includes(s.tool) && <option value={s.tool}>{s.tool} (not mounted)</option>}
                        <optgroup label="in-process">
                          {IN_PROCESS_TOOLS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </optgroup>
                        {tools.length > 0 && (
                          <optgroup label="mounted providers">
                            {tools.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <input value={s.args} onChange={(e) => patchStep(i, { args: e.target.value })} placeholder='args JSON, e.g. {"text":"hi"}' className={cn(input, "font-mono")} />
                      <p className="text-[10px] leading-snug text-muted-foreground sm:col-span-2">
                        In-process tools run directly; mounted MCP tools are called over MCP with no model turn.
                      </p>
                    </>
                  )}
                  {s.type === "skill" && (
                    <>
                      <select
                        value={s.skill}
                        onChange={(e) => patchStep(i, { skill: e.target.value })}
                        aria-label={`step ${i + 1} skill`}
                        className={input}
                      >
                        <option value="">{skills.length === 0 ? "no skills mounted" : "select a mounted skill"}</option>
                        {s.skill !== "" && !skills.some((k) => k.name === s.skill) && <option value={s.skill}>{s.skill} (not mounted)</option>}
                        {skills.map((k) => (
                          <option key={k.name} value={k.name}>{k.name}</option>
                        ))}
                      </select>
                      <input value={s.prompt} onChange={(e) => patchStep(i, { prompt: e.target.value })} placeholder="prompt (optional)" className={input} />
                    </>
                  )}
                  {s.type === "kb_search" && (
                    <input value={s.query} onChange={(e) => patchStep(i, { query: e.target.value })} placeholder="knowledge query" className={cn(input, "sm:col-span-2")} />
                  )}
                  {s.type === "review" && (
                    <>
                      <select
                        value={s.agent}
                        onChange={(e) => patchStep(i, { agent: e.target.value })}
                        aria-label={`step ${i + 1} reviewer role`}
                        className={input}
                      >
                        <option value="">{agents.length === 0 ? "no roles mounted" : "select a reviewer role"}</option>
                        {s.agent !== "" && !agents.some((a) => a.name === s.agent) && <option value={s.agent}>{s.agent} (not mounted)</option>}
                        {agents.map((a) => (
                          <option key={a.name} value={a.name}>{a.available === false ? `${a.name} (unavailable)` : a.name}</option>
                        ))}
                      </select>
                      <input value={s.prompt} onChange={(e) => patchStep(i, { prompt: e.target.value })} placeholder="review prompt — reply APPROVE or REJECT" className={input} />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => setDraft((d) => ({ ...d, steps: [...d.steps, freshStep("agent")] }))}
          >
            <Plus className="h-3 w-3" /> Add step
          </Button>
        </div>

        <aside className="flex min-h-0 flex-col rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">manifest preview</span>
            <span className="text-[11px] text-muted-foreground">{problems.length === 0 ? "valid shape" : `${problems.length} problem(s)`}</span>
          </div>

          {problems.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[11px] text-warn">
              {problems.map((p) => (
                <li key={p}>· {p}</li>
              ))}
            </ul>
          ) : (
            <pre className="mt-2 min-h-0 flex-1 overflow-auto rounded-md bg-background p-2 text-[11px] leading-relaxed">{yaml}</pre>
          )}

          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={download} disabled={problems.length > 0}>
              Download .yml
            </Button>
            <Button size="sm" variant="outline" onClick={() => void copy()} disabled={problems.length > 0}>
              {copied ? "Copied ✓" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Stage A: this produces a file. Writing <code>config/</code> from the console is the next stage (API write, config in the DB).
          </p>
        </aside>
      </div>
    </div>
  );
}
