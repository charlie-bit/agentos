# AgentOS Spec — 307 点承诺清单

> 定位：本文件是**全量承诺清单**（what & acceptance），按模块分组、全局编号 1–307。
> 状态（done / in-progress / todo / blocked）一律不写在这里，由配对的 [progress.md](progress.md) 逐点打勾。
> 每个点必须锚定真实代码位置或 PRD 承诺；写不出的点不许进这张表。
>
> 1–100 为 v1 基线（既有承诺，编号冻结）；101–170 为 v2 扩展（对标 sre-triage-copilot 后吸收/转化的产品能力，web 为唯一入口）；171–200 为**边界承诺**（30 条明确的"不做"，每条含替代出口——对标的拒绝判决见 [gap-vs-sre-triage-copilot.md](gap-vs-sre-triage-copilot.md)）；201–307 为 v3 对齐任务（2026-10-26 五路全量代码审计产出：每个 PARTIAL/MISSING 缺口、每个审计新发现的 bug、每处死代码，各成一个 PR 大小的点，100 分 = 1–307 全绿）。
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
73. **写路由面**：`PATCH /api/sessions/:id`（改名）、`DELETE /api/sessions/:id`（删除）——REST 面上仅有的写路由。
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
233. **#73 路由形状对齐**：spec 承诺 `PATCH /api/sessions/:id`，代码是 `/title` 后缀且 web 已依赖——修 spec 文字（最省）或别名路由。验收：spec 文字与路由正则逐字符一致。
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

*配对文档：[progress.md](progress.md)（逐点状态）。对标判决：[gap-vs-sre-triage-copilot.md](gap-vs-sre-triage-copilot.md)。
Spec 修订规则：点只能增或改验收标准，不许悄悄删——删除必须留 changelog。v2（2026-10-26）：1–100 冻结为基线，新增 101–200；v2 差异化定位一句话——"sre-triage-copilot 是一个 SRE 分诊产品，AgentOS 是做出任意分诊产品的框架：它的全部功能面，在我们的世界里要么是 preset 文件、要么是 config/*.yml、要么是 examples/，没有一样需要写进内核"。
v3（2026-10-26）：全量代码审计后新增 201–307（107 点）——每个 PARTIAL/MISSING 的收口任务、每个审计新发现缺陷、每处死代码各成一点；目标态 = 1–307 全绿即 100 分。审计口径：DONE 不重立点，证据一律 file:line。*
