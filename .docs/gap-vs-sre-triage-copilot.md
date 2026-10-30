# 对标分析：AgentOS vs sre-triage-copilot

> 2026-10-26。对标仓库：`/Users/charlieliu/sre-triage-copilot`（企业内部 SRE 分诊工具，Next.js + Claude Agent SDK + Mastra 残留 + Prisma/Postgres + K8s 多 pod）。
> 前提：AgentOS 面向开源、**唯一入口是 web**、输出口（Slack/IDE/Mobile）先不做。
> 结论落到 [spec.md](spec.md)（200 点版）。本文只回答一个问题：**哪些值得做，哪些是错的**。

## 判决总表

| 判决 | 数量 | 一句话 |
|------|------|--------|
| **吸收**（直接做） | 12 项 | 通用 agent 产品能力，与理念无关，是 web 作为唯一入口后的基本功 |
| **转化**（换我们的做法做） | 10 项 | 需求真实，但他们的实现是企业 SaaS 形态；我们的答案是 preset/manifest/契约 |
| **拒绝**（错的） | 18 项 | 企业治理面 / 输出口 / 领域模型进内核 / 双运行时——违背框架定位 |

## 一、吸收：直接做（spec M14/M16 主体）

| # | 对标功能 | 为什么值得 |
|---|---------|-----------|
| A1 | SSE 15s keepalive 心跳 | web 唯一入口，长连接稳定性是地基，不是增值 |
| A2 | 会话运行状态机（running/idle/error/aborted） | 状态可呈现、可恢复，用户信任的前提 |
| A3 | 会话中断（abort） | 有开始没有停止的会话不算产品 |
| A4 | workspace 文件浏览器（list/read） | >10KB 落盘只回指针后，**用户必须能看到落盘文件**——否则落盘治理是半闭环 |
| A5 | 大结果文件面板（file panel） | 同上，工具产物的可视化出口 |
| A6 | 会话转录导出（单条 + 批量） | 开源用户的数据主权：会话数据可带走 |
| A7 | test-mcp 式工具可见性诊断端点 | 对齐我们的 drift check；"声明 vs 实挂"本就该有 API 面 |
| A8 | mcp-inspector（工具注册表可视化） | 开源化后就是 registry 面板，drift 可视化 |
| A9 | usage 查询面 | usage.log 已有，缺查询端点与呈现 |
| A10 | debug 日志文件（SDK 子进程 stderr 捕获） | 他们踩过的坑：子进程错误在应用日志里不可见 |
| A11 | graceful shutdown（SIGTERM 干净收尾） | 单机自托管同样需要 |
| A12 | E2E agent 工作流测试方式 | conformance 已有思路，补 web 层 E2E |

## 二、转化：需求真实，实现换掉（spec M14/M15/M17/M18 主体）

| # | 他们的做法 | 我们的做法 | 为什么 |
|---|-----------|-----------|--------|
| T1 | 每个 Datadog 工具硬编码 `env: non-prod/prod` 参数 | `envRouting` 是 tool manifest 字段（spec #67 已有），preset 决定环境 | 环境路由是挂载关切，不是每个工具的签名 |
| T2 | agent-configs admin 页（DB 存配置） | **preset 文件 + git 评审**，web 只读披露（ConfigDialog） | 配置即文件、PR 是唯一 commit 点——我们 Core Claim 的反面就是 admin DB 表 |
| T3 | api-keys admin 页 + users 表 | 本地一次性 token（`serve --web` 生成）+ `identity()` 契约 | 开源单机不需要密钥管理 SaaS；企业认证是 entry 层插座，不是内核 |
| T4 | creating-a-new-agent 脚手架文档（拷目录、改 6 处） | **新 agent = 新 preset yml，零代码零脚手架** | 这份 480 行文档本身就是我们差异化的最好证据 |
| T5 | incidents/investigations 领域模型进主应用 | 领域逻辑只存在于 `examples/` 示例 preset | 框架不背业务；triage 是"换业务=换文件"的演示载体 |
| T6 | skills 从 cdc-agent-kit 定期同步 | 七通道之一，knowledge provider 承载，git 为源 | 同步脚本 = 第二真相源；我们只有 git 一个 |
| T7 | default-model-routing + gateway-models 两个 admin 页 | 三级路由既有（spec #25），落到 preset + web 切换器 | 模型路由是 preset 的事，页面的部分只做只读+切换 |
| T8 | per-app 专用 Postgres + Prisma | sqlite 内嵌默认 + ledger 接口隔离（不承诺 Postgres） | 多 pod 是他们部署形态的产物；开源默认零外部依赖启动，隔离预留换库自由 |
| T9 | bubblewrap 沙箱（文件/网络） | 文件边界已有（fsRoots）；网络白名单进 manifest 声明 | 沙箱策略应该是可声明的挂载配置，不是写死在 Dockerfile 里的工具 |
| T10 | 官方 Datadog MCP 动态发现 + JSON Schema→Zod v4 运行时转换 | JSON Schema 直传（spec #6 边界规则），零转换 | 他们的"Critical: Zod v3/v4"章节验证了我们的踩坑记录——转换层就是事故层 |

## 三、拒绝：错的，不做（spec M20 边界承诺 171–200）

| # | 拒绝项 | 错在哪 |
|---|--------|--------|
| R1 | Slack 入口全家桶（channels/allowlist/model-routing 三个 admin 页 + Bolt 集成） | 输出口（前提已定）；且 Slack 治理是企业运营问题，不是框架问题 |
| R2 | Mastra 独立 MCP server 部署（IDE 侧） | 输出口推迟 + 双运行时并存是他们承认的历史包袱，我们反模式 ③ 第一天定死 |
| R3 | Mobile / external REST API | 输出口 |
| R4 | 4A 认证 + AuthProvider 全家桶 | 企业 auth 是 identity() 插座上的一块插件；进内核 = 开源没人能用 |
| R5 | 14 页 admin 大盘 | 企业多租户治理面；开源单机的等价物是"文件 + git + ConfigDialog 只读披露" |
| R6 | Datadog/Bugsnag/ROQS 工具硬编码在 src 里 | 任何 vendor 工具进内核都摧毁"换 preset 换全家"的承诺；一律 `config/tools/*.yml` |
| R7 | incidents/investigations/RUM 领域模型 | 内核背业务的终点是变成第二个 sre-triage-copilot |
| R8 | K8s/ArgoCD/ECR/发布标签脚本产品化 | 部署链是企业内部运维，开源最多给 Docker 文档 |
| R9 | 多 pod 无内存状态 → 全家上 Postgres | 需求真实但顺序错了：先纪律后换库（sqlite 默认 + ledger 接口隔离），触发条件文档化（类比 RAG 四条） |
| R10 | Next.js/turbo 重栈 | web 是 console 不是应用主战场；vite+react 维持内核小依赖 |
| R11 | npm workspace 双栈 Mastra+AI SDK | 单一 runtime 原则（路线 C：多 runtime 各自实现，不是同仓并存） |
| R12 | 运行时 Zod 动态转换 | 转换层即事故层（他们文档里原话：静默丢全部工具） |
| R13 | 会话文件双位置 mirror（cases under sessions 修复先例） | 单一数据目录规范（`.agentos/`）从第一天定死，避免事后搬迁 |
| R14 | Bugsnag/可观测 vendor 内置 | 开源版内核自观测用结构化日志 + health 端点，不绑 vendor |

（R1–R14 展开为 spec 171–200 的逐条边界承诺，每条含"替代出口"指向。）

## 对标给我们的最大验证

1. **他们的 Zod 章节是踩坑记录的镜像**——"Custom types cannot be represented in JSON Schema，静默丢全部工具"，与我们 v4 全仓锁的理由一字不差。JSON Schema 边界规则是对的。
2. **他们的 480 行 new-agent 脚手架指南 vs 我们的一行 yml**——这是所有宣传材料的对比锚点。
3. **他们的 multi-pod 纪律值得抄成纪律条款**（无模块级状态、DB 为唯一事实源、resume 靠重放），但抄纪律不抄架构。
4. **落盘闭环被他们验证**：offload → file panel 是完整链路，我们 spec 里原来只有 offload 半边（#44），本次补齐（#104/#105）。

## 差异化一句话

> sre-triage-copilot 是"一个 SRE 分诊产品"；AgentOS 是"做出任意分诊产品的框架"。
> 功能覆盖上我们吸收它的产品基本功，转化它的真实需求，拒绝它的企业形态——最终它的全部功能面，在我们的世界里要么是 preset 文件、要么是 config/*.yml、要么是 examples/，**没有一样需要写进内核**。
