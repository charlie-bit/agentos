# Privacy re-review for the v4 surfaces (spec #455)

R1–R9 against todo content, role prompts, workflow steps and project data.
Each line names the enforced mechanism, not an intention.

| Red line | v4 surfaces | Enforcement |
|----------|-------------|-------------|
| R1 zero telemetry | all | no outbound client exists; notifications/logs are local files |
| R2 log minimisation | todo audit (#326), workflow audit (#385), debug logs (#124) | audits write ids/actions/status/durations only; tests assert a todo title and a prompt never appear; redaction runs before disk and on read |
| R3 data locality | sessions, todos, drafts, instances, runs | all under `.agentos/`; exports are user-initiated downloads (no middle service) |
| R4 minimal web exposure | /api/notifications, /api/usage, /api/tools, workspace endpoints | structure + aggregates only; 127.0.0.1 + token gate (#287) |
| R5 error surface | ErrorBoundary (#285) | prefilled issue carries version/preset/session id only; no conversation text |
| R6 no real data in fixtures | examples/workbench, fixtures | fictional scenarios; `*.invalid` endpoints; fake tokens only |
| R7 untrusted input | uploads (#276), file reads (#257), exports (#260/#396) | size caps, lexical+realpath fences, bounded id lists |
| R8 audit non-regression | kb (#47) + workflow audits | receipts and run records carry ids/results, never draft or prompt text |
| R9 PII masking | session titles in lists, todo titles in notifications | titles are local user data, shown only in the user's own console; logs never carry them |

Open real-phase check: confirm with a live model that prompts/results still do
not reach any log after a full session (the mechanism is structural, the check
is observational).
