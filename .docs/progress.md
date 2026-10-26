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

- [~] 25 三级路由 — 请求级 + preset 槽位已成立；频道/租户中间层见 #208（未做）
- [~] 26 fallback chain — alias 级已实现 `routing/health.ts:65-74`；跨 endpoint 未实现（契约化前不做）
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
- [~] 41 会话主权 — 一会话一内核已成立；channel→(kernel,preset) 路由表见 #212（未做）

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
- [ ] 68 第二步外来接入验证 — 未用真实第二方服务器跑过（见 #304）

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
- [~] 105 workspace 文件读取端点 — #257 端点已落地（双层围栏+1MB 帽）；前端 file panel 见 #258
- [~] 106 会话转录导出 — #259 端点已落地（jsonl/md 下载）；UI 见 #261
- [~] 107 批量会话导出 — #260 端点已落地（NDJSON bundle）；UI 见 #261
- [ ] 108 /api/status 扩展 provider/manifest 路径 — 部分（mounts 只有 key/transport）
- [x] 109 错误分级呈现 — #264 四类可行动卡片（tool-missing/gate-denied/model-fallback/network）
- [ ] 110 移动端响应式 — 未系统验证
- [x] 111 会话搜索/过滤 — #266 客户端即时过滤 + #267 服务端 ?q=
- [ ] 112 空态与首次运行引导 — 仅 sidebar 一句文案

## M15 Preset 即配置面（113–120）

- [x] 113 配置只读披露 — #262/#263 四层 manifest 路径全披露
- [ ] 114 env 参数负向用例 — 负向 conformance 未加
- [ ] 115 模型切换器（只读+请求级） — 未实现
- [x] 116 本地一次性 token — #287 启动生成/打印 + 常量时间校验 + 前端 TokenGate；127.0.0.1 边界 Q&A 写入 SECURITY.md
- [x] 117 identity() 插座留白 — 契约 + 两实现
- [x] 118 /api/presets 列表端点 — #288
- [x] 119 preset 热校验端点 — #289（复用 runPresetValidate，CLI 回显一致）
- [x] 120 配置变更审计 = git — 无第二 audit 表，成立

## M16 可观测与诊断（121–128）

- [x] 121 /api/tools 诊断端点 — #290（key/transport/manifest/幂等切分）
- [ ] 122 Registry 面板 — 未实现
- [x] 123 /api/usage 查询端点 — #291（按 provider/model 聚合）
- [ ] 124 debug 日志捕获 — 未实现
- [~] 125 healthz 扩展 — 恒 {ok:true}（#220）
- [x] 126 Graceful shutdown — SIGINT/SIGTERM 关 server/ledger（`cli/src/serve.ts`）；排水见 #293
- [ ] 127 escalations 面板 — 未实现（只有计数）
- [ ] 128 会话内事件时间线 — 未实现

## M17 沙箱与部署（129–135）

- [~] 129 sandbox manifest 声明 — 未实现（fsRoots 由 args 推断，见 #301）
- [~] 130 fs roots 单一授权源 — adapter 从 plans 推导；manifest 声明缺（#301）
- [x] 131 sqlite 内嵌默认 — `node:sqlite` DatabaseSync
- [~] 132 多 pod 纪律条款 — README 未写（#237）
- [~] 133 换库触发条件文档 — 未写（#238）
- [x] 134 单进程部署默认 — serve --web 一条命令
- [~] 135 数据目录规范 — `.agentos/` 六类约定存在；遗留 `workspace/` 目录待清（#249）

## M18 生态扩展面（136–142）

- [ ] 136 examples/ 双示例 preset — 未落地
- [x] 137 新 agent = 新 yml — 机制成立（config/*.yml + preset）
- [ ] 138 零脚手架验证测试 — 未实现
- [x] 139 skills 即知识通道 — 无跨仓同步脚本；`skills/` vendored 待处置（#248）
- [x] 140 第三方 onboarding = conformance — README/契约如此声明
- [x] 141 entry 契约稳定承诺 — 契约 + conformance
- [ ] 142 provider 生态位清单 — README 未维护

## M19 开源工程化（143–148）

- [x] 143 CI 门禁 — `.github/workflows/ci.yml`
- [ ] 144 跨运行时验收演示 — 未实现
- [ ] 145 npm 安装分发 — 未实现
- [ ] 146 文档站 — 未实现
- [~] 147 双语同步 + 安全披露 — SECURITY.md 未写（#239）
- [~] 148 版本与变更纪律 — CHANGELOG 未建（#241）

## M14 二期 Web 深水区（149–160）

- [ ] 149 KB 草稿收件箱 — 未实现
- [ ] 150 草稿审阅/确认 — 未实现
- [~] 151 门禁实时推送 — SSE 帧已推（confirm.request），无轮询需求；状态成立
- [~] 152 工具卡片可展开 — 已可展开（入参）；结果摘要/耗时/指针缺（#273/#274）
- [ ] 153 落盘文件内联预览 — 未实现
- [ ] 154 附件上传 — 未实现
- [ ] 155 token 实时显示 — 仅结果帧汇总
- [ ] 156 深浅色主题 — 仅 media query，无切换器
- [ ] 157 键盘操作 — 仅 Enter 发送
- [ ] 158 重连恢复 — 未实现
- [ ] 159 Web E2E 基建 — 未实现
- [ ] 160 错误上报面板 — 未实现

## M19 二期 工程化收尾（161–170）

- [ ] 161 备份与导出工具 — 未实现
- [ ] 162 存储清理命令 — 未实现
- [ ] 163 预算门禁 — 未实现
- [ ] 164 并发会话上限 — 未实现
- [~] 165 冒烟脚本 — `scripts/p2-smoke.mjs` 存在；写回/导出段缺（#305）
- [ ] 166 CONTRIBUTING.md — 未实现（#242）
- [ ] 167 good first issue 标签 — 未实现
- [ ] 168 CHANGELOG 自动化 — 未实现
- [ ] 169 性能预算表 — 未实现
- [ ] 170 v1.0 判据 — 未写死（#306）

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

- [ ] 201 commit 动词下沉 provider 接口 — commitDraft 仍硬绑 git（`governance/writeback.ts`）
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
- [ ] 212 channel→(kernel,preset) 路由表 — 未做（模型侧三通道路由已由 #208 交付）
- [x] 213 兼容层身份徽章 — status.dialect + StatusStrip warn 徽章（#262/#213）

## M22 审计缺陷修复（214–230）

- [x] 214 commitDraft 双提交 — draft 消费 + committed 台账行；writeback.spec
- [x] 215 running 不落库 — `entry-rest` turn 开始/结束落 running/idle
- [x] 216 boundKey 单槽竞态 — sessionFor/renderFor/confirmFor 显式 key；并发 tab 测试
- [x] 217 删除运行中会话的迟到失败 — 删除前先 abort；迟到写被守卫（#217 测试）
- [x] 218 lastDrift 全局串号 — per-session map + ?session= 查询
- [x] 219 API 客户端忽略 HTTP 状态 — HttpError + api.spec
- [ ] 220 /healthz 装饰性 — 仍恒 {ok:true}（随 #292）
- [x] 221 GET /api/sessions 硬 LIMIT — limit/offset/total/hasMore
- [ ] 222 entry-rest 包内回归测试 — 仅 conformance 覆盖
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
- [ ] 246 listPages 消费方/conformance-only 注记
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
- [ ] 258 FilePanel 前端
- [x] 259 单会话导出端点 — `GET /api/sessions/:id/export?format=jsonl|md`
- [x] 260 批量导出端点 — `POST /api/sessions/export` NDJSON bundle
- [ ] 261 导出 UI
- [x] 262 status 四层披露 — mounts.manifestPath + knowledge/entry/dialect
- [x] 263 ConfigDialog 路径渲染 — 四层各自文件路径 + env-NAME 注记
- [x] 264 错误分类学 — classifyTurnError + 四型渲染 + 测试
- [ ] 265 响应式布局
- [x] 266 会话过滤 — filterSessions + sidebar 输入框
- [x] 267 服务端会话搜索 — LIKE 转义 + 仅用户可见标签
- [x] 268 空态组件 — 三变体优先级 + 指引文案
- [x] 269 空态测试 — empty-state.spec（三变体+优先级）

## M26 Web 二期任务分解（270–286）

- [ ] 270 KB 草稿列表端点
- [ ] 271 草稿 commit/discard 端点
- [ ] 272 DraftInbox 前端
- [ ] 273 工具卡片数据面（摘要/耗时/指针）
- [ ] 274 工具卡片展开补全
- [ ] 275 文件内联预览
- [ ] 276 附件上传端点
- [ ] 277 附件指针注入
- [ ] 278 附件 UI
- [ ] 279 流式 usage
- [ ] 280 主题切换
- [ ] 281 键盘路径
- [ ] 282 重连恢复
- [ ] 283 E2E 测试基建
- [ ] 284 E2E 扩展面
- [ ] 285 错误上报面板
- [ ] 286 异步错误挂钩

## M27 配置面与诊断 API（287–293）

- [x] 287 本地一次性 token — #287
- [x] 288 GET /api/presets — #288
- [x] 289 POST /api/presets/validate — #289
- [x] 290 GET /api/tools — #290
- [x] 291 GET /api/usage — #291
- [ ] 292 debug 日志捕获 + healthz 扩展
- [ ] 293 SIGTERM 排水（跟踪活跃 runner）

## M28 生态与分发（294–300）

- [ ] 294 escalations 历史端点 + 面板
- [ ] 295 事件时间线
- [x] 296 examples 双预设 — triage-demo + docs-assistant，validate exit 0
- [ ] 297 零脚手架 CI 测试
- [ ] 298 第二 runtime + 跨运行时验收
- [ ] 299 npm 分发就绪
- [ ] 300 onboarding 指南 + 生态位清单

## M29 沙箱与部署（301–303）

- [ ] 301 sandbox manifest 声明
- [x] 302 Dockerfile + 部署文档 — 多阶段镜像 + docs/deploy.md（--network host 说明）
- [x] 303 数据目录规范成文 — 双语 README 六类子路径表

## M30 对齐验收（304–307）

- [ ] 304 真实第二方接入实证
- [ ] 305 全链路冒烟（写回/导出段）
- [ ] 306 v1.0 roadmap 跟踪件
- [ ] 307 审计例程化

---

## 本轮执行记录（2026-10-26）

关闭点（每个一点一 commit，均带测试）：#202 #203 #204 #205 #206 #207 #208 #209 #210 #214 #215 #216 #218 #219 #221 #223 #224 #225 #226 #227 #228 #229 #230 #231 #232 #233 #234 #235 #236 #237 #238 #239 #240 #241 #242 #245 #252 #253 #256 #257 #259 #260 #287 #288 #289 #290 #291。

已知约定：
- #206 的落盘发生在 agentos 自有的 neutral tool（sdk transport）；stdio/http MCP 服务器在 kernel 内部执行，其结果在到达 adapter 前已进入模型上下文——该边界在 #301（sandbox/代理）阶段解决，当前不谎称已覆盖。
- #211 的 active/channel/health 行为断言仍在 `packages/conformance/model/model.spec.ts`（公有 API 黑盒），attribution 已有包内 spec。
- #205 的重试是「一次额外尝试」；第二次失败原样抛出，不形成重试风暴。
- #292 的 debug 日志捕获（stdio 子进程 stderr）仍未做，因此 #124/#125/#220 保持开放；健康探测发生在 routing 层（HealthGate），未暴露到 /healthz。
