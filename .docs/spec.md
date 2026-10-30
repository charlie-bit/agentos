# AgentOS Spec — 457 点承诺清单

> 定位：本文件是**全量承诺清单**（what & acceptance），按模块分组、全局编号 1–457。
> 状态（done / in-progress / todo / blocked）一律不写在这里，由配对的 [progress.md](progress.md) 逐点打勾。
> 每个点必须锚定真实代码位置或 PRD 承诺；写不出的点不许进这张表。
>
> 1–100 为 v1 基线（既有承诺，编号冻结）；101–170 为 v2 扩展（对标 sre-triage-copilot 后吸收/转化的产品能力，web 为唯一入口）；171–200 为**边界承诺**（30 条明确的"不做"，每条含替代出口——对标的拒绝判决见 [gap-vs-sre-triage-copilot.md](gap-vs-sre-triage-copilot.md)）；201–307 为 v3 对齐任务（2026-10-26 五路全量代码审计产出：每个 PARTIAL/MISSING 缺口、每个审计新发现的 bug、每处死代码，各成一个 PR 大小的点，100 分 = 1–307 全绿）；308–457 为 v4 产品面（2026-10-27：web 端待办 / 自定义 Agent 角色 / Workflow 编排含定时 / Project 编排 / 外部 agent——muse 式个人工作台能力、AgentOS 形态实现；**v1.0 判据维持 1–307 不变**，v2.0 判据见 #454）。
>
> v3 编号规则：新点只增不改 1–200；凡收口既有点的，标注 `（#N 收口）`——该点全绿即母点视为达标；标注 `（#Na/#Nb）` 的是母点的任务分解，母点是伞点。

模块划分（30 个）：

| 模块 | 点数 | 覆盖 |
|------|------|------|
| M1 契约层 | 10 | `packages/contracts` |
| M2 Manifest | 7 | `packages/core/src/manifest` |
| M3 Loader / Registry | 7 | `packages/core/src/loader` |
| M4 Model / Routing | 9 | `packages/core/src/routing` + `packages/providers/model-*` |
| M5 Session 内核 | 8 | `packages/core/src/session` |
| M6 治理 Governance | 11 | `packages/core/src/governance` |
| M7 KnowledgeProvider | 10 | `packages/providers/knowledge-markdown` + `config/knowledge` |
| M8 ToolProvider | 6 | `config/tools` |
| M9 EntryAdapter ×2 | 10 | `packages/entry/entry-cli` + `entry-rest` |
| M10 Web Console | 10 | `apps/web` |
| M11 CLI | 4 | `cli/` |
| M12 Conformance | 5 | `packages/conformance` |
| M13 文档与工程纪律 | 3 | `.docs/` + 仓库卫生 |
| M14 Web 入口产品化（吸收） | 12 | 101–112：SSE 稳定性 / 会话运行时 / workspace 可视化 / 导出 |
| M15 Preset 即配置面（转化 T2/T3/T7） | 8 | 113–120：配置只读披露 / 本地认证 / 模型切换 |
| M16 可观测与诊断（吸收 A7–A11） | 8 | 121–128：工具诊断 / usage 查询 / 日志 / 停机 |
| M17 沙箱与部署形态（转化 T8/T9） | 7 | 129–135：manifest 声明沙箱 / sqlite 默认 / 触发条件文档 |
| M18 生态扩展面（转化 T4/T5/T6） | 7 | 136–142：examples / 新 agent 零脚手架 / skills 通道 |
| M19 开源工程化（一期） | 6 | 143–148：CI / 文档站 / 安全披露 |
| M14 二期 · Web 产品化深水区 | 12 | 149–160：KB 写回 UI / 附件 / 交互基建 / E2E |
| M19 二期 · 工程化收尾 | 10 | 161–170：备份 / 预算门禁 / 冒烟 / 贡献指南 |
| M20 边界承诺（拒绝） | 30 | 171–200：每条"不做" + 替代出口 |
| M21 契约与内核收口 | 13 | 201–213：v1 基线 PARTIAL 点的执行任务 |
| M22 审计缺陷修复 | 17 | 214–230：五路审计新发现的 bug |
| M23 文档即合同 | 12 | 231–242：README/安全/变更纪律的真实性修复 |
| M24 死代码与仓库卫生 | 9 | 243–251：未消费声明 / vendored 内容 / 遗留目录 |
| M25 Web 一期任务分解 | 18 | 252–269：#101–112 伞点的 PR 级分解 |
| M26 Web 二期任务分解 | 17 | 270–286：#149–160 伞点的 PR 级分解 |
| M27 配置面与诊断 API | 7 | 287–293：token / presets / validate / tools / usage / logs+healthz / SIGTERM |
| M28 生态与分发 | 7 | 294–300：escalations / 时间线 / examples / 零脚手架 / 第二 runtime / npm 分发 / onboarding |
| M29 沙箱与部署 | 3 | 301–303：sandbox 声明 / Docker / 数据目录规范 |
| M30 对齐验收 | 4 | 304–307：第二方接入 / 全链路冒烟 / roadmap / 审计例程 |
| M31 待办 Priorities | 20 | 308–327：todo 契约/工具族/端点/面板/通知 |
| M32 Agent 角色自定义 | 25 | 328–352：AgentManifest/工具围栏/角色会话/归因 |
| M33 Workflow 编排引擎 | 35 | 353–387：步骤五型/触发三型/定时/恢复/面板 |
| M34 Projects 项目编排 | 20 | 388–407：配置vs数据分界/实例/仪表盘/范围隔离 |
| M35 外部 Agent 第三方功能 | 15 | 408–422：MCP 唯一路径/回流/边界守护 |
| M36 Web 产品面整合 | 20 | 423–442：Home/场景卡/⌘K/通知/五区导航 |
| M37 快速实现基建与守护 | 15 | 443–457：脚手架/examples/复审/v2.0 判据 |

---

## M1 契约层（1–10）

1. **KnowledgeProvider 六动词契约**：`bootstrap / search / getPage / listPages / writePage / commit` 定稿于 `packages/contracts/src/knowledge.ts`；writePage 只出 draft，commit 才持久。
    *现状分歧（2026-10-26 对齐记录）：commit 尚未上接口——`commitDraft()` 在 `packages/core/src/governance/writeback.ts:51`，且硬绑 git/markdown 路径。判 B：验收标准维持目标态，此缺口在 progress.md 记 todo；第二个 KnowledgeProvider 落地前必须把 commit 下沉回 provider 接口（治理层保留为策略/审计壳，git 操作挪进 knowledge-markdown）。挪动是 additive 的：接口加方法、旧实现补实现，不破坏既有承诺。*
2. **ToolProvider manifest 契约**：`tool.ts` 定义 name / transport / auth / allowedTools / idempotent / schemaExchange 六要素，`ToolProviderManifest` 是唯一挂载声明格式。
3. **ModelProvider runtime 契约**：`model.ts` 定义 `healthCheck + resolveModel`，含 fallbackChain 语义（健康探测短路）。
4. **EntryAdapter 四动词契约**：`entry.ts` 定义 `identity / session / render / confirm`；`confirm:false` 是合法诚实声明，触发内核把知识写降级为只读。
5. **Preset 契约**：`preset.ts` —— preset 只做四层名字引用（knowledge / model / tools / entry），零内联配置、零内联凭证。
6. **JSON Schema 跨边界交换**：内核与 runtime 之间只传 JSON Schema；zod 不出包边界（v3/v4 互不兼容，会静默丢工具——全仓锁 v4 的根因）。
7. **additive-only 版本规则**：契约演进只加字段不改语义（先例：`TranscriptEntry`、`escalationGate + NeutralTool` 均 additive 落地）。
8. **NeutralTool 中立格式**：内核产出的工具调用/结果事件用中立结构，不绑定任何 runtime 的事件方言。
9. **escalationGate 契约**：敏感操作确认门禁是一等契约——由三件组成（2026-10-26 措辞修正，如实反映分层）：① `escalationGate` 字段（`contracts/knowledge.ts:155`，P7a：minPerWeek + windowDays，策略**数据**，仅 CLI `kb gate` 消费，无运行时层读它）；② `ConfirmRequest/ConfirmResult`（entry 契约，含超时=拒绝等价）；③ 内核侧 confirm 调用点（`governance/tools.ts` kb_commit 强制人工确认）。三者合成"人工移交立法 → 确认能力 → 执行点"一条链，不是单一巨型接口。
10. **TranscriptEntry 转录中立格式**：会话回放用的消息条目是中立 entry（adapter 的 transcript reader 直接消费它）；设计边界=最小可渲染集（无 ids/无 block 树/无 usage/无推理轨迹）。

## M2 Manifest 层（11–17）

11. **manifest 加载与 kind 分发**：`manifest/load.ts` 按 `kind`（preset / tool / model / knowledge）分发到各自校验器。
12. **schema 校验拒绝 inline secret**：任何 manifest 里出现内联凭证直接 schema-rejected，只允许 env-var 名字引用。
13. **`${VAR}` 环境展开**：command/endpoint 中的占位符在 load 期展开；缺变量 = 硬错误（绝不静默空挂载）。
14. **`enabled: false` 语义**：文件可见但卸载，mount 阶段直接跳过且不报警。
15. **错误分类**：`manifest/errors.ts` 给出结构化错误（可区分 schema 违规 / 环境缺失 / 引用悬空）。
16. **preset validate 入口**：`agentos preset validate` 对 preset 及其引用的全部 manifest 做整体校验（含引用完整性）。
17. **引用完整性检查**：preset 里的每个名字都必须能解析到已注册 provider；悬空引用在 validate 期报错而非运行期。

## M3 Loader / Registry（18–24）

18. **MCP stdio 挂载零代码**：`config/tools/*.yml` 声明 stdio transport，loader 直接 spawn，不写任何胶水代码。
19. **MCP http 挂载零代码**：http transport 同理由声明直接连接。
20. **sdk transport 单一出口**：只有 `sdk` transport 走 `packages/adapters/**` —— 这是内核 import 被允许的唯一位置。
21. **drift check**：mount 时声明工具集 vs 服务器真实工具集对账；`allowedTools` 必须镜像离线探测出的真实集合，drift 静默即配置撒谎。
22. **单点失败隔离**：单个工具挂载失败 = 该 provider 缺席 + 告警，绝不拖垮整体启动。
23. **idempotent 驱动重试**：非幂等工具天然失去自动重试（by design）；幂等声明必须是诚实的。*现状注记（2026-10-26）：幂等数据已全链路就位（manifest → ToolMountPlan 透传），但自动重试执行器未落地（`loader/plan.ts:104` 自注 "future executor does"）——今日"非幂等不重试"是空洞真（无任何自动重试存在）。最终验收=重试执行器落地且幂等标记成为其分叉依据。*
24. **启动期挂载**：第一步只做「读 manifest 启动挂载」，运行时热插明确推迟到最后里程碑（反模式 ② 边界）。

## M4 Model / Routing（25–33）

*诚实披露（2026-10-26 对齐记录）："任何模型"的当前边界分三层——Anthropic 兼容端点的任意模型（DeepSeek/GLM/Kimi/网关…）已零代码成立；Bedrock 走 env 开关成立；OpenAI/Gemini/Ollama **原生方言**路径已立（新 `model-<vendor>/` 包）但零实现，PRD T7 承诺的 OpenAI/Ollama 抽取至今未做；"任何运行时"是 #144 跨运行时验收，尚未到达。*

25. **三级路由**：请求级覆盖 → 渠道/租户配置 → 全局默认，优先级定稿。
26. **fallback chain**：健康探测失败短路降级到下一候选模型——**别名级、同一 manifest/endpoint 内**（`routing/health.ts` 头注自认：cross-endpoint failover 是已知契约观察、未实现；routing 不越权立法）。跨 endpoint 逃逸为显式缺口，第二个多 endpoint 场景落地前需契约化。
27. **usage attribution**：用量按 `{ provider, model, tenant }` 打标签落 usage.log，供计量与展示。
28. **model-anthropic-compat runtime**：Anthropic 兼容方言的 `ModelProviderRuntime` 实现——**一切官方提供 Anthropic 兼容端点的厂商（DeepSeek 等）经此零代码接入**。
29. **model-bedrock runtime**：Bedrock 方言 runtime 实现。
30. **deepseek alias 零代码**：`config/models/deepseek.yml` 只加别名/endpoint，无代码改动——**"换模型=改文件"承诺的已兑现样本**。
31. **新厂商 onboarding 路径**：同厂商新 endpoint = 一份 yml；新方言 = `model-<vendor>/` 新 runtime——两条路径写进 CLAUDE.md 且成立。**当前方言存量：anthropic-compat + bedrock 双 runtime，OpenAI/Gemini/Ollama 零实现（PRD T7 遗留）——本点的"成立"以第一个第三方方言 runtime 落地为最终验收。**
32. **tier 身份披露**：路由到兼容层时不得冒充真实模型身份（fix 先例：D-0910-6）。
33. **routing 单测**：`routing/` 下 active / channel / health / attribution 各有行为测试。附带一致性：contracts `ModelProviderRuntime.healthCheck()` 零参形状与 provider 实现的三参形状 `(lease, {env, fetchFn})` 需对齐（对齐第 3 点时发现的悬置项）。

## M5 Session 内核（34–41）

34. **session ledger**：会话状态落 DB（`.agentos/sessions.db`），ledger 是唯一事实源。
35. **会话恢复**：`--continue` 按会话键恢复上下文继续对话。
36. **会话标题**：rename 动词进 ledger，标题可改名且持久。
37. **会话删除**：delete 动词进 ledger，删除后不可见。
38. **per-session workspace 隔离**：每个会话有独立 workspace 目录，互不串扰。
39. **消息历史读取**：transcript reader 消费 TranscriptEntry，供 REST 的 messages 端点回放。
40. **ledger 单测**：`session/ledger.spec.ts` 覆盖新建/改名/删除/恢复。
41. **会话主权**：一个入口同一时刻只属于一个内核（channel → (kernel, preset) 路由表；反模式 ③ 第一天定死）。

## M6 治理 Governance（42–52）

42. **两阶段写回**：`kb_write` 只出 draft + receipt，`kb_commit` 在确认后才持久化到源真相层。
43. **receipt 机制**：`kb-receipts.jsonl` 可审计、可对账，draft 与 commit 一一对应。
44. **>10KB 结果落盘**：超大结果落盘只回指针，不进上下文。*现状注记（2026-10-26 对齐发现）：**未实现**——全仓无尺寸阈值/落盘转换/指针返回（README 纪律表第 5 条目前是纸面承诺；adapter workspaceDir 注释提到 "kb guide, offloads" 但 offload 从未落地）。M6 治理层最大缺口，且 #104/#105（web 文件浏览器/面板）是它的用户侧出口——建议三点一批实现。对标产品有完整参照（mcp-result-offloader.ts：阈值→落盘 session workspace→回短指针）。*
45. **pending 排除**：未 commit 的草稿对 `search` 不可见——实现为**物理隔离**（drafts 目录不在搜索树内，knowledge-markdown/src/index.ts:9），优于过滤：无绕过面。
46. **canUseTool 硬门禁**：工具调用前置门禁在内核侧硬执行（④a 落地），不是 UI 层建议。
47. **escalations 审计**：门禁拦截/升级双落点（2026-10-26 注记：实际为两份文件）——`escalations.log`（人工移交链）+ `.agentos/audit.jsonl`（④a 工具拒绝的执行侧审计，"no reporting, the log is the record"）。审计 sink 失败永不杀 turn。
48. **attribution 显示**：模型归属（provider/model/是否兼容层）向用户可见。
49. **知识写降级**：`confirm:false` 的 entry 下，知识写动词整体降级为只读，内核强制。
50. **frontmatter 治理**：知识页 frontmatter 校验规则（`governance/frontmatter.ts`），lint 可执行。
51. **概览渲染**：governance 概览 render（writeback / overview / neutral 链路）。
52. **干净室断言**：内核侧 `settingSources: []`、`skills: []`、workspace cwd 独立——干净室环境由测试断言保证（clean-room 先例）。

## M7 KnowledgeProvider（53–62）

53. **git+markdown 源真相**：知识库唯一 commit 点是 git PR 评审，框架不引入第二真相。
54. **五动词实现**：`knowledge-markdown` provider 实现全部动词，零第三方依赖。
55. **结构化返回**：search 命中返回结构（引用+片段），no-hit 返回 `[]` 不抛错。
56. **write:false 诚实声明**：capabilities 声明写 false 时，kb_write / kb_commit 从注册面消失。
57. **socket README 一等跟踪**：socket README 是被 git 跟踪的文件而非 gitlink（踩坑修复先例）。
58. **kb gate 准入命令**：`agentos kb gate` —— conformance suite 之外的本地准入闸门。
59. **kb lint**：`agentos kb lint` 检查 frontmatter / 链接 / 索引一致性。
60. **kb stale**：`agentos kb stale` 找出超期未更新的知识页（P7b 立法包）。
61. **目录索引驻留**：全索引摘要控制在 1–2K token，目录菜单常驻上下文即可定位，正文按需 Read/Grep。
62. **RAG 触发条件四条**：>150 页 / 系统性改写缺口 / 非 git 受众 / 跨租户共享——**满足任意两条**才上检索层，否则不加。

## M8 ToolProvider（63–68）

63. **mcp-filesystem manifest**：allowedTools 镜像官方服务器真实工具集（离线探测），drift check 长期静默。
64. **幂等 carve-out**：读侧工具逐个标 `true`，写侧默认 `false`——非幂等工具受保护。
65. **mcp-remote-example**：http transport 的声明样例。*现状注记（2026-10-26）：endpoint 是文档占位符（mcp.example.com），无 allowedTools/幂等声明——它是格式样例，不是真实接入实证。*
66. **fsRoots 授权闭环**：fs-MCP 的根目录授权与干净室 fsRoots 一致（D-0910-7 先例），不存在双轨授权。
67. **env routing**：non-prod / prod 环境路由声明在 manifest，凭证经 env 引用进入。*现状注记：字段已入 schema（数组、缺席=全环境），但**无消费方**——loader/adapter 均不读它过滤（与 #23 同族：数据就位、执行器未落地）。最终验收=按环境过滤挂载生效。*
68. **第二步外来接入验证**：第二份 manifest 以外部身份接入成功——幂等声明生效、非幂等工具受保护（README Step 2 验收）。*现状注记：**未达**——验证从未用真实第二方服务器执行过（#65 是占位符）。最终验收=一个真实外部 stdio/http server 经纯 yml 接入跑通，且幂等/非幂等行为差异可观测。*

## M9 EntryAdapter ×2（69–78）

69. **entry-cli 四动词**：CLI 适配器实现 identity / session / render / confirm。
70. **serve --chat 交互流**：终端 SSE 式交互对话，`--session` / `--continue` / `--verbose` 生效。
71. **entry-rest 四动词**：REST 适配器实现四动词，`confirm` 走 out-of-band 帧。
72. **只读路由面**：`GET /healthz`、`GET /api/status`、`GET /api/sessions` —— status 含配置检查（含 system prompt 披露）。
73. **写路由面**：`PATCH /api/sessions/:id/title`（改名，body `{title}`）、`DELETE /api/sessions/:id`（删除）——REST 面上仅有的写路由。
74. **历史回放**：`GET /api/sessions/:id/messages` 返回中立 entry 序列供前端 hydrate。
75. **对话端点**：`POST /api/chat` SSE 流式返回事件流。
76. **门禁端点**：`POST /api/escalate` / `GET /api/escalations` / `POST /api/confirm` —— out-of-band 确认闭环。
77. **confirm 超时自责**：确认等待超时是 adapter 自己的职责（契约规定），超时行为确定（默认拒绝）。
78. **render 永不抛**：显示层故障不产生异常，降级为文本（契约规定 + 实现遵守）。

## M10 Web Console（79–88）

79. **ChatStream**：SSE 事件流渲染成对话流（含工具调用/结果的展示）。
80. **chat-reducer 状态机**：事件 → 状态的纯函数 reducer，`chat-reducer.spec.ts` 全覆盖。
81. **Composer**：输入 + 发送，含 SelectionMenu 引用选择。
82. **SessionSidebar**：会话列表 / 新建 / 重命名 / 删除（④b 批次）。
83. **InlineEditableTitle**：行内改名交互组件。
84. **ConfigDialog**：读 `/api/status` 的配置检查对话框。
85. **ConfirmModal**：门禁确认弹窗（对接 /api/confirm）。
86. **UsageBar**：用量/计费归因展示（对接 attribution 标签）。
87. **StatusStrip**：连接/会话状态条。
88. **hydrate on load**：切换会话时按 messages 端点回放历史（含 reducer specs 兜底）。

## M11 CLI（89–92）

89. **serve --web**：一条命令拉起 SSE 服务 + web console，仅绑定 127.0.0.1，`--port` 可调。
90. **preset validate**：数据型 runner（无副作用），退出码表达校验结果。
91. **kb 三命令**：`kb gate | kb lint | kb stale` 数据型 runner，全部无第三方依赖。
92. **CLI 零依赖纪律**：`cli/` 不引第三方依赖（by design），usage 输出走数据-only runner。

## M12 Conformance（93–97）

93. **knowledge suite**：黑盒测试 bootstrap/search/getPage/write/commit/listPages 边界（含 scope 隔离）。
94. **tool suite**：loader / drift / sandbox-roots 三组——manifest 驱动挂载可验证。
95. **model suite**：路由优先级 / fallback / attribution 标签。
96. **entry suite ×2**：entry-cli 与 entry-rest 各自过四动词 + confirm 竞态窗口（30s 加宽先例）。
97. **conformance = 唯一准入标准**：第三方接入者的 on-ramp 是跑 suite，不是读文档；CI 内执行非运行时。

## M13 文档与工程纪律（98–100）

98. **设计文档六件套**：product-vision / prd / opportunity-solution-tree / premortem / assumptions / deepseek-harness-vs-agentos 与 README 中英文保持同步、互不矛盾。
99. **README 即合同**：README 的 Core Claims / 反模式 / 纪律表与代码行为一致——写进 README 的承诺都要能指到代码。
100. **过渡路线 C 纪律**：每步可回退——所有演进是纯增量（新契约/新 manifest/新 adapter），不修改、不删除在线系统；zod 全仓锁 v4 作为跨边界纪律长期生效。

---

# v2 扩展（101–200）

> 前提：web 是唯一入口。来源：对标 sre-triage-copilot 的吸收（A1–A12）/ 转化（T1–T10）/ 拒绝（R1–R14）判决，详见 [gap-vs-sre-triage-copilot.md](gap-vs-sre-triage-copilot.md)。
> 原则：吸收的是"web 作为唯一入口后必须有的产品基本功"；转化的是"需求真实但企业 SaaS 形态要换掉"的部分；拒绝的写成负向验收（M20）。

## M14 Web 入口产品化（101–112）

101. **SSE keepalive 心跳**：`POST /api/chat` 流空闲 ≥15s 发心跳帧，代理/浏览器不掐长连接（对标 A1）。
102. **会话运行状态机**：每会话有 running / idle / error / aborted 状态，落 ledger（DB 态而非内存态，对标 A2 + multi-pod 纪律）。
103. **会话中断**：`POST /api/sessions/:id/abort` + 前端停止按钮；中断是确定语义（partial 结果保留 + 状态转 aborted，对标 A3）。
104. **workspace 文件浏览器**：`GET /api/workspace/files?session=` 列出会话落盘目录——>10KB 落盘治理（#44）的用户侧出口（对标 A4）。
105. **workspace 文件读取**：`GET /api/workspace/file?path=` 读单个落盘文件（路径限制在会话目录内），前端 file panel 展示（对标 A5）。
106. **会话转录导出**：单会话导出中立 entry 序列为 JSONL/Markdown 文件下载（对标 A6 数据主权）。
107. **批量会话导出**：多会话打包下载（对标 A6 batch）。
108. **结果脱敏的 config 端点扩展**：`/api/status` 增列当前挂载 provider 与 manifest 路径（只读披露，不出现任何 secret 值）。
109. **错误分级呈现**：StreamError 类事件在前端区分"工具缺席 / 门禁拒绝 / 模型降级 / 网络中断"，不只一个红条。
110. **移动端可用的响应式 console**：web 唯一入口意味着手机浏览器也要能用（16px 边距、无横向滚动）。
111. **会话搜索/过滤**：sidebar 按标题/时间过滤会话列表。
112. **空态与首次运行引导**：无会话、无 provider、无知识库三种空态各有指引（开源用户第一次跑通的路径）。

## M15 Preset 即配置面（113–120）

113. **配置只读披露**：web ConfigDialog 完整披露 preset 解析结果（knowledge/model/tools/entry 四层各自命中哪个 manifest）；改配置 = 改文件 + git PR，**不存在配置写 API**（转化 T2）。
114. **声明式环境路由**：`envRouting: non-prod | prod` 是 tool manifest 字段（#67 既有）；**禁止任何工具签名里出现 env 参数**——环境是挂载关切不是工具关切（转化 T1；对照他们 13 个工具个个带 `env:`）。**守护机制：conformance 增加负向用例**（NeutralTool inputSchema 扫描不得含 env/环境类字段），否则 #67 执行器落地前这条“禁止”无牙。
115. **模型切换器（只读+请求级）**：前端可看三级路由的当前生效链，发送时可做请求级覆盖（#25 的 UI 面）；不改全局默认——改默认 = 改 preset（转化 T7）。
116. **本地一次性 token**：`serve --web` 启动时生成一次性访问 token 打印到终端，浏览器首次输入；不开密钥管理页（转化 T3）。**诚实边界 Q&A**：此形态默认 127.0.0.1-only——"部署到服务器给团队远程用"不在承诺内（那是 #173 边界 + 企业部署者自加反代/VPN 的责任），文档需明示这一问答，避免开源用户误期待。
117. **identity() 插座留白**：本地 token 之外，企业 auth（OAuth/SSO/Slack 映射）是 entry 层示例而非内核功能；契约 + conformance 覆盖 identity 即可。
118. **预设切换端点（读）**：`GET /api/presets` 列出可用 preset；同一内核多 preset 共存是"换业务=换文件"的演示面。
119. **Preset 热校验提示**：web 侧可触发 `preset validate`（无副作用）并回显结果——validate 是数据型 runner 的 UI 面（#90 延伸）。
120. **配置变更审计**：preset/git 变更历史即审计日志；内核不另造 audit 表（git log 就是答案，转化 T2）。

## M16 可观测与诊断（121–128）

121. **工具可见性诊断端点**：`GET /api/tools` 列出当前已挂载工具 + 声明来源 manifest + 幂等标记——drift check（#21）的 API 面（对标 A7 test-mcp）。
122. **Registry 面板**：前端工具注册表可视化（名字 / transport / 幂等 / 健康态），对标 A8 mcp-inspector。
123. **Usage 查询端点**：`GET /api/usage?session=&since=` 聚合 usage.log（#27 的查询面）；按 provider/model 聚合。
124. **Debug 日志文件**：runtime 子进程（stdio spawn）的 stderr 捕获落 `.agentos/logs/`，web 可查看最近片段（对标 A10——他们踩坑：CLI 子进程错误在应用日志不可见）。
125. **healthz 扩展**：`/healthz` 报各 provider 挂载状态与版本（单点失败 #22 的可见面）。
126. **Graceful shutdown**：SIGTERM 时停接新会话、flush 落盘指针与 ledger、关 SSE；单机自托管同样需要（对标 A11）。
127. **escalations 面板**：web 查看门禁拦截历史（#47 的 UI 面）。
128. **会话内事件时间线**：一次对话的 turn 内事件（工具调用/落盘/门禁）可展开查看——排查"为什么慢"的基本功。

## M17 沙箱与部署形态（129–135）

129. **沙箱策略 manifest 化**：tool manifest 增加 sandbox 声明（fs roots / 网络白名单），loader 侧统一执行——对照他们把 bubblewrap 写死在 Dockerfile（转化 T9）。
130. **fs roots 单一授权源**：manifest sandbox 声明与干净室断言（#52/D-0910-7）共用同一配置，无第二套授权。
131. **sqlite 内嵌默认**：`.agentos/sessions.db` 默认零外部依赖启动——已实现为 `node:sqlite`（`DatabaseSync`，零第三方依赖，代价=Node ≥22.5，与 root engines 一致）；**不承诺 Postgres**，但 ledger 全部经接口访问（#34 延伸），换库=换一个实现（转化 T8）。
132. **多 pod 纪律条款**：无模块级共享状态、会话状态只走 ledger、恢复靠重放不靠内存 emitter——以纪律形式抄进工程纪律表（他们用架构代价换的教训，转化 T8/R9）。
133. **换库触发条件文档化**：并发写冲突 / 多实例部署 / >万级会话——满足才上服务器型 DB，类比 RAG 四触发（#62 同构）。
134. **单进程部署默认**：`agentos serve --web` 一条命令即完整产品；Docker 镜像文档化但不做 K8s/ArgoCD/发布脚本（R8）。
135. **数据目录规范**：所有运行时数据在 `.agentos/` 单一根下（sessions / kb-drafts / receipts / logs / workspaces）；**单一位置第一天定死**，杜绝他们 cases-under-sessions 事后 mirror 的搬迁事故（R13）。

## M18 生态扩展面（136–142）

136. **examples/ 目录**：至少 2 个完整示例 preset（triage-demo 对照对标产品 / docs-assistant 知识库演示）——领域逻辑只存在于此（转化 T5）。
137. **新 agent = 新 yml**：接一份新 MCP 工具服务器 + 新 preset 即得到新 agent，**全程零代码零脚手架**——对照他们 480 行拷目录指南（转化 T4；这是差异化的第一演示）。
138. **零脚手架验证测试**：CI 里有"从空白 checkout 起，只加 yml 挂载一个新 stdio server 跑通对话"的测试（#137 的验收保障）。
139. **Skills 即知识通道**：skills 内容经 knowledge provider 进入（git 为源），**无跨仓库同步脚本**（转化 T6）。
140. **第三方 provider onboarding 指南**：conformance suite（#93–97）就是唯一准入说明——复跑 suite 即可接入，无人工 review 流程。
141. **entry-contracts 稳定承诺**：entry-cli / entry-rest 之外的新入口（企业内部实现）按契约自行实现；仓库只收 conformance，不收你们的 Slack（M20 呼应）。
142. **provider 生态位清单**：README 维护"已知 provider 实现清单"（含社区实现 PR 链接）——框架的生态目录不是包管理器。

## M19 开源工程化（143–148）

143. **CI 门禁**：typecheck + lint + 全部 conformance + 单测，PR 必绿；conformance 在 CI 不在运行时（#97 延伸到工程面）。
144. **跨运行时验收演示**：同一 preset 在两个不同 runtime 各跑通 inject→retrieve→writeback（README Step 5 的最终验收，定期跑而非每次 PR）。
145. **安装分发**（2026-10-26 补，开源产品的第 0 承诺）：`npm i -g agentos`（或 `npx agentos`）即装即用——不要求 git clone / pnpm build / Node 源码栈知识；预构建产物分发、bin 入口、npm provenance。**没有这条，其余开源工程化都是仓库内自嗨。**
146. **文档站**：契约 API 文档 + preset 编写指南 + provider onboarding 指南三件套，开源用户的完整路径。
147. **中英双 README 同步机制 + 安全披露**：内容变更必须双语同 PR（#98 工程化）；SECURITY.md + 负责任披露流程；manifest 拒内联密钥（#12）作为安全卖点写明。
148. **版本与变更纪律**：契约 additive-only（#7）落实到 CHANGELOG 与 semver 策略——minor 加点、破坏性改动需 spec 修订记录。

## M14 二期 · Web 产品化深水区（149–160）

149. **KB 草稿收件箱**：web 查看 `kb_write` 产生的 pending 草稿列表（receipt 状态可视化）——两阶段写回（#42）的用户侧闭环，当前最大空缺。
150. **KB 草稿审阅/确认**：草稿可预览 diff、确认 commit 或丢弃——对应 `kb_commit` 的 UI 面（#42/#43）。
151. **门禁请求实时推送**：confirm.request 不只靠轮询——SSE 流内主动推确认帧，ConfirmModal 即时出现（#76 的体验升级）。
152. **工具调用卡片可展开**：ToolCall 渲染区分 collapsed/expanded，展开见入参、结果摘要、耗时、落盘指针。
153. **落盘文件内联预览**：file panel 内直接预览文本/表格类落盘内容（#105 的体验层）。
154. **附件上传**：Composer 支持文件附件（文本/图片），落会话 workspace 并以指针注入对话——七通道之 workspace 文件的双向面。
155. **Token 用量实时显示**：turn 级 token 消耗流式回传前端，UsageBar 实时跳动（#86 延伸）。
156. **深浅色主题**：console 双主题（开源产品基本功）。
157. **键盘操作**：会话切换 / 发送 / 中断 / 确认的完整键盘路径（可及性）。
158. **重连恢复**：SSE 断线后前端自动重连 + 从 messages 端点补齐缺口（multi-pod 纪律的浏览器面：恢复靠重放）。
159. **Web E2E 测试基建**：浏览器层端到端测试（启动→对话→工具→落盘→导出全链路），对标 A12。
160. **错误上报友好化**：未捕获异常在前端呈现 issue 复现指引（版本/preset/会话 id），对接开源 issue 流程。

## M19 二期 · 工程化收尾（161–170）

161. **备份与导出工具**：`agentos data export/import`（会话+KB+usage 全量打包迁移）——数据主权的离线面（#106 的整仓版）。
162. **存储清理命令**：`agentos data gc`（过期 workspaces / 已 commit 草稿 / 旧日志的清理策略，策略文档化）。
163. **预算门禁**：usage 累计超阈值（preset 声明）时新 turn 触发确认——attribution（#27）之上的硬闸门。
164. **并发会话上限**：preset 声明最大并发 running 会话数，超过排队——单机资源治理。
165. **冒烟测试脚本**：`scripts/p2-smoke.mjs` 升级为全链路冒烟（启动→挂载→对话→写回→导出），一键诊断安装。
166. **贡献指南**：CONTRIBUTING.md——provider 实现 / preset 编写 / 边界承诺（M20）三节，新人第一站。
167. **good first issue 标签体系**：`good-first-issue` / `provider` / `conformance` 标签 + 对应模板。
168. **CHANGELOG 自动化**：commit 分类型（feat/fix/spec）归集生成 release notes。
169. **性能预算表**：冷启动时间 / 首 token 延迟 / 会话恢复时间的预算值与回归监控。
170. **发布 v1.0 判据**：1–170 全绿 + 两个 examples 跑通 + 跨运行时验收（#144）通过——v1.0 的定义写死，不靠感觉。

## M20 边界承诺（171–200）——三十条"不做"

> 每条格式：**不做 X —— 因为 Y；替代出口 Z。** 负向验收也是验收：未来任何一个 PR 若实现其中一条，即违背 spec。
> 判决依据见 [gap-vs-sre-triage-copilot.md](gap-vs-sre-triage-copilot.md) 的拒绝清单 R1–R14。

171. **不做 Slack/飞书/IM 入口** —— 输出口先不做（前提已定）；且 IM 治理（allowlist/频道路由）是企业运营不是框架。替代：entry 契约（#141）+ 社区实现。
172. **不做 IDE/MCP server 输出部署** —— 双运行时并存是被对标产品自己承认的包袱（Mastra 残留）。替代：runtime 可换（M1 契约），不在本仓养第二个 runtime。
173. **不做 Mobile/external REST API** —— 同 R3 输出口。替代：entry-rest 即参考实现，外部化由部署者自行加层。
174. **不做企业 SSO/4A/LDAP 内核集成** —— auth 是 identity() 插座。替代：#117 留白 + 示例。
175. **不做 admin 大盘**（users/api-keys/页面级治理 ×14）—— 开源单机的等价物是文件+git+只读披露（#113/#120）。替代：ConfigDialog / registry 面板 / escalations 面板。
176. **不做 vendor 工具硬编码**（Datadog/Bugsnag/ROQS 进 src/）—— 任何 vendor 进内核都摧毁"换 preset 换全家"。替代：`config/tools/*.yml` + drift check。
177. **不做 incidents/investigations/RUM 领域模型** —— 内核背业务的终点是变成第二个对标产品。替代：examples/（#136）。
178. **不做 K8s/ArgoCD/ECR/发布脚本产品化** —— 部署链是企业运维。替代：单进程默认（#134）+ Docker 文档。
179. **不做 Postgres/Prisma 默认** —— 多 pod 是部署形态的产物不是框架需求。替代：sqlite 默认 + ledger 接口隔离（#131）+ 触发条件（#133）。
180. **不做 Next.js 重栈** —— web 是 console 不是应用主战场。替代：vite+react 维持小依赖。
181. **不做双 agent 框架并存**（Mastra+AI SDK 式）—— 单仓双栈是反模式 ③ 的温床。替代：路线 C——多 runtime 各自独立实现，交换走契约。
182. **不做运行时 Zod 动态转换层** —— 转换层即事故层（对标文档原话：静默丢全部工具）。替代：JSON Schema 直传（#6）。
183. **不做配置写 API / DB 存配置** —— 配置即文件、PR 是唯一 commit 点（Core Claim 反面）。替代：preset + git 评审。
184. **不做工具签名级环境参数**（每个工具带 `env:`）—— 环境是挂载关切。替代：envRouting manifest 字段（#114）。
185. **不做跨仓库 skills 同步脚本** —— 同步=第二真相源。替代：knowledge provider + git（#139）。
186. **不做密钥管理/轮换/审批流** —— 企业密钥 SaaS。替代：env-var 引用（#12）+ 本地一次性 token（#116）。
187. **不做多租户内核** —— tenant 只是 usage 标签（#27）。替代：部署级隔离（一租户一实例）。
188. **不做运行时热插 provider** —— 反模式 ②（README 已写）。替代：启动期挂载 + restart。
189. **不做自定义工具协议** —— 反模式 ①。替代：MCP 直接挂载。
190. **不做 RAG 默认层** —— 四触发条件（#62）未满足前，索引+grep 就是答案。替代：knowledge-markdown 兜底。
191. **不做会话文件双位置/镜像** —— 单一数据目录（#135）第一天定死。替代：`.agentos/` 规范。
192. **不做 vendor 可观测内置**（Bugsnag/Sentry 进内核）—— 开源内核自观测=结构化日志+health 端点。替代：#124/#125。
193. **不做 web 框架层 SSR** —— console 是纯静态+REST。替代：静态构建产物（serveStatic）。
194. **不做浏览器内模型直连** —— 凭证进浏览器违背 #12 精神。替代：一切经内核 routing。
195. **不做插件市场/注册表前端** —— MVP 定位（PRD 排除项）。替代：#142 生态位清单（markdown 维护）。
196. **不做图形化 preset 编辑器** —— 文件+PR 的可审计性优于表单。替代：validate 端点（#119）+ 文档。
197. **不做实时协作/多用户编辑** —— 会话主权（#41）：一会话一内核一写者。替代：无（边界即价值）。
198. **不做内核级 prompt 市场/模板库** —— prompt 是七通道之一，属于知识层。替代：knowledge provider 页面承载。
199. **不做 A2A/agent 间协议内核化** —— 跨 agent 互操作是未来插座不是当前承诺。替代：契约 additive-only（#7）预留演进空间。
> **v4 边界增补（2026-10-27，本批即立法）**：① 不做图形化 workflow/agent 编排编辑器（#196 延伸；只读渲染 + scaffold）；② 不做外部 agent 的对等协议或内核导入（#199/#418；外部 agent 只能是 MCP 工具）；③ 不做待办领域模型进内核（#177 延伸；todo_* 工具族 + 中立契约）。三条与 171–200 同级生效。

200. **不做 spec 之外的隐藏承诺** —— 任何功能不进这张表不上主线。替代：本文件 changelog 修订流程（点只增不删）。

---

# v3 对齐任务（201–307）

> 来源：2026-10-26 五路全量代码审计（契约/Loader、Routing/Session/治理、Knowledge/Entry/Conformance、Web console、CLI/工程化/生态），覆盖 1–200 全部 200 点 + 仓库整体。
> 目标：**100 分 = 1–307 全绿**。v1/v2 既有点凡标 DONE 的不重复立点；凡 PARTIAL/MISSING 的，其收口任务在此编号，母点全绿即达标。
> 每点一个 PR 大小、一条可执行验收标准；审计证据全部有 file:line。

## M21 契约与内核收口（201–213）

201. **commit 动词下沉 provider 接口**（#1 收口）：`KnowledgeProvider` 增加 `commit(receipt, confirmation)`，git 操作从 `governance/writeback.ts:51` 挪进 knowledge-markdown；治理层只留策略/审计壳。验收：第二个 KnowledgeProvider 可实现全六动词且零 git 依赖；现有 markdown 流字节等价。
202. **ModelProviderRuntime 契约对齐现实**（#3 收口）：接口与真实 dialect 形状（`healthCheck(lease, opts)` / `resolveModel(models, alias)`）二选一对齐——要么改型并让 model-anthropic-compat / model-bedrock 实现，要么删除接口改以 dialect 类型为契约。验收：全仓恰有一个 provider-runtime 类型，两个 provider 包均按它 typecheck，CLAUDE.md on-ramp 与代码一致。
203. **confirmCapable 从组合根诚实读取**（#4/#49 收口）：`cli/src/serve.ts:253` 不再硬编码 `confirmCapable: true`，改从实际 entry adapter 的 `capabilities.confirm` 读取。验收：挂一个 confirm:false 的 entry 时 kb_write/kb_commit 从注册面消失（e2e 可测）。
204. **单 provider 失败隔离**（#22 收口）：单个 tool manifest 的 env 解析错误降级为告警+该 provider 缺席（preset/knowledge/model 槽位错误仍 fail-loud）。验收：一份缺 env 的 tool yml 不阻止其余工具挂载，serve 带 ⚠ 启动。
205. **幂等重试执行器**（#23/#64 收口）：adapter turn 路径上按 ToolMountPlan.idempotent 分叉——仅幂等工具在传输层失败时重试一次，非幂等永不重试。验收：注入失败 server 的测试中幂等工具重试一次、非幂等零重试，分支依据为 plan.idempotent。
206. **>10KB 结果落盘**（#44 收口）：工具结果超阈值写入会话 workspace 并只回指针，禁止内联大 payload。与 #104/#105（web 文件浏览器）三点一批。验收：>10KB 的工具结果产出 workspace 文件路径 + 上下文一行指针。
207. **envRouting 执行器**（#67 收口）：planTools 按 `AGENTOS_ENV` 过滤挂载（缺席=全环境）。验收：`envRouting:["prod"]` 的 manifest 仅在 `AGENTOS_ENV=prod` 时挂载；conformance loader 套件加此用例。
208. **三级路由补中间层**（#25 收口）：per-channel/租户覆盖表进配置并由 resolveActiveModel 消费。验收：conformance 证明 channel 覆盖压过 preset 槽位、让位于请求级覆盖。
209. **tenant 归因闭环**（#27 收口）：Attribution 类型加 tenant/attr 字段，attributionFor 消费 `RoutedModel.usageAttr`（usageAttr 目前是死接线）。验收：usage.log 行携带 manifest 的 costCenter/tenant 标签。
210. **第一个第三方方言 runtime**（#31 收口）：实现 `model-openai-compat`（resolveChannel + healthCheck 探 /v1/models，形状同 anthropic-compat）。验收：`config/models/openai.yml` 经新 runtime 跑通一次 turn，零 core 包改动。
211. **routing 单测归位 + 签名对齐**（#33 收口）：四组路由行为测试镜像到 `packages/core/src/routing/__tests__`；healthCheck 契约零参 vs 实现三参悬置项随 #202 一并消解。验收：`pnpm --filter @agentos/core test` 跑 active/channel/health/attribution specs；dialect 对象对契约 typecheck 通过。
212. **channel→(kernel, preset) 路由表**（#41 收口）：契约层声明路由映射，组合根经它解析 adapter。验收：加第二条路由是配置变更；悬空路由在 validate 期报错。
213. **兼容层身份徽章**（#48 收口）：`GET /api/status` 披露 dialect tag，前端 StatusStrip/UsageBar 渲染显式"compat endpoint"指示。验收：兼容端点部署显示徽章，原生 bedrock 不显示。

## M22 审计缺陷修复（214–230）

214. **commitDraft 双提交漏洞**：`governance/writeback.ts:67-75` 守卫问"已 commit?"但 draft 文件 commit 后不销毁不标记——同一 receiptId 两次人工确认会双写正文 + 双 git commit。修复：commit 成功后 unlink draftFile（或追加 `phase:"committed"` 台账行并在守卫检查）。验收：同 receiptId 第二次 kb_commit 拒绝"already committed"。
215. **running 状态不落库**：`entry-rest/src/index.ts:410-462` POST /api/chat 从不 `markStatus(row.id, "running")`——第 2..N 个 turn 期间 sidebar 显示 idle。修复：turn 开始置 running、结束置 idle/error。验收：任一 turn 进行中 sidebar 显示 running 状态点。
216. **boundKey 单槽竞态**：`entry-rest/src/index.ts:120-133` 多标签页交错 bind，confirm 可打错会话的流。修复：boundKey 改 per-externalKey map（或 channel 级路由）。验收：两个并发 tab 各自的 confirm 帧到达各自会话。
217. **删除运行中会话的迟到失败**：`entry-rest/src/index.ts:342-358` 无取消令牌——被删会话的迟到 ledger 写入在 catch 内抛错、SSE 中断、部分结果丢失。修复：随 #254（abort 基建）一并处理删除会话的取消语义。验收：删除运行中会话后流有序终止，已产出内容保留。
218. **lastDrift 全局串号**：`entry-rest/src/index.ts:165-168` 任一会话的 drift 覆盖唯一共享变量，/api/status 报告别人的 drift。修复：drift 状态 per-session 化。验收：会话 A 产生 drift 不影响会话 B 的 status。
219. **API 客户端忽略 HTTP 状态**：`apps/web/src/lib/api.ts:8-48` jget/jpost/重命名/删除从不检查 res.ok，500 被当成功解析。修复：非 2xx 抛结构化错误。验收：500 响应在调用侧表现为 reject 而非成功。
220. **/healthz 装饰性**：`entry-rest/src/index.ts:302` 恒 `{ok:true}`，死通道也报健康。随 #292（healthz 扩展）收口。验收：死的 model 通道在 healthz 中可见 unhealthy 而 healthz 仍 200。
221. **GET /api/sessions 硬 LIMIT 100**：`entry-rest/src/index.ts:316-317` 超过即静默截尾、无排序无参数。修复：加排序（updated desc）+ 分页/过滤参数（随 #267 服务端搜索）。验收：>100 会话时列表可翻页取全量。
222. **entry-rest 包内回归测试缺席**：新 title/delete/messages 路由只有 conformance 覆盖（`packages/conformance/entry-rest/entry-rest.spec.ts`），无包内 suite。修复：补 entry-rest 包内 spec 覆盖新路由。验收：`pnpm --filter @agentos/entry-rest test` 覆盖全部路由。
223. **web- 前缀魔法串四处手写**：App.tsx / SessionSidebar / entry-rest ×2 四份手拼 `web-` 约定，改名即失同步。修复：常量进 contracts（或 shared helper）。验收：全仓 `web-` 前缀仅一处定义。
224. **draft 头跨包魔法常量**：knowledge-markdown 写恰好 2 行 draft 头，writeback 靠 `DRAFT_HEADER_LINES=2` 剥离——仅注释跨包耦合，且已因此吃过数据丢失 bug。修复：头格式进 contracts 或改用 `<!-- agentos draft … -->` 围栏探测。验收：单侧改头格式不再可能破坏另一侧 commit。
225. **overview 无 token 预算**（#61 收口）：`governance/render.ts:30-51` renderIndex 无界，>150 页语料击穿 1–2K 承诺。修复：目录菜单 + 首 N 条 + "(…N more)" 截断。验收：500 页 fixture 渲染 ≤2K token（conformance 断言）。
226. **空 allowlist = drift 盲区**：`conformance/tool/drift.spec.ts:11-13` 把空 allowlist 视为放行，mcp-remote-example 因此对任何真实端点零告警。修复：drift 合约区分"未声明（放行+警示）"与"显式全集"。验收：无 allowlist 的真实端点挂载时 drift 报警示事件。
227. **serve 占位 token 掩盖 http auth 失败路径**：`cli/src/serve.ts:150` 塞 `serve-placeholder-not-real` 让不可达示例静默挂载，http auth 失败分支只有测试覆盖。修复：示例 manifest 改 `enabled:false` fixture，serve 不再注糖。验收：无占位 token 时坏端点在 serve 期如实报错。
228. **entry 名册两处失同步**：`cli/src/preset-validate.ts:29` REGISTERED_ENTRY_NAMES 只知 "cli"，`cli/src/serve.ts:138` 知 ["cli","rest"]——引 rest 的 preset 过 serve 挂 preset validate。修复：单一权威名册进 contracts。验收：preset validate 与 serve 用同一列表。
229. **kb-gate loadGate 死参数**：`cli/src/kb-gate.ts:49,61` `now` 形参 `void now;` 从未使用。修复：删除或消费。验收：零 `void` 抑制。
230. **mdFiles 跨文件重复**：`cli/src/kb-lint.ts:25-40` 与 `kb-stale.ts:15-30` 逐字重复。修复：抽 `cli/src/kb-scan.ts` 共享。验收：全仓仅一份实现。

## M23 文档即合同（231–242）

231. **README Quick Start 修复**：README.md:247-257 双语均写 `npm install`——实际 pnpm workspace；写 Node ≥20，实际 engines ≥22 且 node:sqlite 需 ≥22.5。验收：双语 Quick Start 逐条可从零跑通。
232. **README 字段示例与 schema 对齐**：`idempotent: true # required` 实为 optional（tool.ts:42）；`envRouting: non-prod` 标量示例 vs schema 数组（tool.ts:46）。验收：README 每个 yml 示例对 schema 字符级合法。
233. **#73 路由形状对齐**：spec 原文承诺 `PATCH /api/sessions/:id`，代码是 `/title` 后缀且 web 已依赖——**已采用修 spec 文字**（2026-10-26：改为 `PATCH /api/sessions/:id/title`，与 `entry-rest` 路由正则一致）。验收：spec 文字与路由正则逐字符一致。
234. **#59 kb lint 链接+索引**：kb-lint.ts:77-81 现只查 frontmatter；补相对链接存在性检查 + README 索引一致性。验收：一本含死链的书 exit 1 并点名文件+目标。
235. **Implementation Order 表标注现状**：README.md:136-145 的 Step 0-5 表混"已做/计划"（Slack entry 不存在、Step 5 未跑），读者无法分辨。验收：表中每行标 shipped/planned。
236. **README 纪律表第 5 行兑现或降格**：">10KB 落盘"在 #206 落地前是纸面承诺；落地后保留，否则改写为计划。验收：纪律表每行能指到代码（#99 的执行面）。
237. **#132 multi-pod 纪律条款入 README**：完整四条（无模块级共享状态/状态只走 ledger/恢复靠重放/DB 唯一事实源）写进双语 README 工程纪律表。验收：双语纪律表含同构条款。
238. **#133 换库触发条件文档**：并发写冲突/多实例部署/>万级会话——写进双语 README（类比 RAG 四触发）。验收：双语 README 携带同构触发表。
239. **#147 SECURITY.md**：负责任披露流程 + 支持版本 + 127.0.0.1-only 边界 Q&A（#116 的诚实边界）；manifest 拒内联密钥作为安全卖点写明。验收：README 双语链接 SECURITY.md。
240. **README 双语同 PR 纪律**：CI 加双语标题 diff 检查（或 CONTRIBUTING 规则 + 模板）。验收：单语改动触发 CI 失败或强提示。
241. **#148 CHANGELOG + semver 政策**：根 CHANGELOG.md（Unreleased 节起步）+ 版本政策成文（additive-only→minor，破坏→major+spec 修订注记），政策写入 CONTRIBUTING。验收：CHANGELOG 存在且政策可引用。
242. **#166 AgentOS CONTRIBUTING.md**：provider 实现/preset 编写/边界承诺三节；修复 README.md:262 链到 `skills/CONTRIBUTING.md`（第三方 PM Marketplace 指南）的错链。验收：README 链接到本仓贡献指南。

## M24 死代码与仓库卫生（243–251）

243. **ModelProviderRuntime 死接口处置**：contracts/src/model.ts:35-43 零实现者——随 #202 对齐或删除，不保留双轨。验收：见 #202。
244. **envRouting 死字段处置**：随 #207 落地执行器；若不做则删字段——不留无消费 schema。验收：字段要么被 loader 消费要么不存在。
245. **KB_POINTER_LINE 死导出**：governance/tools.ts:143 导出但 serve.ts:283-285 自拼另一串指针——两串互为 drift。修复：统一消费或删除。验收：指针行全仓一处定义。
246. **listPages 生产消费或注明 conformance-only**：现仅 conformance 消费（六动词契约保留）。验收：给 scope picker 一个消费方或代码注释+README 注明现状。
247. **usageAttr 死接线处置**：随 #209 打通；未打通前从 serve 移除假接线。验收：见 #209。
248. **skills/ vendored 内容处置**（#139 收口）：整目录是第三方 PM Skills Marketplace（11 个 pm-* 树，自有 LICENSE/CHANGELOG），内核零引用。二选一：经 knowledge manifest 挂载（git 为源）或整体移出仓库。验收：仓库无未引用插件树；KB 挂载是 skills 唯一通道。
249. **`.agentos/workspace/`（单数）遗留目录清除**（#135 收口）：与 `workspaces/` 并存正是镜像目录事故模式；连同 `.agentos/acceptance/`（21 张截图）、`.agentos/notes/` 归位（.docs 或 .gitignore）。验收：运行时写入只落在六类已文档化子路径。
250. **死 CSS/死组件清除**：apps/web `ui/separator.tsx` 未被引用（拖 @radix-ui/react-separator）；index.css `text-brand-gradient`/`panel-glow`/`focus-glow`/四个 keyframes/`--animate-*` 零使用。验收：删除后 build/typecheck/test 全绿。
251. **e2e 断连产物归位**：`escalations.log.acceptance-noise-20260910` 移出运行时目录。验收：.agentos 运行时目录无历史遗留文件。

## M25 Web 一期任务分解（252–269）——#101–112 的 PR 级拆解

252. **SSE 心跳帧**（#101a）：POST /api/chat 流空闲 ≥15s 发 heartbeat 帧（reducer 已把未知类型当 no-op）。验收：30s 空闲超时代理下流存活 ≥60s。
253. **ledger 开机清扫**（#102b）：启动时把 stale "running" 行扫成 "aborted"（重启恢复）。验收：崩溃重启后无幽灵 running 行。
254. **abort 端点 + AbortController 注册表**（#103a）：`POST /api/sessions/:id/abort` + per-externalKey 取消令牌接进 runner 契约；部分结果保留。验收：工具调用中中断后状态=aborted 且前文已持久。
255. **前端停止按钮**（#103b）：busy 时 Composer 显示停止 + api.abortSession() + reducer 标记 aborted。验收：停止按钮即刻停流并显示部分输出。
256. **workspace 列表端点**（#104a）：`GET /api/workspace/files?session=` 列 .agentos/workspaces/web-\<id\>（size/mtime），resolve+前缀围栏（镜像 index.ts:276-281 静态守卫模式）。验收：`../` 与 symlink 逃逸均 403。
257. **workspace 读端点**（#105a）：`GET /api/workspace/file?path=&session=` 单文件读 + 同围栏 + 尺寸帽。验收：会话目录外 403、内 200。
258. **FilePanel 前端**（#104/105c）：可折叠右侧面板消费两端点。验收：文件列表可见、点击打开内容。
259. **单会话导出端点**（#106a）：`GET /api/sessions/:id/export?format=jsonl|md`，Content-Disposition 下载。验收：浏览器可直接下载。
260. **批量导出端点**（#107b）：`POST /api/sessions/export` {ids} → 打包归档。验收：N 会话导出一个包。
261. **导出 UI**（#106/107c）：会话行导出按钮 + sidebar 多选模式。验收：单/批量均可从 UI 触发。
262. **status 四层披露**（#108a）：StartServerOptions.mounts 增 manifestPath 及 knowledge/entry 层字段，/api/status 透传。验收：ConfigDialog 显示每个 mount 来自哪个 yml。
263. **ConfigDialog 路径渲染**（#108b）：每 mount 行渲染文件路径 + "仅 env 名"注记。验收：四层各自命中文件可见。
264. **错误分类学**（#109a/c）：result payload 加 subtype 分类（tool-missing/gate-denied/model-fallback/network，additive），reducer 分四型渲染 + spec 全覆盖。验收：四类错误各渲染独立可行动卡片，非一条红杠。
265. **响应式布局**（#110a/b）：断点策略（sidebar\<md 折叠为 drawer、StatusStrip 换行、16px 边距）；触控目标 ≥44px。验收：375px 视口无横向滚动。
266. **会话过滤**（#111a）：SessionSidebar 过滤输入（标题/状态 chip，客户端）。验收：输入即时收窄列表。
267. **服务端会话搜索**（#111b，可选）：列表超 100 条后 `GET /api/sessions?q=`。验收：服务端返回匹配子集。
268. **空态组件**（#112a）：EmptyState 三变体（无会话/无 provider/无 KB）由 /api/status mounts 驱动。验收：三空态各显示指引而非空白。
269. **空态测试**（#112b）：三变体渲染测试。验收：变体快照绿。

## M26 Web 二期任务分解（270–288）——#149–160 的 PR 级拆解

270. **KB 草稿列表端点**（#149a）：`GET /api/kb/drafts?session=` 经注入 drafts reader（同 readTranscript 注入模式）。验收：pending 草稿在 UI 可见。
271. **草稿 commit/discard 端点**（#150b）：`POST /api/kb/drafts/:id/commit|discard` 路由到 provider commit 动词（保留确认门）。验收：commit/discard 一个 poll 内反映。
272. **DraftInbox 前端**（#149/150c）：草稿列表 + diff 预览 + 确认/丢弃双按钮。验收：web 可审阅并 commit 草稿。
273. **工具卡片补全数据面**（#152a）：tool.result payload 增结果摘要 + durationMs + 落盘指针（additive）。验收：payload 携带四卡字段。
274. **工具卡片展开补全**（#152b）：展开视图渲染入参/结果摘要/耗时/落盘链接。验收：展开卡四节全显。
275. **文件内联预览**（#153）：FilePanel 渲染文本/csv/markdown + >100KB 截断 + 下载链接。验收：预览不离开 console。
276. **附件上传端点**（#154a）：`POST /api/sessions/:id/attachments`（尺寸帽 + 会话目录围栏）。验收：文件落 .agentos/workspaces/web-\<id\>。
277. **附件指针注入**（#154b）：附件路径+名列表作为上下文注入 turn prompt。验收：模型经 Read 可达附件内容。
278. **附件 UI**（#154c）：Composer 附件按钮 + chip 列表。验收：附件在对话中可见且被 turn 引用。
279. **流式 usage**（#155）：adapter 逐 assistant 消息发 usage.delta 帧，UsageBar 实时跳。验收：turn 中途帧到达、条实时更新。
280. **主题切换**（#156）：light/dark/auto 切换器（localStorage 持久 + data-theme 覆写，与既有 media query 并存）。验收：切换不经 OS、刷新后保持。
281. **键盘路径**（#157）：↑/↓ 会话导航 + Enter 打开；Esc 清稿；停止/确认的键路径 + 快捷键提示行。验收：四动作全部键可达。
282. **重连恢复**（#158）：流断后指数退避重试 + 从 messages 端点补齐缺口（hydrate 合并不覆盖）。验收：断流 2 次重试内恢复内容；reducer 合并 spec 绿。
283. **E2E 测试基建**（#159a）：Playwright devDep + `serve --web` 真实 server（stub model runner）+ 冒烟 spec（加载→发送→工具块→结果）。验收：CI 跑一个绿浏览器 E2E。
284. **E2E 扩展面**（#159b）：abort/workspace 面板/导出流程 spec（依赖 #254/256/259 落地）。验收：每个新面有浏览器 spec。
285. **错误上报面板**（#160a）：React ErrorBoundary + 版本/preset/会话 id + 预填 issue 链接模板。验收：未捕获渲染错误显示指引而非白屏。
286. **异步错误挂钩**（#160b）：window.onunhandledrejection 漏斗进同一面板 toast。验收：异步崩溃可见。

## M27 配置面与诊断 API（287–293）

287. **本地一次性 token**（#116 收口）：runServeWeb 生成随机 token 打印终端，首请求作 query/header 校验。验收：无 token 浏览器 403、启动输出含 token。
288. **预设列端点**（#118 收口）：`GET /api/presets` 扫 config/presets/*.yml（名字+摘要）。验收：curl 列出每个 preset 文件名。
289. **热校验端点**（#119 收口）：`POST /api/presets/validate` 复用 runPresetValidate 返回 {exitCode, lines}。验收：坏 preset 的 web 校验回显与 CLI 一致。
290. **工具诊断端点**（#121 收口）：`GET /api/tools` 返回 mount key/transport/manifest 源路径/每工具幂等位。验收：响应含 mcp-filesystem 的读写幂等切分。
291. **usage 查询端点**（#123 收口）：`GET /api/usage?session=&since=` 聚合 usage.log 按 provider/model。验收：smoke 后该会话返回非零总量。
292. **debug 日志捕获**（#124 + #125 收口）：adapter 捕获 stdio 子进程 stderr 落 .agentos/logs/\<key\>.log + `GET /api/logs`；/healthz 扩展为 per-mount {key,healthy,version}。验收：崩溃的 stdio server 在 web 可见 stderr 片段；死 mount 报 unhealthy 而 healthz 仍 200。
293. **SIGTERM 排水**（#126 收口）：跟踪活跃 runner promise，await-or-timeout 后再关 ledger——不再留"running"僵尸行。验收：turn 中 kill -TERM 后会话行落 idle/error，绝不 running。

## M28 生态与分发（294–300）

294. **escalations 历史端点+面板**（#127 收口）：GET /api/escalations 从计数升级为最近 N 条（时间戳+原因），前端面板渲染。验收：web 显示拦截历史明细。
295. **事件时间线**（#128 收口）：ChatStream turn 内事件（工具/落盘/门禁）可展开 + 时长。验收：展开见"为什么慢"的时间线。
296. **examples 双预设**（#136 收口）：examples/ 落 triage-demo + docs-assistant 完整 preset（各带工具/知识 manifest）。验收：`agentos preset validate examples/triage-demo` exit 0。
297. **零脚手架 CI 测试**（#138 收口）：CI job 从空白 checkout 只加 yml 挂载新 stdio server 跑通。验收：clean checkout + 纯 yml 增量下 job 绿。
298. **第二 runtime + 跨运行时验收**（#144 收口）：实现第二个 runtime adapter（或脚本化假 runtime）+ scripts/p4-acceptance.mjs 双 runtime 跑 inject→retrieve→writeback。验收：同一 preset 两 runtime 均绿。
299. **npm 分发就绪**（#145 收口）：root/cli 去 private、bin 入口、files/prepublishOnly 构建、workspace 打包、engines、provenance 发布流程。验收：`npm pack` 产物免 checkout 可安装且 `npx agentos preset validate` 可用。
300. **provider onboarding 指南 + 生态位清单**（#146/#142 收口）：docs/onboarding.md（跑 conformance 套件的接入路径）+ README 双语"已知 provider 实现"节（含社区 PR 链接约定）。验收：指南命令从零 clone 全绿。

## M29 沙箱与部署（301–303）

301. **sandbox manifest 声明**（#129/#130 收口）：tool schema 加 `sandbox:{fsRoots, network:{allow}}`，loader 校验透传，adapter 消费声明根而非从 args 推断（当前 fsRootsFromPlans 是适配器猜测）。验收：conformance 证明声明根进 additionalDirectories 且未声明路径不授权；授权单源与干净室一致。
302. **Docker 镜像文档**（#134 收口）：Dockerfile（node:22 + pnpm build + CMD serve --web）+ 部署文档；K8s/ArgoCD 维持缺席（边界 #178）。验收：docker run 在 127.0.0.1:8787 起服务。
303. **数据目录规范成文**（#135 执行面）：`.agentos/` 布局（sessions/kb-drafts/receipts/logs/workspaces 六类）写进双语 README；随 #249 清除遗留。验收：运行时写入只落六类子路径。

## M30 对齐验收（304–307）

304. **真实第二方接入实证**（#68 收口）：一个真实外部 stdio/http server 经纯 yml 接入跑通（离线可复跑脚本），幂等/非幂等行为差异可观测（依赖 #205）。验收：脚本作为 opt-in CI job 绿。
305. **全链路冒烟**（#165 收口）：冒烟覆盖 启动→挂载→对话→写回→导出（现缺写回/导出段）。验收：一条命令全链路绿。
306. **v1.0 roadmap 跟踪件**（#170 执行面）：docs/roadmap-v1.md 从 spec 1–307 生成状态列，CI 同步；v1.0 判据=1–307 全绿（含 #144 跨运行时）。验收：文件陈述 v1.0 定义与当前绿数。
307. **审计例程化**：spec 大修（如 v3）须有对应五路审计复跑；README 即合同（#99）抽查机制纳入 CI 或定期任务。验收：审计不再是单次事件而有例程载体。

---

# v4 产品面（308–457）—— web 端：待办 / Agent 角色 / Workflow / Projects / 外部 Agent

> 来源：2026-10-27 产品方向（用户五点需求）：① 从连接的 MCP 总结待办；② 自定义 agents 角色；③ 角色可基于其它 agent，默认自己；④ workflow 编排（跑 skill、跑 MCP、定时任务等）；⑤ project 编排——把角色当"人"来编排工作。定位：muse 式个人 agent 工作台，但以 AgentOS 形态实现，**快速响应模式：利用一切可复用基建（abort/时间线/门禁/导出/ledger）快速落地**。
>
> **五条设计裁决（全部点的宪法，冲突时以此为准）**：
> **A. 配置 vs 数据分界**（不推翻 #183"不做配置写 API"）：角色/workflow/项目模板 = `config/agents|workflows|projects/*.yml`，启动期挂载、git 评审、web 只读+validate 触发（复用 #288/#289）；项目**实例**、待办、运行态 = `.agentos/` 运行时数据，web 可建可写（同会话改名 #36 先例）。web 能改的是"我的数据"，不能改的是"系统配置"。
> **B. 待办工具族模式**：内核不解析 MCP 结果、不内置 todo 领域模型（#177）。模型在对话中总结待办并调用 `todo_*` 工具族写入；工具注册走 governance/tools.ts 既有模式（同 kb_* 族先例），kb 门控/fallback 照抄。
> **C. 外部 agent 唯一路径 = MCP 工具 manifest**：外部 agent 是工具不是对等节点；"基于 agent"引用只能指向同仓库已挂载的角色（config 循环引用 validate 期拒绝）。#199（不做 A2A 内核化）继续成立。
> **D. 不做图形化编排编辑器**（#196 之延伸）：workflow/agent 可视化只读渲染 + 单击实例化 + 触发按钮；编辑 = 改 yml + git PR。每类 manifest 附**场景模板**（scaffold 命令产出骨架 yml），降低纯手写门槛。
> **E. 快速实现 = 零新增第三方依赖**：workflows 图形渲染用 HTML/CSS（复刻既有 SVG 手法，不引 dagre/d3）；流复用 SSE 心跳（#252）；中断复用 abort 基建（#254）；web 端点族复用 entry-rest 既有注入模式；定时用 node 内建（setInterval 拉起的精确窗检查或 setTimeout 链——**不引 cron 库**，调度精度=分钟窗）。zod 全仓锁 v4 照旧，跨边界 JSON Schema。

## M31 待办 Priorities（308–327）

**契约与工具族（308–312）**
308. **todo_item 契约**：contracts 新增（additive-only）——`{id, project?, title, status: todo|doing|blocked|done, priority?: P0–P2, dueAt?, sourceKind, sourceRef?, createdAt, updatedAt}`；端到端 JSON Schema 定义，runtime 无 zod 泄漏。验收：契约文件 + schema 测试绿。
309. **todo 工具族注册**：`governance/tools.ts` 照 kb_* 模式注册 `todo_list / todo_add / todo_update / todo_remove` 四工具，启动期挂载。验收：挂载的内核 turn 内可调用四工具。
310. **todo 存储动词**：ledger 新增 verbs——`todoWrite / todoList`（同一 sqlite，独立表，DB 态非内存态，#132 纪律）。验收：重启后 todo 持久。
311. **todo 待办视图（transcript）**：todo 变更产生中立事件（additive：`todo.changed` NeutralTool 事件，TranscriptEntry 增量字段——同 #273 增字段先例）。验收：回放历史时 todo 变更可见。
312. **待办门禁对齐**：todo_update/remove 复用幂等 carve-out（默认非幂等）与 canUseTool 门禁路径（不新造门禁）。验收：conformance 断言非幂等 todo 工具不重试。

**从 MCP 结果总结待办（313–318）**
313. **todo_extractor 系统提示段**：BASE_SYSTEM_PROMPT 增量段落——"对话或工具结果中出现可行动项时，建议用 todo_add 记录"（提示不改行为，只给模型动词）。验收：提示文披露于 /api/status（system prompt 披露既有）。
314. **总结待办场景模板**：场景卡"总结本次会话待办"= 预置 prompt 模板 + todo_add 调用示例，进 web 场景模板库（#423 挂钩）。验收：一键生成 ≥1 条 todo（e2e）。
315. **sourceRef 回链**：todo_item.sourceRef 指向产生它的会话 id，web 点击跳回对话定位（transcript 回放锚点）。验收：面板 → 会话跳转闭环。
316. **MCP 源标注**：sourceKind ∈ {chat, mcp}——工具结果产生的待办标注来源工具名（如 triage-tracker），面板按源过滤。验收：面板显示来源标签。
317. **todo 导出**：`GET /api/todos/export?format=jsonl|md`（复用 #259 导出基建）。验收：浏览器下载 JSONL/Markdown。
318. **todo 搜索**：面板搜索（标题/状态/来源/项目），服务端过滤（复用 #267 模式）。验收：输入即时收窄。

**面板与通知（319–327）**
319. **todo list 端点**：`GET /api/todos`（状态/项目/优先级过滤参数）。验收：curl 返回全部。
320. **todo 写端点**：`POST /api/todos` / `PATCH /api/todos/:id` / `DELETE /api/todos/:id`——web 直接编辑（用户数据，非配置）。验收：web 增改删即时反映。
321. **TodoPanel 前端**：列表 + 状态四列（todo/doing/blocked/done）+ 优先级标记 + 行内编辑（复用 InlineEditableTitle）。验收：四状态全可视化。
322. **今日聚焦视图**：面板顶部"今日"过滤（dueAt ≤ 今天 + P0/P1 未完成）。验收：过滤精确。
323. **todo.changed 实时推送**：SSE 流内推 todo 变更帧，多标签页即时同步（复用 #216 per-session 修复后的帧路由）。验收：A 标签改动 B 标签即时反映。
324. **通知中心——todo 到期**：dueAt 临近（≤24h）时 web 通知角标 + 通知中心列表（元数据级：标题+due 时间，不透对话内容——R9）。验收：到期前可见通知。
325. **todo 与项目联动**：todo.project 字段关联项目实例（#388+），项目仪表盘聚合未完成数（#397 挂钩）。验收：项目面板显示待办计数。
326. **todo 变更审计**：todo 写路径双落点对齐 #47 模式（审计行记 id+动作，不记正文）。验收：审计文件可对账。
327. **todo gc**：done 且超期（默认 30 天）的 todo 由 `agentos data gc`（#162）清扫，策略文档化。验收：gc 只清策略匹配项。

## M32 Agent 角色自定义（328–352）

**AgentManifest 契约与挂载（328–334）**
328. **AgentManifest 契约**：`config/agents/*.yml`——`{name, kind: "agent", baseAgent?, systemPrompt, tools?, knowledge?, model?}`；启动期挂载（同 preset 模式，不热插——#188）。验收：zod schema 拒绝未知字段+内联密钥。
329. **baseAgent 基座引用**：角色可 `baseAgent: <name>` 继承另一角色（您第 3 点"基于什么 agent，默认自己"）——默认无 baseAgent = 直接跑在主内核（"自己"）。继承语义：systemPrompt 拼接（base 在前、child 覆盖措辞冲突时 child 优先），tools/knowledge/model 取并集、child 覆盖同名。验收：conformance 断言拼接与覆盖规则。
330. **循环引用拒绝**：baseAgent 链 a→b→a 在 validate 期拒绝（#17 引用完整性延伸）。验收：环状 fixture validate exit 1。
331. **悬空引用拒绝**：baseAgent/tools/knowledge/model 引用不存在名字，validate 期报错（复用 #17）。验收：悬空 fixture exit 1。
332. **agent manifest kind 分发**：loader 按 kind:"agent" 分发校验（#11 延伸）。验收：错误 kind 拒绝。
333. **preset×agent 关系**：agent manifest 是 preset 的第五层引用——preset 可 `agents: [name]` 声明本业务可用的角色集（additive；缺席 = 主内核单角色，现行为不变）。验收：preset validate 检查 agents 引用。
334. **`agentos agents validate`**：CLI 校验命令（复用 #90 数据型 runner 模式，无副作用）。验收：退出码表达结果。

**角色运行时（335–341）**
335. **角色会话启动**：`POST /api/chat` 增可选 `agent` 参数（请求级，additive）——命中角色即以该角色的拼接 systemPrompt + 围栏 tools 启动 turn。验收：带 agent 参数的 turn 工具面只含角色围栏。
336. **工具围栏**：角色 tools 声明 = 该角色 turn 的工具白名单（canUseTool 门禁消费围栏——内核侧硬执行，#46 同模式）。验收：围栏外工具调用被拒并落审计。
337. **knowledge 范围**：角色 knowledge 声明限制该角色 turn 的 kb search/getPage 范围（provider 挂载级过滤，#45 物理隔离精神延伸）。验收：围栏外知识页 search 不命中。
338. **角色归因**：TranscriptEntry/usage/审计行携带 agent 标签（additive——usage.log 增 agent 字段，#209 tenant 同族）。验收：usage 查询可按 agent 聚合。
339. **"自己"语义**：无 agent 参数的 turn = 主内核 preset 行为（现行为，零回归）；web 角色选择器默认"自己"。验收：回归测试零差异。
340. **角色 hydrate**：会话记录其 agent 标签，回放/恢复时还原角色上下文（#88 hydrate 延伸）。验收：切换会话角色标签一致显示。
341. **角色中止与门禁**：角色 turn 的 abort/confirm/escalate 全链路复用既有基建（#254/#287/#76），零新机制。验收：角色 turn 中 confirm 弹窗正常。

**角色管理面（342–352）**
342. **`GET /api/agents`**：列出已挂载角色（名字/基座链/摘要/来源 yml 路径——只读披露 #113 模式）。验收：curl 全量返回。
343. **AgentsPanel 前端**：角色卡片（头像 emoji/名字/基座继承链可视化/tools chips/model 标签），点击进角色会话。验收：卡片渲染基座链。
344. **角色场景卡**：新建会话时选角色 = 场景模板驱动（#423 挂钩：每角色自动生成"找 X 聊聊"场景卡）。验收：选卡即开角色 turn。
345. **agents validate 触发**（web）：复用 #289 热校验端点扩展到 agents 目录。验收：web 校验回显与 CLI 一致。
346. **角色脚手架**：`agentos agents scaffold <name>` 产出骨架 yml（含 systemPrompt 模板 + tools 注释样例）。验收：骨架 validate 绿。
347. **角色导出**：角色定义可下载 yml（#259 模式）——分享/备份面。验收：下载文件可重新挂载。
348. **五角色示例包**：examples/ 内置 5 个示例角色（triage-analyst / docs-writer / kb-curator / daily-standup / inbox-triage——示例虚构场景，R6），配 preset 引用。验收：示例 preset validate 绿。
349. **角色使用统计**：usage 按 agent 聚合的面板视图（#291 延伸）。验收：面板显示每角色 token/成本。
350. **角色与会话列表关联**：会话列表显示其 agent 标签（过滤参数 #267 延伸）。验收：按角色过滤会话。
351. **角色删除边界**：删除角色 yml + restart 即卸载（配置面纪律 #188/#183）；引用该角色的运行中会话不中断（会话记录快照标签）。验收：卸载角色后旧会话回放正常。
352. **角色 docs**：agent manifest 编写指南进文档站三件套（#146 延伸），双语。验收：指南双语同步。

## M33 Workflow 编排引擎（353–387）

**WorkflowManifest 契约（353–358）**
353. **WorkflowManifest 契约**：`config/workflows/*.yml`——`{name, kind:"workflow", description, steps: [...], trigger: {...}}`；启动期挂载。验收：schema 拒绝未知步骤型。
354. **步骤五型**：steps 元素是 discriminated union——`{type: "agent", agent, prompt}` | `{type: "tool", tool, args}` | `{type: "skill", skill, prompt?}` | `{type: "kb_search", query}` | `{type: "human", prompt, timeout}`——五型即全部（内核不背业务，#177 精神）。验收：union 五型 schema 测试。
355. **顺序执行**：步骤按序执行，前一步输出自动作为后一步输入上下文（`{prev}` 引用上一步结果）。验收：e2e 三步链结果正确串联。
356. **trigger 三型**：`{type:"manual"}`（默认）| `{type:"schedule", cron}` | `{type:"webhook", secretEnv}`——三型即全部。验收：schema 三型 union。
357. **cron 解析（零依赖）**：`node:crypto`-free 手写解析器——五字段（分/时/日/月/周）支持 `* / - ,` 语法 + `@daily/@weekly` 别名；**不引 cron 库**（E 裁决）。验收：单测覆盖五字段边界（月末/闰年/`*/15`）。
358. **workflow validate**：`agentos workflows validate` + preset 可 `workflows: [name]` 引用（同 #333 模式）。验收：悬空 agent/tool/skill 引用 exit 1。

**执行引擎（359–366）**
359. **顺序执行器**：core 新增 `workflow/runner.ts`——按 steps 依序调用（agent 步骤 = 带角色标签的 turn；tool 步骤 = 工具直调；kb_search = provider.search）。验收：三型步骤的 runner 单测。
360. **step 间上下文传递**：前步结果摘要（≤1KB，超限走 #206 落盘+指针）注入后步 prompt。验收：超 1KB 结果走落盘指针。
361. **human-in-the-loop 步骤**：`type:"human"` 步骤产生确认请求（复用 #76 confirm 端点 + #285 SSE 推送），超时默认拒绝（#77 语义）。验收：human 步骤触发 ConfirmModal，拒绝即停。
362. **失败语义**：步骤失败 = workflow 实例状态 error + 已完成步骤结果保留 + 可从失败步重续（`resumeFrom`）。验收：失败重续不重跑已完成步。
363. **幂等与重试**：workflow 重跑用实例 id 去重（同实例不双跑）；tool 步骤复用 #205 幂等执行器。验收：同实例重复触发拒绝。
364. **workflow 状态机**：pending / running / done / error / aborted——落 DB（ledger 表或独立表，#132 纪律）。验收：崩溃重启后状态可查。
365. **abort 联动**：运行中 workflow 实例可 abort（复用 #254 abort 基建 + 取消令牌传递到各步）。验收：abort 后部分结果保留、状态 aborted。
366. **并发上限**：preset 声明 workflow 最大并发（同 #164 会话上限模式），超出排队。验收：N+1 排队不报错。

**调度器（367–371）**
367. **调度窗检查**：serve 内 setInterval（默认 60s）扫 schedule 触发器——窗内（lastRun < now ≤ nextRun）即触发一次并记 lastRun（精确到分钟窗，E 裁决）。验收：假时钟单测窗判定。
368. **lastRun 持久**：lastRun 落 DB 非内存（重启不重跑已触发窗，#132）。验收：重启后无双重触发。
369. **错过窗策略**：停机错过的窗（miss > 1 周期）跳过不回放（防雪崩）；missedRun 记录可见。验收：停机 2 周期后只跑下一窗。
370. **手动触发端点**：`POST /api/workflows/:name/run`（manual + schedule 型均可手动）。验收：curl 触发产生实例。
371. **webhook 触发器**：`POST /api/hooks/:name`（secretEnv 指定的 env var 值作 Bearer 校验，#12 env 引用模式）。验收：错误 secret 401、正确 202。

**Workflow 面板（372–387）**
372. **`GET /api/workflows`**：列出已挂载 workflow（名字/描述/触发器/步骤数/来源 yml）。验收：curl 全量。
373. **`GET /api/workflows/:name/runs`**：实例列表（状态/开始/结束/耗时）。验收：含历史实例。
374. **`GET /api/workflows/runs/:id`**：单实例详情——步骤级状态/输出摘要/耗时/错误（复用 #295 时间线模式）。验收：步骤级时间线可见。
375. **WorkflowsPanel 前端**：workflow 卡片列表（触发器徽章 schedule/manual/webhook、步骤数、最近运行状态点）。验收：三型徽章渲染。
376. **workflow 只读图**：点开 workflow 显示纵向步骤流（HTML/CSS 纵向连线，五型各一图标——**不引图形库**，E 裁决）。验收：五型图标纵向连线渲染。
377. **运行按钮 + 实例化**：手动触发（#370 的 UI 面）+ 运行中实时步骤点亮（SSE 事件流，#252 心跳保活）。验收：点运行后步骤逐个点亮。
378. **实例时间线**：实例详情复用 #295 事件时间线组件渲染步骤事件（开始/工具调用/落盘/确认门）。验收：时间线含门禁事件。
379. **失败步骤重续 UI**：error 实例显示"从第 N 步重续"按钮（#362 UI 面）。验收：按钮触发 resumeFrom。
380. **schedule 下一跑时间显示**：卡片显示 nextRun（cron 解析器产出）。验收：@daily 显示明日窗。
381. **错过窗可见性**：missedRun 徽章 + 说明（#369 的 UI 面）。验收：徽章显示跳过数。
382. **workflow 脚手架**：`agentos workflows scaffold <name>` 骨架 yml（五型样例 + trigger 注释）。验收：骨架 validate 绿。
383. **每日简报示例 workflow**：examples 内置 `daily-brief.yml`——schedule @daily：triage-analyst 角色总结昨日会话 → kb_search 最近变更 → todo_add 今日聚焦（全复用 308+/328+ 既有件）。验收：示例 validate 绿 + 手动触发 e2e 绿。
384. **工作流导出**：实例结果可导出（#259 模式：jsonl/md）。验收：浏览器下载。
385. **workflow 审计**：实例/步骤执行落审计（id+状态+耗时，不落 prompt 正文——R2/R9）。验收：审计可对账实例数。
386. **workflow 通知**：实例 done/error 推通知中心（#324 同中心，元数据级）。验收：完成即角标。
387. **workflow 会话回链**：agent 步骤产生的 turn 关联实例 id，面板可跳转会话回放（#315 同模式）。验收：步骤→会话跳转。

## M34 Projects 项目编排（388–407）

**配置 vs 数据分界（388–391）**
388. **项目模板 yml**：`config/projects/*.yml`——`{name, kind:"project", description, agents?: [...], workflows?: [...], tools?: [...], knowledge?: [...]}`——模板声明这个项目"可以用哪些角色/流程/工具/知识"（配置面，git）。验收：schema + 悬空引用 validate。
389. **项目实例（数据面）**：web"新建项目"基于模板实例化——实例 = `{id, template, title, createdAt, todos:[], sessions:[], runs:[]}` 落 DB（用户数据，web 可写——A 裁决）。验收：web 建项目即时入库。
390. **模板 vs 实例边界守护**：实例不可改模板字段（改模板 = 改 yml + git）；实例可改的只有标题 + 关联数据。conformance 增负向用例（实例 API 改 agents 列表 = 4xx）。验收：负向用例绿。
391. **项目 validate + 脚手架**：`agentos projects validate` + `projects scaffold`（同 334/346/382 模式）。验收：骨架绿。

**项目运行时（392–397）**
392. **项目范围角色/流程**：项目实例的会话与 workflow 只能用模板声明的 agents/workflows/tools（围栏 = 模板 ∩ preset 挂载，validate 期双重检查）。验收：围栏外引用拒绝。
393. **项目会话聚合**：项目视图列出其实例的全部会话（transcript 标签 project=实例 id——#338 归因延伸）。验收：项目页会话列表 = 该项目全部。
394. **项目 workflow 聚合**：项目视图列出其实例触发的全部 workflow 运行（runs 标签 project）。验收：项目页运行列表全量。
395. **项目仪表盘**：项目首页 = 待办计数（#325）+ 最近会话 + 最近运行 + 各角色用量（#349）。验收：四区块渲染。
396. **项目数据导出**：项目实例全量导出（会话+待办+运行记录打包，#260 批量导出模式）。验收：一包下载全量。
397. **项目删除语义**：删除实例 = 数据不可见（#37 同语义），模板 yml 不受影响。验收：删实例后模板仍可再实例化。

**Projects 面板（398–407）**
398. **`GET /api/projects`（模板）+ `GET /api/project-instances`（实例）**：两列表分置（配置只读/数据可写的 API 面）。验收：两端点分置可见。
399. **项目实例写端点**：`POST /api/project-instances`（基于模板建）/ `PATCH .../:id`（改名）/ `DELETE`——数据面。验收：增改删即时。
400. **ProjectsPanel 前端**：项目卡片网格（模板徽章+待办计数+最近活动）。验收：网格渲染。
401. **项目详情页**：仪表盘（#395）+ 会话/运行/待办三标签页。验收：三标签可切换。
402. **新建项目向导**：选模板 → 起名 → 建（模板卡驱动，#423 场景模板同模式）。验收：三步完成。
403. **项目内新建角色会话**：项目详情选模板声明的角色直接开 turn（#344 + #392 围栏）。验收：围栏内角色可开、围栏外不显示。
404. **项目内触发 workflow**：项目详情手动触发声明的 workflow（#370 + 实例标签）。验收：触发的 run 关联项目。
405. **项目搜索**：实例按标题过滤（#267 模式）。验收：即时收窄。
406. **示例项目**：examples 内置 1 个完整示例项目模板（虚构场景 R6）+ 配套 agents/workflows。验收：示例 validate 全绿。
407. **项目 docs**：projects 编写指南（含配置vs数据分界 Q&A——"为什么不能在 web 改模板"），双语。验收：指南双语。

## M35 外部 Agent 第三方功能（408–422）

**MCP 唯一路径（408–413）**
408. **外部 agent = tool manifest**：外部 agent（第三方功能，您第 2/5 点）经 `config/tools/<x>.yml` 接入（MCP stdio/http 均可，#18/#19 既有零代码路径）——不建新接入面。验收：一份外部 agent server yml 零代码挂载。
409. **外部 agent manifest 规范**：文档化"把第三方 agent 作为 MCP server 接入"指南（allowedTools 镜像 + 幂等声明 + drift check 三件套，#63 模式）。验收：指南命令从零跑通。
410. **agent 步骤调外部 agent**：workflow `type:"tool"` 步骤可调用外部 agent 工具（即 #354 tool 步骤的常规用法，无特判）。验收：外部 agent 工具进步骤链 e2e。
411. **外部 agent 幂等保护**：外部 agent 工具受 #205 执行器保护——非幂等声明工具不自动重试。验收：非幂等外部工具零重试。
412. **外部 agent 健康可见**：外部 agent server 健康态进 /healthz per-mount（#292）与 registry 面板（#122）。验收：死 server 面板红点。
413. **外部 agent 生态位清单**：README"已知 provider 实现"节（#142）延伸收录"已知外部 agent 接入"样例链接。验收：README 节存在且双语。

**回流与治理（414–418）**
414. **外部结果进待办**：外部 agent 工具结果同享 #313 提取段——可总结为 todo（sourceKind:"mcp"，#316 标注来源）。验收：外部结果 → todo 链路 e2e。
415. **外部结果落盘**：外部 agent 大结果（>10KB）同走 #206 落盘（无特判）。验收：大结果指针化。
416. **外部 agent 审计**：调用落 audit.jsonl（工具名+结果摘要，不落全文——R2）。验收：审计行含外部工具名。
417. **外部 agent 门禁**：围栏/门禁照常生效（角色 tools 未声明该外部工具则拒——#336 无特判）。验收：围栏外外部工具被拒。
418. **外部 agent 与"基于 agent"边界**：baseAgent（#329）**只能**引用同仓库 config/agents 角色——不可引用外部 agent（外部是工具不是角色基座；避免 prompt 级联到不可见第三方）。conformance 负向用例（baseAgent 指向 tool manifest 名 = 拒绝）。验收：负向用例绿。

**示例与文档（419–422）**
419. **外部 agent 示例**：examples 内置 1 个外部 agent 接入样例（任意可离线复跑的 stdio server，虚构场景 R6）。验收：样例离线 e2e 绿。
420. **外部 agent vs 角色对比文档**：文档站对比表——什么时候接 MCP server（外部）、什么时候写 agent yml（内部角色）；双语。验收：对比表双语。
421. **外部 agent 故障隔离**：外部 server 崩溃 = 该工具缺席 + 告警（#22 既有），不杀 workflow 实例（步骤失败语义 #362 接管）。验收：崩溃后 workflow 状态 error 可重续。
422. **外部 agent 使用计量**：调用计入 usage attribution（#27/#209 同打标签，manifest 名即标签）。验收：usage 查询可按外部工具聚合。

## M36 Web 产品面整合（423–442）

**Home 与导航（423–430）**
423. **场景模板库**：场景卡系统——预置场景（总结待办/找角色聊聊/跑 workflow/新建项目）+ agents/workflows/projects 自动生成卡（#344/#375/#402 挂钩点）；定义进配置 yml（场景 = prompt 模板 + 目标引用，git 评审）。验收：四类卡自动渲染。
424. **Home 视图**：登录首页 = 场景卡网格 + 今日聚焦 todo（#322）+ 最近会话/项目快捷。验收：三区块渲染。
425. **五区导航**：console 顶栏导航——Home / Chats / Todos / Workflows / Projects（Agents 并入 Home 角色卡与 Chats 过滤，不单列）。验收：五区可达。
426. **⌘K 快捷启动**：命令面板（⌘K）——搜会话/角色/workflow/项目/场景卡（纯前端过滤，零依赖）。验收：⌘K 全五类可搜可跳。
427. **通知中心**：右上角铃铛 + 下拉列表（todo 到期 #324 / workflow 完成 #386 / 确认请求 #285 汇聚），点击跳转。验收：三类通知汇聚跳转。
428. **全局状态条扩展**：StatusStrip 增 workflow 调度器心跳指示（scheduler alive/dead）+ 活跃实例计数。验收：指示实时。
429. **移动端适配扩展**：五区导航 + 面板群在 375px 视口可用（#265 延伸到新面）。验收：无横向滚动。
430. **键盘路径扩展**：五区导航/⌘K/通知的键盘操作（#281 延伸）。验收：全键盘可达。

**面板基建复用（431–437）**
431. **通知轮询基建**：web 通知中心数据源——`GET /api/notifications`（聚合 todo 到期+workflow 完成+pending confirm，元数据级 R9）+ 前端 30s 轮询（简单可靠，不造 WebSocket——E 裁决）。验收：轮询数据三类齐全。
432. **面板组件统一**：TodoPanel / AgentsPanel / WorkflowsPanel / ProjectsPanel 共用面板壳（标题栏+空态+加载态，EmptyState #268 复用）。验收：四面板共享壳组件。
433. **空态四连**：无 todo/无角色/无 workflow/无项目的空态指引（#268 模式延伸，各指向 scaffold 命令）。验收：四空态指引文案。
434. **scaffold 文档贯通**：四类 scaffold（agents/workflows/projects/场景模板）统一文档节"从空到有"（双语）。验收：命令逐条可跑。
435. **面板数据刷新协议**：面板间导航时的数据获取统一走 SWR-like 简单缓存或直接 fetch（零依赖，手写 useFetch hook——不引 SWR/react-query，E 裁决）。验收：无第三方状态库。
436. **深浅色主题覆盖新面**：四面板 + Home + ⌘K 全部过 #280 主题切换。验收：切换全 UI 一致。
437. **E2E 覆盖新面**：Playwright（#283 基建）扩展 spec——建 todo/开角色会话/跑 workflow/建项目四链路。验收：四 spec 绿。

**产品面守护（438–442）**
438. **负向验收扩编**：M20 新增边界——不做图形化 workflow 编辑器、不做外部 agent 对等协议、不做待办领域模型进内核（对应 #196/#199/#177 延伸——见 M37 复审点）。验收：边界条目入 spec M20（本批即立法）。
439. **README 产品面更新**：Core Claims 增"个人工作台五件套（待办/角色/workflow/项目/外部 agent）"——全部映射到 yml/契约/数据分界，双语同 PR（#240）。验收：README 与实现同步。
440. **架构图更新**：`.docs/architecture-diagram`（或 README 内嵌图）纳入五区产品面 + 数据流（配置 yml → 挂载 → 实例数据 → 面板）。验收：图与代码一致。
441. **progress.md 扩编**：308–457 进跟踪件（#306 roadmap 延伸）。验收：点号连续可勾。
442. **v4 审计点**：五路审计复跑一次 v4 新面（#307 例程的首个执行样例）。验收：审计报告落 .docs。

## M37 快速实现基建与守护（443–457）

**基建（443–448）**
443. **todo/agent/workflow/project schema 单测**：四类新 manifest 的 loader/conformance 契约测试（#93–97 模式）。验收：四套件绿。
444. **DB migration 纪律**：todo/实例/runs 新表用 additive migration（`PRAGMA user_version` 递增，向后兼容——不删不改既有表）。验收：旧库升级零损。
445. **调度器单测（假时钟）**：cron 解析 + 窗判定 + 错过策略全假时钟单测（不 sleep 真时钟）。验收：套件 <5s 跑完。
446. **围栏矩阵测试**：角色×项目×preset 三层围栏的组合 conformance（围栏 = 最严交集）。验收：矩阵用例绿。
447. **并发与恢复**：workflow 实例崩溃恢复 e2e（kill -TERM 中途 → 重启 → resumeFrom 可续）。验收：恢复 e2e 绿。
448. **性能预算扩展**：#169 预算表增——调度窗判定 <10ms / 五面板冷加载 <1s / ⌘K 过滤 <100ms。验收：预算表成文 + 基准脚本。

**examples 打包（449–452）**
449. **examples/workbench 完整示例**：聚合示例——1 项目模板 + 3 角色 + 2 workflow（含 daily-brief）+ todo 场景 + 外部 agent 样例（#348/#383/#406/#419 汇聚）。验收：`preset validate` + 手动 e2e 绿。
450. **examples 脚本化冒烟**：`scripts/workbench-smoke.mjs`——挂载→建项目→开角色会话→产 todo→跑 workflow→导出，一键验证五件套。验收：一条命令绿。
451. **examples README**：五件套各自一段"这是什么/为什么 yml"——差异化叙事（对照 muse 式产品的黑箱配置）。验收：双语。
452. **CI 扩展**：workbench-smoke 进 CI opt-in job（#297 同模式——重 E2E 不卡每 PR）。验收：CI 有该 job。

**复审与验收（453–457）**
453. **M20 边界复审**：逐条复核 171–200 对五件套是否漏防（如 #197 会话主权 vs workflow 会话、#199 vs 外部 agent、#183 vs 项目实例写 API——分界已在 A 裁决成文），产出复审记录。验收：复审记录落 .docs。
454. **v2.0 判据**：v2.0 = 1–457 全绿（v1.0 判据 #170 维持 1–307）；判据写死进 roadmap（#306）。验收：roadmap 呈现双判据。
455. **隐私复审**：五件套过 R1–R9 隐私红线逐条（todo 内容/角色 prompt/workflow 步骤/项目数据全属用户数据——本地性 R3、审计脱敏 R2/R8、通知元数据 R9）。验收：复审记录落 .docs。
456. **文档站扩编**：三件套（#146）扩为五件套文档（+agents/workflows/projects 编写指南）。验收：五指南双语。
457. **v4 首跑演示脚本**：`scripts/demo-workbench.mjs`——从零到五件套全部可见的演示脚本（录屏/截图友好的分步输出）。验收：脚本跑完五件套全展示。

*配对文档：[progress.md](progress.md)（逐点状态）。对标判决：[gap-vs-sre-triage-copilot.md](gap-vs-sre-triage-copilot.md)。
Spec 修订规则：点只能增或改验收标准，不许悄悄删——删除必须留 changelog。v2（2026-10-26）：1–100 冻结为基线，新增 101–200；v2 差异化定位一句话——"sre-triage-copilot 是一个 SRE 分诊产品，AgentOS 是做出任意分诊产品的框架：它的全部功能面，在我们的世界里要么是 preset 文件、要么是 config/*.yml、要么是 examples/，没有一样需要写进内核"。
v3.1（2026-10-26）：#73 的 PATCH 路由文字修正为 `/api/sessions/:id/title`（与代码正则一致，属"只修验收标准措辞"，点未删除）；#233 相应标注为已采用此方案。
v3（2026-10-26）：全量代码审计后新增 201–307（107 点）——每个 PARTIAL/MISSING 的收口任务、每个审计新发现缺陷、每处死代码各成一点；目标态 = 1–307 全绿即 100 分。审计口径：DONE 不重立点，证据一律 file:line。
v4（2026-10-27）：新增 308–457（150 点）产品面——web 端五件套：待办 Priorities（308–327）/ Agent 角色自定义（328–352）/ Workflow 编排含定时（353–387）/ Projects 项目编排（388–407）/ 外部 Agent（408–422）+ 产品面整合（423–442）+ 快速实现基建（443–457）。五条设计裁决 A–E 为本批宪法：配置（yml+git）与数据（.agentos+web 可写）分界；待办走工具族非内核模型；外部 agent 唯一路径 MCP；不做图形化编排编辑器；零新增第三方依赖。v1.0 判据维持 1–307；v2.0 判据 = 1–457 全绿（#454）。*
