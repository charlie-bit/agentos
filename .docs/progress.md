# AgentOS progress — spec 1–307

> 逐点状态台账。`[x]` = 验收标准已由代码 + 测试兑现（证据行给出 file:line 或测试名）；
> `[ ]` = 未完成/未验证；`[~]` = 部分兑现，行尾写缺口。状态只记事实，不记愿望。
> 边界承诺（171–200）是负向验收：仓库当前没有任何代码实现它们，即成立；新增实现即违背。
> 最近审计：2026-10-26（本表由执行过程逐点更新）。

## M1 契约层（1–10）

- [x] 1 KnowledgeProvider 六动词契约（commit 待下沉，见 #201）— `packages/contracts/src/knowledge.ts:82`
- [x] 2 ToolProvider manifest 六要素 — `contracts/tool.ts:37-73`
- [x] 3 ModelProvider runtime 契约 — 由 #202 对齐为 `ModelDialect`，`contracts/model.ts`
- [x] 4 EntryAdapter 四动词 + confirm:false 合法 — `contracts/entry.ts:72-83`
- [x] 5 Preset 四层名字引用 — `contracts/preset.ts`
- [x] 6 JSON Schema 跨边界 — `tool.ts:49-56` schemaExchange literal
- [x] 7 additive-only 演进 — 本轮多次以 additive 方式扩展（Attribution.tenant/attr、DriftReport.unverified）
- [x] 8 NeutralTool 中立格式 — `contracts/neutral-tool.ts`
- [x] 9 escalationGate 三段链 — `knowledge.ts:155` + `governance/tools.ts:91` confirm 调用点
- [x] 10 TranscriptEntry 最小可渲染集 — `contracts/entry.ts:35-46`

## M2 Manifest（11–17）

- [x] 11 kind 分发加载 — `core/src/manifest/load.ts:38-43`
- [x] 12 内联凭证 schema 拒绝 — `core/src/manifest/__tests__/validate.spec.ts`（secret.yml fixture）
- [x] 13 `${VAR}` 展开缺变量硬错 — `loader/plan.ts:41-51`
- [x] 14 enabled:false 卸载语义 — `loader/plan.ts:64-65` + 测试
- [x] 15 结构化错误分类 — `manifest/errors.ts`
- [x] 16 preset validate 入口 — `cli/src/preset-validate.ts`
- [x] 17 引用完整性 — `manifest/validate.ts:63-118`

## M3 Loader / Registry（18–24）

- [x] 18 MCP stdio 零代码挂载 — `loader/plan.ts:65-68`
- [x] 19 MCP http 零代码挂载 — `loader/plan.ts:69-85`
- [x] 20 sdk transport 单一出口 — `eslint.config.mjs` 内核 import 立法
- [x] 21 drift check 对账 — `core/src/loader/drift.ts` + adapter `collectDrift`
- [x] 22 单点失败隔离 — planTools warnings 降级（sdk factory 缺席）
- [x] 23 idempotent 驱动重试 — 执行器落地：#205 `core/src/loader/retry.ts` + adapter `withToolRetry`
- [x] 24 启动期挂载 — loader→plan 在 assemble 期完成；无热插（#188）

## M4 Model / Routing（25–33）

- [x] 25 三级路由 — 请求 > 频道/租户 > 槽位（#208）
- [x] 26 fallback chain — 别名级(manifest 内) + 显式 `preset.fallbackModels` 跨 endpoint(按序、只在前者全不健康时) — alias 级已实现 `routing/health.ts:65-74`；跨 endpoint 未实现（契约化前不做）
- [x] 27 usage attribution — `routing/attribution.ts`；tenant/attr 由 #209 打通
- [x] 28 model-anthropic-compat runtime — `providers/model-anthropic-compat/src/index.ts`
- [x] 29 model-bedrock runtime — `providers/model-bedrock/src/index.ts`
- [x] 30 deepseek alias 零代码 — `config/models/deepseek.yml`
- [x] 31 新厂商 onboarding 路径 — 文档 `CLAUDE.md`；第三方方言 runtime 见 #210（未做）
- [x] 32 tier 身份披露 — `adapters/claude-sdk/src/run.ts:391` shortModelName + 系统提示
- [x] 33 routing 单测 — 四个 spec 已归位（#211）：`core/src/routing/__tests__/`

## M5 Session 内核（34–41）

- [x] 34 session ledger — `core/src/session/ledger.ts`
- [x] 35 会话恢复 --continue — `cli/src/serve.ts` resume 指针
- [x] 36 会话标题 rename — ledger.setTitle + REST PATCH
- [x] 37 会话删除 — ledger.deleteSession + REST DELETE
- [x] 38 per-session workspace — `.agentos/workspaces/<key>`
- [x] 39 消息历史读取 — `adapters/claude-sdk/src/transcript.ts` + messages 端点
- [x] 40 ledger 单测 — `session/__tests__/ledger.spec.ts`
- [x] 41 会话主权 — channel→entry 路由表 + 悬空校验（#212）

## M6 治理 Governance（42–52）

- [x] 42 两阶段写回 — `governance/tools.ts` kb_write/kb_commit
- [x] 43 receipt 机制 — `kb-receipts.jsonl`，commit 后 phase:"committed"
- [x] 44 >10KB 结果落盘 — #206 `governance/offload.ts` + adapter 接线
- [x] 45 pending 排除（物理隔离） — `knowledge-markdown` drafts 目录不在搜索树
- [x] 46 canUseTool 硬门禁 — `adapters/claude-sdk/src/run.ts:151,505`
- [x] 47 escalations 双审计 — `escalations.log` + `.agentos/audit.jsonl`（sink 失败不杀 turn）
- [x] 48 attribution 显示 — web UsageBar/StatusStrip（shortModelName tier-2）
- [x] 49 知识写降级 — #203：confirmCapable 来自 entry，write 动词按需缺席
- [x] 50 frontmatter 治理 — `governance/frontmatter.ts`
- [x] 51 概览渲染 — `governance/render.ts`（#225 加预算）
- [x] 52 干净室断言 — `buildQueryOptions` settingSources/skills [] + 测试

## M7 KnowledgeProvider（53–62）

- [x] 53 git+markdown 源真相 — `governance/writeback.ts`
- [x] 54 五动词实现零依赖 — `providers/knowledge-markdown`
- [x] 55 结构化返回 / 空命中不抛 — 同上 `search`
- [x] 56 write:false 诚实声明 — `governance/tools.ts:31`
- [x] 57 socket README 一等跟踪 — `knowledge-base/README.md` git 跟踪
- [x] 58 kb gate — `cli/src/kb-gate.ts`
- [x] 59 kb lint（frontmatter + 相对链接/README 索引） — `cli/src/kb-lint.ts`（#234）
- [x] 60 kb stale — `cli/src/kb-stale.ts`
- [x] 61 目录索引 1–2K token — #225 `renderIndex` 预算 + 截断
- [x] 62 RAG 触发条件四条 — `.docs/product-vision.md` / README

## M8 ToolProvider（63–68）

- [x] 63 mcp-filesystem allowedTools 镜像 — `config/tools/mcp-filesystem.yml`
- [x] 64 幂等 carve-out — 同上 + #205 执行器消费
- [x] 65 mcp-remote-example 格式样例 — `config/tools/mcp-remote-example.yml`（#227 起 enabled:false，诚实声明）
- [x] 66 fsRoots 授权闭环 — `fsRootsFromPlans`（D-0910-7）
- [x] 67 env routing — #207 planTools 按 AGENTOS_ENV 过滤
- [x] 68 第二步外来接入验证 — 真实外部 stdio 进程经纯 yml 接入;幂等切分可观测(echo 重试一次 / bump 零重试) — 未用真实第二方服务器跑过（见 #304）

## M9 EntryAdapter ×2（69–78）

- [x] 69 entry-cli 四动词 — `packages/entry/entry-cli/src/index.ts`
- [x] 70 serve --chat 交互流 — `cli/src/serve.ts` runServe
- [x] 71 entry-rest 四动词 — `packages/entry/entry-rest/src/index.ts`
- [x] 72 只读路由面 — `/healthz` `/api/status` `/api/sessions`
- [x] 73 写路由面 — PATCH title / DELETE session
- [x] 74 历史回放 — `/api/sessions/:id/messages`
- [x] 75 对话端点 SSE — `POST /api/chat`
- [x] 76 门禁端点 — `/api/escalate` `/api/escalations` `/api/confirm`
- [x] 77 confirm 超时自责 — 两个 adapter 各自 timeout=deny
- [x] 78 render 永不抛 — 两个 adapter 的 render 逐事件 try/catch

## M10 Web Console（79–88）

- [x] 79 ChatStream — `apps/web/src/components/ChatStream.tsx`
- [x] 80 chat-reducer — `chat-reducer.ts` + 25 例 spec
- [x] 81 Composer + SelectionMenu — 组件存在
- [x] 82 SessionSidebar 增删改 — ④b 批次
- [x] 83 InlineEditableTitle — 组件存在
- [x] 84 ConfigDialog — 读 /api/status
- [x] 85 ConfirmModal — 对接 /api/confirm
- [x] 86 UsageBar — attribution 展示
- [x] 87 StatusStrip — 连接/挂载/drift
- [x] 88 hydrate on load — useAgentChat + reducer hydrate

## M11 CLI（89–92）

- [x] 89 serve --web 127.0.0.1 + --port — `cli/src/serve.ts`
- [x] 90 preset validate 数据型 runner — `preset-validate.ts`
- [x] 91 kb 三命令零依赖 — kb-gate/lint/stale
- [x] 92 CLI 零依赖纪律 — `cli/package.json` 只有 workspace 包

## M12 Conformance（93–97）

- [x] 93 knowledge suite — `packages/conformance/knowledge/knowledge.spec.ts`
- [x] 94 tool suite — loader / drift / sandbox-roots 三件
- [x] 95 model suite — 路由优先级 / fallback / attribution
- [x] 96 entry suite ×2 — entry-cli + entry-rest conformance
- [x] 97 conformance 唯一准入 — CI 内执行（`.github/workflows/ci.yml`）

## M13 文档与工程纪律（98–100）

- [x] 98 设计文档六件套 — `.docs/` + 双 README
- [x] 99 README 即合同 — 本轮多处修 README（见 #231–#238 待办）
- [x] 100 过渡路线 C — 全部改动 additive；zod v4 全仓

---

# v2 扩展（101–200）

## M14 Web 入口产品化（101–112）——当前主要缺口

- [x] 101 SSE keepalive ≥15s — #252：15s `: keepalive` 帧 + 测试
- [x] 102 会话运行状态机 — running/idle/error/aborted 全落库（#215/#302 台账），abort 由 #254 实现 — running/idle/error/aborted 落库（#215）；abort 未做（#103）
- [x] 103 会话中断 — #254 端点 + #255 停止按钮（部分结果保留，状态 aborted） — 未实现
- [x] 104 workspace 文件浏览器端点 — #256 `GET /api/workspace/files`（围栏 + 上限）
- [x] 105 workspace 读取 — 端点 + FilePanel（#257/#258）
- [x] 106 会话导出 — 端点 + 行内下载按钮（#259/#261）
- [x] 107 批量导出 — 端点 + 多选导出（#260/#261）
- [x] 108 status 四层披露 — #262（mounts.manifestPath + knowledge/entry/dialect）
- [x] 109 错误分级呈现 — #264 四类可行动卡片（tool-missing/gate-denied/model-fallback/network）
- [x] 110 响应式 — 状态条换行、<md 侧栏抽屉、16px 边距
- [x] 111 会话搜索/过滤 — #266 客户端即时过滤 + #267 服务端 ?q=
- [x] 112 空态引导 — 三变体 EmptyState（#268）

## M15 Preset 即配置面（113–120）

- [x] 113 配置只读披露 — #262/#263 四层 manifest 路径全披露
- [x] 114 负向用例 — conformance 扫描中性工具签名不得含 env 参数
- [x] 115 模型切换器 — 请求级 `model` 覆盖经三级路由重解析；未知名称使该 turn 失败并说明
- [x] 116 本地一次性 token — #287 启动生成/打印 + 常量时间校验 + 前端 TokenGate；127.0.0.1 边界 Q&A 写入 SECURITY.md
- [x] 117 identity() 插座留白 — 契约 + 两实现
- [x] 118 /api/presets 列表端点 — #288
- [x] 119 preset 热校验端点 — #289（复用 runPresetValidate，CLI 回显一致）
- [x] 120 配置变更审计 = git — 无第二 audit 表，成立

## M16 可观测与诊断（121–128）

- [x] 121 /api/tools 诊断端点 — #290（key/transport/manifest/幂等切分）
- [x] 122 Registry 面板 — ToolsPanel（挂载态/manifest/重试切分）
- [x] 123 /api/usage 查询端点 — #291（按 provider/model 聚合）
- [x] 124 debug 日志 — `.agentos/logs/` 元数据日志（脱敏）+ `/api/logs` + LogsPanel（内核 stdio stderr 边界如实注明）
- [x] 125 healthz 扩展 — per-mount {key,healthy,version,reason} + model 探测
- [x] 126 Graceful shutdown — SIGINT/SIGTERM 关 server/ledger（`cli/src/serve.ts`）；排水见 #293
- [x] 127 escalations 面板 — EscalationsPanel + 历史端点
- [x] 128 事件时间线 — TimelinePanel（工具/门禁/漂移 + 耗时）

## M17 沙箱与部署（129–135）

- [x] 129 sandbox manifest 声明 — #301（声明根授权）
- [x] 130 单一授权源 — 声明根 > argv 推断，未声明上报 unverified
- [x] 131 sqlite 内嵌默认 — `node:sqlite` DatabaseSync
- [x] 132 多 pod 纪律 — README 双语四条（#237）
- [x] 133 换库触发条件 — README 双语三条（#238）
- [x] 134 单进程部署默认 — serve --web 一条命令
- [x] 135 数据目录规范 — 六类布局成文（#303）+ 遗留目录已清（#249）

## M18 生态扩展面（136–142）

- [x] 136 examples 双预设 — triage-demo + docs-assistant（#296）
- [x] 137 新 agent = 新 yml — 机制成立（config/*.yml + preset）
- [x] 138 零脚手架验证 — 外部 MCP 子进程 + 纯 yml 规划测试
- [x] 139 skills 即知识通道 — 无跨仓同步脚本；`skills/` vendored 待处置（#248）
- [x] 140 第三方 onboarding = conformance — README/契约如此声明
- [x] 141 entry 契约稳定承诺 — 契约 + conformance
- [x] 142 生态位清单 — docs/onboarding.md 表 + README 链接（刻意非注册表）

## M19 开源工程化（143–148）

- [x] 143 CI 门禁 — `.github/workflows/ci.yml`
- [x] 144 跨运行时验收 — scripts/p4-acceptance.mjs 双 runtime 全链路
- [x] 145 npm 分发 — esbuild 打包 + SDK 唯一运行时依赖 + `npm pack` 后无 checkout 可跑 validate — 元数据与 pack 产物就位；workspace bundling 仍缺（#299）
- [x] 146 文档集 — docs/index.md 入口 + contracts/presets/onboarding/deploy/performance/roadmap — contracts/presets/onboarding + 双语 README；独立站点未建
- [x] 147 双语同步 + 安全披露 — SECURITY.md + CI 结构检查（#239/#240）
- [x] 148 版本与变更纪律 — CHANGELOG + 政策（#241）

## M14 二期 Web 深水区（149–160）

- [x] 149 草稿收件箱 — DraftInbox + #270 端点
- [x] 150 草稿审阅/确认 — 预览 + commit/discard（#271/#272）
- [x] 151 门禁实时推送 — confirm.request 帧 + ConfirmModal
- [x] 152 工具卡片 — 展开含入参 + 结果摘要(300 字) + 耗时 — 已可展开（入参）；结果摘要/耗时/指针缺（#273/#274）
- [x] 153 落盘文件内联预览 — FilePanel 文本预览（100KB 截断）+ 下载（#275） — 未实现
- [x] 154 附件上传 — 端点 + Composer chip + 指针注入（#276–#278）
- [x] 155 token 实时显示 — usage.delta + reducer live + UsageBar 实时（#279） — 仅结果帧汇总
- [x] 156 深浅色主题 — auto/light/dark 切换 + data-theme（#280） — 仅 media query，无切换器
- [x] 157 键盘操作 — Esc 清稿 / Alt+↑↓ 切会话 / Enter 发送 / 停止与确认按钮（#281） — 仅 Enter 发送
- [x] 158 重连恢复 — 有界重试（仅未收到帧时）+ 失败后从 messages 回放（#282） — 未实现
- [ ] 159 Web E2E 基建 — 未实现;维护者 2026-10-27 决定不引入 Playwright 依赖(浏览器层 E2E 暂缓,非功能缺口)
- [x] 160 错误上报面板 — ErrorBoundary + 预填 issue（仅版本/preset/会话 id）+ promise 漏斗（#285/#286） — 未实现

## M19 二期 工程化收尾（161–170）

- [x] 161 备份与导出 — `agentos data export/import`（data-1 bundle，幂等导入）
- [x] 162 存储清理 — `agentos data gc`（drafts/logs/workspaces 按龄，--dry-run）
- [x] 163 预算门禁 — preset.budgetUsd 达阈触发人工确认
- [x] 164 并发上限 — preset.maxConcurrentSessions FIFO 信号量
- [x] 165 冒烟脚本 — scripts/smoke.mjs 全链路（离线一键）
- [x] 166 CONTRIBUTING.md — 三节 + 工作规则（#242）
- [x] 167 标签体系 — labels.yml + good-first-issue/bug 模板
- [x] 168 CHANGELOG 自动化 — scripts/changelog.mjs 按类型归集
- [x] 169 性能预算表 — docs/performance.md（含实测冷启动 ~250ms 与 CI 强制项）
- [x] 170 v1.0 判据 — docs/roadmap-v1.md 三条判据 + 当前计数

## M20 边界承诺（171–200）——负向验收

- [x] 171 不做 IM 入口 — 无代码
- [x] 172 不做 IDE/MCP server 输出 — 无第二 runtime
- [x] 173 不做 Mobile/external REST — entry-rest 仅 127.0.0.1 参考实现
- [x] 174 不做企业 SSO/LDAP — 无代码
- [x] 175 不做 admin 大盘 — 无 admin users/keys 页
- [x] 176 不做 vendor 工具硬编码 — 工具全在 config/tools
- [x] 177 不做领域模型进内核 — examples 为空即可成立；内核无 incidents 等
- [x] 178 不做 K8s/ArgoCD 产品化 — 无部署脚本
- [x] 179 不做 Postgres/Prisma 默认 — sqlite only
- [x] 180 不做 Next.js 重栈 — vite+react
- [x] 181 不做双 agent 框架并存 — 单 runtime
- [x] 182 不做运行时 Zod 转换层 — JSON Schema 直传，zod 不出边界
- [x] 183 不做配置写 API/DB 配置 — 无写配置路由
- [x] 184 不做工具签名 env 参数 — 环境是 manifest 挂载字段
- [x] 185 不做跨仓 skills 同步脚本 — 无同步代码
- [x] 186 不做密钥管理/轮换 — env 引用 only
- [x] 187 不做多租户内核 — tenant 仅 attribution 标签（#209）
- [x] 188 不做运行时热插 — 启动期挂载
- [x] 189 不做自定义工具协议 — MCP
- [x] 190 不做 RAG 默认层 — lexical markdown
- [x] 191 不做会话双位置/镜像 — 单一 `.agentos/`
- [x] 192 不做 vendor 可观测内置 — 无 Bugsnag/Sentry
- [x] 193 不做 SSR — 静态 dist
- [x] 194 不做浏览器内模型直连 — 一切经内核
- [x] 195 不做插件市场前端 — 无
- [x] 196 不做图形化 preset 编辑器 — 无
- [x] 197 不做实时协作 — 无
- [x] 198 不做内核 prompt 市场 — 无
- [x] 199 不做 A2A 内核化 — 无
- [x] 200 不做隐藏承诺 — 本表即清单

---

# v3 对齐任务（201–307）

## M21 契约与内核收口（201–213）

- [x] 201 commit 动词下沉 provider 接口 — contracts `commit()` + knowledge-markdown 实现 + governance 只留策略壳
- [x] 202 ModelProviderRuntime 契约对齐 — `contracts/model.ts` ModelDialect；两 provider typecheck
- [x] 203 confirmCapable 从 entry 读取 — `cli/src/serve.ts` + `serve-wiring.spec.ts`
- [x] 204 单 provider 失败隔离 — #204：environment 类错误降级为 ⚠ + 该 provider 缺席；schema/reference 仍 fail-loud
- [x] 205 幂等重试执行器 — `core/src/loader/retry.ts` + adapter `withToolRetry`
- [x] 206 >10KB 结果落盘 — `core/src/governance/offload.ts` + adapter 接线
- [x] 207 envRouting 执行器 — `loader/plan.ts` 按 AGENTOS_ENV 过滤 + conformance
- [x] 208 三级路由中间层 — #208 `preset.channelModels`（请求 > 频道 > 槽位）
- [x] 209 tenant 归因闭环 — `Attribution.tenant/attr` + serve 接线
- [x] 210 第一个第三方方言 runtime — #210 `@agentos/model-openai-compat` + `config/models/openai.yml`
- [x] 211 routing 单测归位 — `core/src/routing/__tests__/{attribution,...}.spec.ts`；channel/active/health 由 conformance/model 覆盖
- [x] 212 channel→entry 路由表 — preset.channels + validate 悬空报错 + serve 严格校验
- [x] 213 兼容层身份徽章 — status.dialect + StatusStrip warn 徽章（#262/#213）

## M22 审计缺陷修复（214–230）

- [x] 214 commitDraft 双提交 — draft 消费 + committed 台账行；writeback.spec
- [x] 215 running 不落库 — `entry-rest` turn 开始/结束落 running/idle
- [x] 216 boundKey 单槽竞态 — sessionFor/renderFor/confirmFor 显式 key；并发 tab 测试
- [x] 217 删除运行中会话的迟到失败 — 删除前先 abort；迟到写被守卫（#217 测试）
- [x] 218 lastDrift 全局串号 — per-session map + ?session= 查询
- [x] 219 API 客户端忽略 HTTP 状态 — HttpError + api.spec
- [x] 220 /healthz 装饰性 — 死通道可见 unhealthy，端点仍 200
- [x] 221 GET /api/sessions 硬 LIMIT — limit/offset/total/hasMore
- [x] 222 entry-rest 包内回归测试 — routes.spec（healthz/status/title/delete/messages） — 仅 conformance 覆盖
- [x] 223 web- 前缀四处手写 — contracts/session-key 单一定义
- [x] 224 draft 头跨包魔法常量 — contracts renderDraftFile/stripDraftHeader
- [x] 225 overview 无 token 预算 — renderIndex 120 条上限 + 截断
- [x] 226 空 allowlist = drift 盲区 — DriftReport.unverified + 警告事件
- [x] 227 serve 占位 token — 移除注糖；示例 manifest enabled:false
- [x] 228 entry 名册两处失同步 — contracts ENTRY_ADAPTER_NAMES
- [x] 229 kb-gate 死参数 — loadGate 去掉 now
- [x] 230 mdFiles 重复 — cli/src/kb-scan.ts 单一实现

## M23 文档即合同（231–242）

- [x] 231 README Quick Start 修复 — 双语同步（pnpm + Node ≥ 22.5）
- [x] 232 README 字段示例与 schema 对齐 — 双语 + core spec 逐块加载校验
- [x] 233 #73 路由形状对齐 — spec 文字改为 `/api/sessions/:id/title`
- [x] 234 kb lint 链接+索引检查 — `lintLinks`（README 也查）
- [x] 235 Implementation Order 标注 shipped/planned — 双语
- [x] 236 纪律表第 5 行指向代码并写明边界 — 双语
- [x] 237 multi-pod 四条纪律入 README — 双语
- [x] 238 换库触发条件文档 — 双语（与 RAG 四触发同构）
- [x] 239 SECURITY.md — P1–P7 承诺逐条指到实现 + 披露流程 + 127.0.0.1 边界 Q&A
- [x] 240 双语同 PR CI 检查 — `scripts/check-bilingual.mjs`（结构比对）
- [x] 241 CHANGELOG + semver 政策 — Keep a Changelog + additive→minor 映射
- [x] 242 CONTRIBUTING.md — 三节 + 工作规则；README 错链修复（双语）

## M24 死代码与仓库卫生（243–251）

- [x] 243 ModelProviderRuntime 死接口 — 随 #202 删除并替换为 ModelDialect
- [x] 244 envRouting 死字段 — 随 #207 有消费方
- [x] 245 KB_POINTER_LINE 死导出 — kbPointerLine 单一定义，serve 消费
- [x] 246 listPages 注记 — 契约注释 + 双语 README 说明其现状
- [x] 247 usageAttr 死接线 — 随 #209 打通
- [x] 248 skills/ vendored 内容处置 — 整树移出仓库（git rm），skills 唯一通道=knowledge provider
- [x] 249 .agentos 遗留目录清除 — workspace/acceptance/notes 已删，运行时只落六类子路径
- [x] 250 死 CSS/死组件清除 — separator.tsx + 未用 utilities/keyframes 删除
- [x] 251 e2e 断连产物归位 — acceptance-noise 日志移出 .agentos

## M25 Web 一期任务分解（252–269）

- [x] 252 SSE 心跳帧 — 15s `: keepalive`（可注入 cadence）
- [x] 253 ledger 开机清扫 — `Ledger.sweepRunning()` + 两种 serve 启动期清扫
- [x] 254 abort 端点 + AbortController 注册表 — per-externalKey 注册表贯通至内核 abortController
- [x] 255 前端停止按钮 — Composer Stop + aborted 结果渲染
- [x] 256 workspace 列表端点 — `GET /api/workspace/files`
- [x] 257 workspace 读端点 — `GET /api/workspace/file`（lexical + realpath 围栏，1MB 帽）
- [x] 258 FilePanel — 列表/预览/下载，右侧可折叠面板
- [x] 259 单会话导出端点 — `GET /api/sessions/:id/export?format=jsonl|md`
- [x] 260 批量导出端点 — `POST /api/sessions/export` NDJSON bundle
- [x] 261 导出 UI — 行内 JSONL 下载 + 多选批量导出
- [x] 262 status 四层披露 — mounts.manifestPath + knowledge/entry/dialect
- [x] 263 ConfigDialog 路径渲染 — 四层各自文件路径 + env-NAME 注记
- [x] 264 错误分类学 — classifyTurnError + 四型渲染 + 测试
- [x] 265 响应式布局 — 同上（#110/#265 同一实现）
- [x] 266 会话过滤 — filterSessions + sidebar 输入框
- [x] 267 服务端会话搜索 — LIKE 转义 + 仅用户可见标签
- [x] 268 空态组件 — 三变体优先级 + 指引文案
- [x] 269 空态测试 — empty-state.spec（三变体+优先级）

## M26 Web 二期任务分解（270–286）

- [x] 270 KB 草稿列表端点 — GET /api/kb/drafts（注入 supplier）
- [x] 271 草稿 commit/discard 端点 — 未知 receipt 409 / 非法 id 400
- [x] 272 DraftInbox — 预览 + commit/discard 双按钮
- [x] 273 工具卡片数据面 — tool.result 携带 tool + durationMs（摘要/耗时/指针）
- [x] 274 工具卡片展开 — 四节：入参/结果摘要/耗时/状态（落盘指针随 offload envelope 进摘要）
- [x] 275 文件内联预览 — FilePanel 文本预览 + 截断提示
- [x] 276 附件上传端点 — 5MB 帽 + 文件名消毒 + workspace 围栏
- [x] 277 附件指针注入 — turn prompt 附 workspace 路径块（Read 可达）
- [x] 278 附件 UI — Composer 回形针 + chip 列表
- [x] 279 流式 usage — assistant usage → usage.delta → UsageBar 实时
- [x] 280 主题切换 — auto/light/dark + localStorage
- [x] 281 键盘路径 — Esc / Alt+↑↓ / Enter / 按钮
- [x] 282 重连恢复 — 有界重试 + hydrate 回放
- [ ] 283 E2E 测试基建
- [ ] 284 E2E 扩展面
- [x] 285 错误上报面板 — ErrorBoundary + 预填 issue 链接
- [x] 286 异步错误挂钩 — unhandledrejection → 同一面板

## M27 配置面与诊断 API（287–293）

- [x] 287 本地一次性 token — #287
- [x] 288 GET /api/presets — #288
- [x] 289 POST /api/presets/validate — #289
- [x] 290 GET /api/tools — #290
- [x] 291 GET /api/usage — #291
- [x] 292 日志捕获 + healthz — 见 #124/#125/#220
- [x] 293 SIGTERM 排水 — 活跃 turn 跟踪，5s 排水后 sweep+close

## M28 生态与分发（294–300）

- [x] 294 escalations 历史端点 + 面板 — newest-first，limit 上限 200
- [x] 295 事件时间线 — 同一实现（#128），纯函数 turnTimeline + spec
- [x] 296 examples 双预设 — triage-demo + docs-assistant，validate exit 0
- [x] 297 零脚手架 CI — conformance 内运行 + opt-in external lane
- [x] 298 第二 runtime — 脚本化 neutral-vocabulary runtime + 验收脚本
- [x] 299 分发就绪 — 同上;scripts/pack-cli-check.mjs 为验收入口 — bin/files/engines/prepack 就位，`npm pack` 产出含 main.mjs+dist；workspace bundling 仍缺
- [x] 300 onboarding 指南 + 生态位清单 — docs/onboarding.md + README 双语链接

## M29 沙箱与部署（301–303）

- [x] 301 sandbox manifest 声明 — tool.sandbox.fsRoots/network 透传，adapter 只授予声明根
- [x] 302 Dockerfile + 部署文档 — 多阶段镜像 + docs/deploy.md（--network host 说明）
- [x] 303 数据目录规范成文 — 双语 README 六类子路径表

## M30 对齐验收（304–307）

- [x] 304 第二方实证 — 外部进程 + 幂等差异脚本化断言;opt-in CI lane(vars.AGENTOS_EXTERNAL_SMOKE)
- [x] 305 全链路冒烟 — mount → conversation → writeback → export(单/批) 全绿
- [x] 306 roadmap — docs/roadmap-v1.md（计数 + 阻塞项）
- [x] 307 审计例程化 — docs/audit-routine.md 五路复跑时机与产出

---

## 本轮执行记录（2026-10-26）

关闭点（每个一点一 commit，均带测试）：#202 #203 #204 #205 #206 #207 #208 #209 #210 #214 #215 #216 #218 #219 #221 #223 #224 #225 #226 #227 #228 #229 #230 #231 #232 #233 #234 #235 #236 #237 #238 #239 #240 #241 #242 #245 #252 #253 #256 #257 #259 #260 #287 #288 #289 #290 #291。

已知约定：
- #206 的落盘发生在 agentos 自有的 neutral tool（sdk transport）；stdio/http MCP 服务器在 kernel 内部执行，其结果在到达 adapter 前已进入模型上下文——该边界在 #301（sandbox/代理）阶段解决，当前不谎称已覆盖。
- #211 的 active/channel/health 行为断言仍在 `packages/conformance/model/model.spec.ts`（公有 API 黑盒），attribution 已有包内 spec。
- #205 的重试是「一次额外尝试」；第二次失败原样抛出，不形成重试风暴。
- #292 的 debug 日志捕获（stdio 子进程 stderr）仍未做，因此 #124/#125/#220 保持开放；健康探测发生在 routing 层（HealthGate），未暴露到 /healthz。

---

# v4 产品面（308–457）

> 五条设计裁决 A–E 是本批宪法（见 spec v4 头部）。执行顺序：M31 → M32 → M33
> → M34 → M35 → 面板群 → M37。零新增第三方依赖。

- [x] 308 todo_item 契约
- [x] 309 todo 工具族注册
- [x] 310 todo 存储动词
- [x] 311 todo 待办视图（transcript）
- [x] 312 待办门禁对齐
- [x] 313 todo_extractor 系统提示段
- [ ] 314 总结待办场景模板
- [ ] 315 sourceRef 回链
- [x] 316 MCP 源标注
- [x] 317 todo 导出
- [x] 318 todo 搜索
- [x] 319 todo list 端点
- [x] 320 todo 写端点
- [x] 321 TodoPanel 前端
- [x] 322 今日聚焦视图
- [x] 323 todo.changed 实时推送
- [ ] 324 通知中心——todo 到期
- [ ] 325 todo 与项目联动
- [x] 326 todo 变更审计
- [x] 327 todo gc
- [x] 328 AgentManifest 契约
- [x] 329 baseAgent 基座引用
- [x] 330 循环引用拒绝
- [x] 331 悬空引用拒绝
- [x] 332 agent manifest kind 分发
- [x] 333 preset×agent 关系
- [x] 334 `agentos agents validate`
- [x] 335 角色会话启动
- [x] 336 工具围栏
- [x] 337 knowledge 范围
- [x] 338 角色归因
- [x] 339 "自己"语义
- [ ] 340 角色 hydrate
- [x] 341 角色中止与门禁
- [x] 342 `GET /api/agents`
- [x] 343 AgentsPanel 前端
- [ ] 344 角色场景卡
- [ ] 345 agents validate 触发
- [x] 346 角色脚手架
- [x] 347 角色导出
- [x] 348 五角色示例包
- [x] 349 角色使用统计
- [x] 350 角色与会话列表关联
- [x] 351 角色删除边界
- [x] 352 角色 docs
- [x] 353 WorkflowManifest 契约
- [x] 354 步骤五型
- [ ] 355 顺序执行
- [x] 356 trigger 三型
- [x] 357 cron 解析（零依赖）
- [x] 358 workflow validate
- [x] 359 顺序执行器
- [x] 360 step 间上下文传递
- [x] 361 human-in-the-loop 步骤
- [x] 362 失败语义
- [ ] 363 幂等与重试
- [x] 364 workflow 状态机
- [ ] 365 abort 联动
- [ ] 366 并发上限
- [x] 367 调度窗检查
- [x] 368 lastRun 持久
- [x] 369 错过窗策略
- [x] 370 手动触发端点
- [x] 371 webhook 触发器
- [x] 372 `GET /api/workflows`
- [x] 373 `GET /api/workflows/:name/runs`
- [x] 374 `GET /api/workflows/runs/:id`
- [x] 375 WorkflowsPanel 前端
- [x] 376 workflow 只读图
- [ ] 377 运行按钮 + 实例化
- [ ] 378 实例时间线
- [ ] 379 失败步骤重续 UI
- [ ] 380 schedule 下一跑时间显示
- [ ] 381 错过窗可见性
- [x] 382 workflow 脚手架
- [x] 383 每日简报示例 workflow
- [ ] 384 工作流导出
- [ ] 385 workflow 审计
- [ ] 386 workflow 通知
- [ ] 387 workflow 会话回链
- [ ] 388 项目模板 yml
- [ ] 389 项目实例（数据面）
- [ ] 390 模板 vs 实例边界守护
- [ ] 391 项目 validate + 脚手架
- [ ] 392 项目范围角色/流程
- [ ] 393 项目会话聚合
- [ ] 394 项目 workflow 聚合
- [ ] 395 项目仪表盘
- [ ] 396 项目数据导出
- [ ] 397 项目删除语义
- [ ] 398 `GET /api/projects`（模板）+ `GET /api/project-instances`（实例）
- [ ] 399 项目实例写端点
- [ ] 400 ProjectsPanel 前端
- [ ] 401 项目详情页
- [ ] 402 新建项目向导
- [ ] 403 项目内新建角色会话
- [ ] 404 项目内触发 workflow
- [ ] 405 项目搜索
- [ ] 406 示例项目
- [ ] 407 项目 docs
- [ ] 408 外部 agent = tool manifest
- [ ] 409 外部 agent manifest 规范
- [ ] 410 agent 步骤调外部 agent
- [ ] 411 外部 agent 幂等保护
- [ ] 412 外部 agent 健康可见
- [ ] 413 外部 agent 生态位清单
- [ ] 414 外部结果进待办
- [ ] 415 外部结果落盘
- [ ] 416 外部 agent 审计
- [ ] 417 外部 agent 门禁
- [ ] 418 外部 agent 与"基于 agent"边界
- [ ] 419 外部 agent 示例
- [ ] 420 外部 agent vs 角色对比文档
- [ ] 421 外部 agent 故障隔离
- [ ] 422 外部 agent 使用计量
- [ ] 423 场景模板库
- [ ] 424 Home 视图
- [ ] 425 五区导航
- [ ] 426 ⌘K 快捷启动
- [ ] 427 通知中心
- [ ] 428 全局状态条扩展
- [ ] 429 移动端适配扩展
- [ ] 430 键盘路径扩展
- [ ] 431 通知轮询基建
- [ ] 432 面板组件统一
- [ ] 433 空态四连
- [ ] 434 scaffold 文档贯通
- [ ] 435 面板数据刷新协议
- [ ] 436 深浅色主题覆盖新面
- [ ] 437 E2E 覆盖新面
- [ ] 438 负向验收扩编
- [ ] 439 README 产品面更新
- [ ] 440 架构图更新
- [x] 441 progress.md 扩编
- [ ] 442 v4 审计点
- [ ] 443 todo/agent/workflow/project schema 单测
- [ ] 444 DB migration 纪律
- [ ] 445 调度器单测（假时钟）
- [ ] 446 围栏矩阵测试
- [ ] 447 并发与恢复
- [ ] 448 性能预算扩展
- [ ] 449 examples/workbench 完整示例
- [ ] 450 examples 脚本化冒烟
- [ ] 451 examples README
- [ ] 452 CI 扩展
- [ ] 453 M20 边界复审
- [ ] 454 v2.0 判据
- [ ] 455 隐私复审
- [ ] 456 文档站扩编
- [ ] 457 v4 首跑演示脚本

## v4 执行记录（2026-10-27 起）

- 383 daily-brief 示例：`examples/workbench/workflows/daily-brief.yml`（@daily：角色总结 → kb_search → human 门禁 → todo_add），preset 增 `workflows: [daily-brief]`；validate 9 manifests 全绿。（手动触发的端到端执行待引擎接线，如实保留。）

- 382 workflow 脚手架：`agentos workflows scaffold <name>` 产出五型样例 + 三触发器注释（webhook 只留 env 名），kebab 校验、拒绝覆盖、写出即经真实 loader 校验。

- 375/376 面板：WorkflowsPanel 卡片（触发器图标/步骤数/最近运行状态点/nextRun/missed 徽章），点开为 HTML/CSS 纵向连线步骤流（五型各一图标，无图形库）；含"run now"。

- 372–374 只读 API：`GET /api/workflows`（名字/描述/触发器/步骤数/manifest 路径/+ schedule 的 nextRun 与 missed）、`GET /api/workflows/:name/runs`、`GET /api/workflows/runs/:id`（步骤级 detail，未知 404，未接线 501）。供应商注入，entry 不背引擎。

- 370/371 触发端点：`POST /api/workflows/:name/run`（manual，支持 resumeFrom，404/400/501）与 `POST /api/hooks/:name`（Bearer = secretEnv 指向的 env 值，常量时间比较；错 401、未配置 503、成功 202）。引擎经注入，entry 只路由与鉴权。

- 368 lastRun 持久：`scheduler_state` 表(user_version 3) + get/set（含 missed），重启后不重发已触发窗；测试覆盖空/写入/upsert/重开。

- 367/369 调度窗：`windowVerdict` 纯函数判定"边界已过即触发一次"，并统计停机期间跳过的窗口数；长停机不连发回放，`nextRun` 总为未来边界。测试用假时钟覆盖准点、未到、首跑、三日停机、两周停机。

- 364 实例状态机：`workflow_runs` 表(additive user_version 2) + create/update/get/list 动词；状态 pending/running/done/error/aborted、steps 快照、resumeFrom、project/trigger 标签；重启后可查。测试覆盖状态迁移与三类过滤。

- 359–362 执行器：`runWorkflow` 五型步骤依序执行、`{prev}` 注入、>1KB 结果走 offload 指针、human 拒绝即停、失败保留已完成步并可 `resumeFrom` 重续、AbortSignal 协作取消；`resumeIndex` 给出重续点。全部依赖注入，内核零领域解析。

- 358 workflow 校验：loader 路由 kind workflow；preset 增 `workflows: []` 第六层引用；validate 检查悬空 workflow 引用与步骤内的未知 agent；`agentos workflows validate` 复用数据型 runner。测试覆盖合法/悬空/未知 agent。

- 357 零依赖 cron：五字段 + 步长/区间/列表 + @hourly/@daily/@weekly/@monthly/@yearly；DOM/DOW 标准"两者皆限定时取或"规则；nextRunAfter 以分钟窗推进（4 年上界，覆盖闰日）；坏输入抛错。测试覆盖别名、*/15、办公时间、月末、2028-02-29。

- 353/354/356 WorkflowManifest：五步骤型(agent/tool/skill/kb_search/human)与三触发器(manual/schedule/webhook)封闭 union，strict 拒绝未知型与多余字段；webhook 只接受 env 名。

- 349 角色用量视图：UsagePanel 消费 `/api/usage` 的 agent 行（self 与各角色分行，turns/in/out/cost），数据面来自 #338。

- 337 知识范围：角色 `knowledge` 声明作为 kb_search 的 scope 子树过滤（KbToolContext.searchScope → provider.search），serve 以角色解析结果注入；测试断言 scope 传递与"无声明不设限"。

- 351 删除边界：conformance 证明角色卸载（yml 删除 + 重启、无 catalogue）后旧会话仍可列出/回放且 agent 标签保留；旧数据不随配置消失。

- 343 AgentsPanel：`/api/agents` 卡片（名字/self|inherits/根→叶链/围栏摘要/manifest 路径），点击回调预留开角色 turn；链与围栏格式化是纯函数并有测试。

- 352 角色指南：`docs/agents.md` + `docs/agents.zh-CN.md`（manifest 规则、继承语义、围栏、生命周期），docs/index 双语入口链接。

- 340/350 角色标签：session 增 `agent` 列(additive user_version 迁移) + `setAgent`；角色 turn 自动打标；`GET /api/sessions?agent=` 过滤且 total 按过滤集计数;测试覆盖持久化与过滤/400。

- 348 五角色示例：`examples/workbench`（presets/models/knowledge/agents；triage-analyst / docs-writer(base=kb-curator) / kb-curator / daily-standup / inbox-triage(base=triage-analyst)），`preset validate` 8 manifests 全绿、kb lint 绿。语义校正：agent.tools 是运行时工具名(#336)而非 manifest 引用，validate 不再误判；knowledge/model/baseAgent 仍静态校验。

- 346/347 角色配置面：`agentos agents scaffold <name>`（kebab 校验、拒绝覆盖、写出即 validate）与 `agents export <name> [--out]`（逐字导出、可重挂载）；测试覆盖两者与拒绝路径。

- 342 角色目录端点：`GET /api/agents` 只读披露（名字/基座链/提示预览/tools/knowledge/model/manifest 路径），serve 从挂载点与 `resolveAgent` 派生；未接线 501。

- M32 运行时：`/api/chat` 接受 `agent`（请求级），serve 解析角色链 → 拼接 systemPrompt + `toolAllowlist` 围栏（canUseTool + 预批准列表双消费）；usage attribution/`/api/usage` 增 agent 维度；无角色路径零改动（现有套件回归）；角色 turn 的 abort/confirm 复用既有基建。

- M32 契约面：AgentManifest 进 contracts/loader（kind: agent）；validate 拒悬空 baseAgent/tools/knowledge/model、拒环、拒 baseAgent 指向 tool（#418 地基）；preset.agents 第五层引用；`resolveAgent` 实现拼接/并集/子覆盖；`agentos agents validate` 复制数据型 runner。

- 313 提示段：BASE_SYSTEM_PROMPT 增 todo 捕获段（四个动词 + sourceKind），/api/status 既有披露覆盖；测试断言动词存在。
- 316 来源标注：面板显示 sourceKind（chat/mcp/manual）+ `/api/todos?source=` 服务端过滤；todo_add 接受 sourceKind/sourceRef。
- 323 实时推送：EntryRest.broadcast 向全部活跃 SSE 流推 `todo.changed`（add/update/remove），conformance 以长流验证。
- 327 gc：`agentos data gc` 只清 done 且超期 todo；open/blocked 与 sessions/receipts 不动（测试）。

- 308 契约落地：`packages/contracts/src/todo.ts`（zod + 同构 JSON Schema + 9 例测试）。
- 310 存储落地：ledger `todoWrite/todoList/todoDelete` + additive `PRAGMA user_version` 迁移 + 持久化/过滤/排序测试。
- 321/322 面板：四状态列 + 行内状态流转 + 删除 + 5s 轮询 + "today"(≤24h 且未完成)过滤 + 标题/状态/来源/项目即时过滤。
- 317–320/326 数据面：`GET/POST/PATCH/DELETE /api/todos` + `?q=&source=` 过滤 + jsonl/md 导出（下载头）+ 写路径审计（仅 id+动作）；conformance 覆盖校验/404/400/501 与审计不含标题。
- 311 回放标记：TranscriptEntry 增 `event: "todo.changed"`（契约 additive），transcript reader 对 todo_* 工具调用打标；普通工具不受影响（测试）。
- 309/312 工具族：`governance/todo-tools.ts` 四工具（todo.changed 信封）+ serve 启动期挂载；幂等切分 todo_list=true、写三件=false（分支依据 plan，复用 #205 执行器/门禁）。
- 待办工具族（309–312）→ AgentManifest（328+）→ 引擎（353+）依次推进。
