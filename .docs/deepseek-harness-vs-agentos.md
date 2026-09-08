# DeepSeek Harness vs AgentOS：逐项对比

> 用途：为"反复对比后给出结论"提供原材料。左边是 AgentOS 当前定义（README + .docs，2026-09-07 版），右边是 deepseek-harness（下称 DSH）的**代码级事实**（证据路径基于 `.reference/deepseek-harness`，v0.1.3-alpha.1）。
> 生成：2026-09-07 · 基于仓库深读报告（255 包 / 50 group 全量分析）

---

## TL;DR — 三个核心结论

1. **两处事实错误需要立即修正**：DSH 不是闭源（MIT，255 包全公开），也不绑定 DeepSeek 生态（Claude Code / Codex / Exa / Perplexity / E2B 都是官方插件，"竞品互为插件"是它的设计哲学）。当前愿景文档的差异化论证建立在这两个错误判断上，**必须重建**。
2. **AgentOS 四元组（Manifest→Contract→Loader→Registry）在 DSH 里有几乎完整的一一对应实现**（dsh manifest 字段 → Cordis Service Definition → Cordis Loader → ctx 服务仓库）。如果差异化停留在"四元组"本身，DSH 用户 30 秒内会说"我们早就有了"。**真正的空白只有两个：KnowledgeProvider 作为一等契约（DSH 没有统一知识接缝）+ runtime-free 跨运行时可移植（DSH 契约只在 DSH 内有效）**。
3. **最锋利的战略选项没有被当前文档讨论**：与其和 DSH 平行竞争，不如**让 DSH 成为 AgentOS 的第一个 conformance runtime**——preset 编译到 DSH profile，借 165k star 的分发渠道。这与 README 的 Route C（契约优先、多运行时并存）完全兼容，且 KR2（"同一 preset ≥2 个运行时跑通"）的最佳候选运行时就是 DSH 本身。

---

## 1. DSH 是什么（60 秒版）

DeepSeek 开源的 agent harness，口号 **"Everything is a Plugin"**，MIT 协议，一周 165k star，developer preview 阶段。底层是源码级 vendor 的 **Cordis** 元框架（Koishi 生态出身，改名 `@deepseek-ai/cordis`）。核心主张：

- **没有特权内核**："There is no privileged core to patch"（`docs/architecture.md:11`）——agent loop、模型适配、工具注册、会话日志、system prompt 全部是可替换插件
- **规模**：`packages/` 50 个 group、255 个 npm 包；文档双语、大量生成式 catalog + CI 门禁
- **组合模型**：profile / bundle / patch 三层 YAML 层叠，按行替换，`--dump-config` 全透明

## 2. 概念对照总表

图例：🔴 DSH 已完整实现（重叠）· 🟡 DSH 部分实现（需说清增量）· 🟢 DSH 缺失（真差异化）

| AgentOS 概念 | DSH 对应物 | 判定 | 证据 |
|-------------|-----------|------|------|
| **Harness 内核**（agent 循环·会话·沙箱） | DSH 本身：`core/agent-loop`（默认 driver，可换）+ `core/session`（append-only 事件日志）+ `sandbox` group（bwrap/Landlock/Seatbelt） | 🔴 | `docs/architecture.md:53-62`；microkernel note："agent-loop 之外任何东西不得依赖它" |
| **ModelProvider**（路由+降级链） | `ctx.llm` 接缝 + `abstract class LlmAdapter { stream() }` + `llm-retry`（挂在 `agent/request-error` 上重试）+ `llm-pi-ai`（多 provider 目录） | 🔴 | `packages/llm/llm/src/index.ts:197,384`；`docs/cookbook/adding-an-llm-adapter.md` |
| **ToolProvider**（MCP manifest 挂载） | `ctx.tools.register(defineTool({...}))` + `mcp-client`（"一个 server 一个插件：发现工具→注册"） | 🟡 | `docs/cookbook/extension-cookbook.md:9,124` |
| ↳ 但：**idempotent 声明 / envRouting / 启动漂移检查** | DSH MCP client 较薄，无幂等声明、无环境路由、无 declared-vs-discovered 漂移核对 | 🟢 | 全仓未见等价机制——**AgentOS 工具治理是真实增量** |
| **KnowledgeProvider**（六方法契约，两阶段写回） | **无一等知识接缝**。知识散落：`ctx.skills`（SkillProvider，文件系统目录发现）、`mcp-memory`、`context` 包、CLAUDE.md 式约定 | 🟢 | `packages/skill/` 只管技能不管知识库；**这是 DSH 架构里真实存在的空洞，也是所有通用框架的空洞** |
| **preset.yml**（一业务一文件，引用不实现） | **profile**：`$DSH_HOME/profiles/<name>/`（package.json `dsh.profile.bundles` + `cordis.patch.yml`）；另有**每会话 preset**（`packages/preset/`，一个 preset = 一个 `agent.cordis.yml` 目录，isolate realm 隔离，一个进程并存多套组合） | 🔴 | `docs/user/develop/basic/publish.md:69-73`；`packages/preset/README.md:12`。⚠️ **连"preset"这个词都撞车**——DSH 的 preset 是每会话组合，语义还不同 |
| **Manifest → Contract → Loader → Registry 四元组** | package.json `dsh` 字段（bundle manifest）→ Cordis Service Definition（契约，"never a TypeScript interface"必须是 Service 类）→ Cordis Loader（YAML 层叠加载）→ `ctx.<key>` 服务仓库 | 🔴 | `packages/bundle/base/package.json:31-35`；`docs/glossary.md:9`；`docs/cordis-primer.md:7-14` |
| **Conformance Test Suite**（公开准入门槛） | 门禁全部**仓库内部**：`verify-*` 脚本族、生成式 catalog（tool-catalog 88KB / config-catalog 145KB / module-graph，CI 新鲜度门禁）、100% 覆盖率门禁。**没有面向第三方实现的公开 conformance 套件** | 🟢 | `scripts/verify-*`；`AGENTS.md` 门禁条款——性质不同：DSH 管自家质量，AgentOS 管生态准入 |
| **EntryAdapter**（identity/session/render/confirm） | `host`/`client` 双半 GUI + `ui-*` 插件 + `interaction/user-approval` + apps（cli/web/acp/sdk profile） | 🟡 | `docs/architecture.md:41-47`——DSH 入口是"profile 化的 app"，不是契约化的 adapter；confirm ≈ user-approval 接缝 |
| **契约 runtime-free**（同一 preset 跨 Claude SDK / LangGraph / DSH） | DSH 契约 = Cordis 服务，**只在 DSH 进程内有效**。但 DSH 能反过来吞并别的运行时：`subagent-claude-code`（官方 Agent SDK 驱动真实 Claude Code）、`subagent-codex`、`hooks-claude-code/codex`（直接跑你已有的 hooks.json） | 🟢* | `packages/subagent/README.md:32-33`；`packages/hooks/README.md:12`。*空白是真的，但要警惕：**DSH 的答案是"把竞品装进来"，不是"把契约搬出去"**——两种哲学在争夺同一批用户 |
| **凭证只留 tokenEnv** | `.credentials.yaml` + `settings` group + Config schema 校验 | 🔴 | `docs/user/develop/basic/config.md` |
| **两层写回（draft/commit）** | 会话层有类似纪律："已提交 generation 永不改名/覆盖/删除" + 相邻版本迁移链各为独立包 | 🟡 | `docs/architecture.md:107-109`——精神一致，但那是会话持久化不是知识库 |

## 3. 需要修正的事实错误（当前文档里）

| 位置 | 现文 | 事实 | 建议改为 |
|------|------|------|---------|
| `.docs/product-vision.md:27` | "DSH（插槽密度高**但闭源**）" | MIT 开源，255 包全公开，165k star | "DSH（插槽密度最高且 MIT 开源，但契约仅在 DSH 运行时内有效）" |
| `.docs/product-vision.md:35,42` | "DSH（MIT 但**插槽绑定 DeepSeek 生态**）" | 官方插件含 llm-pi-ai 多 provider、web-search-exa/perplexity、subagent-claude-code/codex、hooks-claude-code/codex、sandbox-e2b——**竞品互为插件**是其设计哲学 | "DSH（MIT 且 provider 中立，但采用'把竞品装进来'的单体运行时哲学，而非'把契约搬出去'的可移植哲学）" |
| 同文件 27 vs 35 行 | 自相矛盾（一处说闭源一处说 MIT） | — | 统一为上述表述 |

**为什么这很重要**：修正后的表述反而让差异化**更硬**——"开源 vs 闭源"是会被事实打脸的弱论点；"单体运行时 vs runtime-free 契约层"是结构性的、不会被 DSH 的下个版本消灭的强论点。

## 4. 修正后的真差异化（按防御力排序）

1. **KnowledgeProvider 一等契约**（🟢 全场唯一没人做的）
   DSH、LangGraph、CrewAI、Claude Agent SDK 都没有统一知识接缝——知识注入散落在 7 条通道（README 已写好这张表）。两阶段写回（writePage draft → commit receipt）+ 治理在壳内（pending 排除、>10KB 卸载）是真增量。**这应该是 AgentOS 的第一叙事，而不是三契约并列。**
2. **runtime-free 契约 + 公开 Conformance**（🟢 结构性差异）
   DSH 的门禁管自家仓库质量；AgentOS 的 conformance 管**生态准入**——第三方实现只要过测试就能被所有 conforming runtime 挂载。契约是资产，运行时是宿主。
3. **工具治理细节**（🟢 小而实）
   idempotent 必填、envRouting（non-prod/prod）、启动漂移检查（declared vs discovered）——DSH MCP client 没有这些。企业场景（多 pod、审计、误操作防护）这是卖点。
4. **preset 的租户模型**（🟡 半差异）
   "一业务一 preset + workspaceId + tokenEnv"是**多租户视角**；DSH profile 是**单部署组合视角**（每会话 preset 是另一个维度）。差异真实但细微，需要场景讲清楚。

## 5. 三个待裁决的战略问题

### Q1：内核从哪来？

README 架构图里画了"Harness 内核（agent 循环·会话·沙箱）"，但 PRD 的 MVP 交付物**不含内核**（只有契约+schema+provider-markdown+conformance）。三种读法：

| 选项 | 含义 | 代价 | 判断 |
|------|------|------|------|
| (a) 自建内核 | AgentOS = DSH 的竞品 | 255 包 vs 一人；正面撞 165k star | ✗ 不现实 |
| (b) 借用 DSH 作内核 | AgentOS = DSH bundle（三契约实现为 DSH 插件 + preset 编译到 profile） | 绑定 DSH 演进节奏；但 MIT 可 vendor | ✓ 作为**第一个 conforming runtime** 最划算 |
| (c) 内核 = "任何 conforming runtime" | AgentOS 纯契约层，永不自建内核 | 叙事最纯粹；但"一个内核三个插座"口号里的内核就虚指了 | ✓ 长期定位，(b) 是它的第一个实例 |

**建议：(c) 为纲、(b) 为第一步**——KR2 的"≥2 个运行时"直接选 DSH + Claude Agent SDK，把 DSH 从假想敌变成首发宿主。

### Q2：Loader 基于 Cordis 吗？

四元组里的 Loader/Registry 需要：依赖注入、生命周期回滚、服务注册表、热替换——**这正是 Cordis 本体**（MIT，可 vendor，DSH 就是这么干的：源码级拷入 + 改名 + 修改日志）。

| 选项 | 好处 | 坏处 |
|------|------|------|
| 直接用 Cordis 做 Loader 底座 | 省数月工程量；可逆性/隔离 realm/HMR 白拿 | **TS-only**——LangGraph（Python）运行时怎么 conform？ |
| 自写最小 Loader | 跨语言可设计 | 重复发明；可逆性这种深坑一人踩不完 |
| 分层：Cordis 做 TS 参考实现，契约本身语言无关 | preset/schema/conformance 语言中立，各运行时自带 Loader | 需要把"契约 vs 参考实现"边界写死 |

**建议：第三种**，并把"provider-markdown 同时有 TS 与 Python 参考实现"列为 conformance 的跨语言验证器。

### Q3：preset 这个词还留着吗？

DSH 已有 `packages/preset/`（每会话组合，`agent.cordis.yml`）。同名不同义会造成社区对话混乱。候选：保留（抢注心智，注明差异）/ 改名（如 `stack.yml`、`tenant.yml`——反正核心语义是"一业务一栈"）。**建议改名**，把"preset"让给会话级语义，AgentOS 的是**租户级/业务级**组合，名字应该体现（这也顺手强化了差异化 #4）。

## 6. 值得抄的 DSH 工程实践（逐条可落地）

| # | 实践 | DSH 证据 | AgentOS 落地 |
|---|------|---------|-------------|
| 1 | **Capability seam 三角色教条**：Definition / Provider / Consumer 分包，"只有一个角色不构成 seam" | `docs/glossary.md:9` | 三契约仓库结构直接照此分包；写进 CONTRIBUTING |
| 2 | **注册即 effect**：所有注册返回 disposer，卸载自动回滚（"vendored HMR just works"） | `AGENTS.md:105`；`docs/user/develop/framework/index.md:42-63` | Loader 挂载 provider 必须走 effect 模式——这是"每一步可回退"（Route C）在代码层的兑现 |
| 3 | **类型化事件 + @mode 标签**（emit/waterfall/serial/parallel/bail），waterfall 监听器必须调 next() | `docs/cordis-primer.md:16-36`；`AGENTS.md:107,109` | Loader 的漂移检查、审批钩子用 waterfall；文档里每个事件标 @mode |
| 4 | **"feature → mechanism" 可检验表**："No row modifies the loop" | `docs/cookbook/extension-cookbook.md:98-133` | README 加同款表：每个产品特性映射到契约/事件，证明"三插座"不是口号 |
| 5 | **patch 按行整体替换、不深合并**（后层必胜） | `apps/cli/reference/README.md:9` | preset 层叠语义第一天定死，写进 Manifest meta-schema |
| 6 | **生成式 catalog + CI 新鲜度门禁**（config/tool/module-graph catalog 全是生成的） | `docs/config-catalog.md`(145KB) 等 | conformance 报告、provider 目录全部生成，禁止手写漂移 |
| 7 | **"Model-visible ⟺ logged" 不变量**：到达模型的内容必须能从会话日志重建 | `AGENTS.md:110` | 知识注入审计版："进入 context 的每条知识必须可从 KB receipt 追溯"——企业合规卖点 |
| 8 | **Agent Notes 决策档案**：`.agents/notes/{proposed,implemented,rejected,archived}/` 按日期存设计记录，非平凡变更必须同 PR 附 note | `AGENTS.md:125` | README 已有 Decision Log 节——升级为按日期的 notes 目录制度 |
| 9 | **vendor-with-manifest**：拷入框架源码必须附上游 SHA + 逐条本地修改日志 | `vendor/README.md` | 若 Q2 选 Cordis 底座，照此治理 |
| 10 | **branded ID、显式 resolve 步骤**（默认值必须是显式 `resolve(request): Spec`，禁止 `?? default` 散落） | `AGENTS.md:114,117` | 契约里 workspaceId/receipt id 用 branded type |

## 7. 供反复对比的 DSH 阅读清单（按优先级）

| 文档 | 路径 | 为什么读 |
|------|------|---------|
| 架构总纲 + turn flow + "新行为放哪"表 | `docs/architecture.md` | 对照 AgentOS 架构图逐层比 |
| Cordis 五思想 | `docs/cordis-primer.md` | Q2（Loader 底座）的判断依据 |
| 能力接缝图谱（47KB） | `docs/capability-seams.md` | 三契约 vs DSH 接缝的完整清单 |
| feature→mechanism 总表 | `docs/cookbook/extension-cookbook.md:98-133` | "可检验的微内核"怎么落地 |
| 插件作者教程三段 | `docs/user/develop/{basic,framework,practice}/` | 对照 KR3（30 分钟上手）的难度基线 |
| profile/bundle/patch 组合模型 | `docs/user/develop/basic/publish.md` + `apps/cli/reference/README.md` | Q3（preset 语义）的判断依据 |
| 仓库铁律 | `AGENTS.md` | 工程纪律章节的对照物 |
| preset 每会话组合 | `packages/preset/README.md` | 命名撞车现场 |

---

*生成：2026-09-07 · 深读报告全文见探索代理输出 · 本文档是 Task #3 交付物，供 Charlie 反复对比后裁决 Q1-Q3。*
