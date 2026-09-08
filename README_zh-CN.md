# AgentOS

> **一个内核，三个插座。**

AgentOS 是**可插拔的 Agent 执行框架**：一个 Harness 内核承载 agent 循环、会话和沙箱；三层 Provider 契约（Model / Tool / Knowledge）让模型、工具、知识库随时更换——**换业务 = 换 preset 文件，不动任何代码**。

[English](README.md) · [中文文档](.docs/)

---

## 目录

- [核心主张](#核心主张)
- [架构概览](#架构概览)
- [三契约](#三契约)
- [四层插件设计](#四层插件设计)
- [知识库](#知识库)
- [过渡路线](#过渡路线)
- [工程纪律](#工程纪律)
- [快速开始](#快速开始)
- [决策记录](#决策记录)
- [待定决策](#待定决策)

---

## 核心主张

| # | 主张 |
|---|------|
| 1 | **契约不变，宿主可换** — 同一组接口可以同时接不同的 Agent 运行时 |
| 2 | **插座已经存在，只是没显式化** — 现有框架里散落的模型路由、工具注册、知识注入可以收敛成统一的显式契约 |
| 3 | **「换业务 = 换 preset」是差异化** — 一个 preset 文件引用所有 provider，不写任何实现 |

---

## 架构概览

![AgentOS 架构图](.docs/architecture-diagram.png)

*交互式 HTML 版本（含导出选项 PNG/PDF）：[.docs/architecture-diagram.html](.docs/architecture-diagram.html)*

**租户模型：** 一业务 = 一 preset 文件（provider 选择 + workspaceId + tokenEnv）；凭证只走环境变量，不进 preset。

---

## 三契约

### KnowledgeProvider — 知识库可插拔

会话注入 → 检索 → 两段式反写（kb_write 草稿 / kb_commit 确认落库）

```ts
interface KnowledgeProvider {
  bootstrap(preset): DirectoryIndex        // 导览：目录 + 最近更新
  search(q, limit): SearchHit[]            // 按关键词/语义搜
  getPage(id): PageContent                 // 读原文
  listPages(scope): IndexEntry[]           // 索引列表
  writePage(draft): Receipt                // 两段式：先落草稿
  commit(receipt): void                    // 确认后写入 git PR
}
```

| 实现 | 状态 | 说明 |
|------|------|------|
| `provider-markdown` | v0.1 可用 | 零依赖兜底，git + markdown 为源真相层 |
| `provider-weknora` | 触发后 | RAG + Wiki UI + 多租户（数十~数百页后启用） |
| `provider-mcp` | 规划中 | 任意 KB server 通过 MCP 协议接入 |

### ToolProvider — MCP 可插拔

一个工具服务器 = 注册表一条声明式 entry，运行时按 transport 挂载。

```yaml
# tool-entry.yaml
name: datadog-monitoring
transport: stdio          # sdk | stdio | http
auth: token-env:DATADOG_TOKEN
allowedTools: ["dd_*"]
envRouting: non-prod      # non-prod | prod
idempotent: true          # 必填 - 决定是否可重试
schemaExchange: json-schema
```

**挂载规则：** 逐条挂载，单条失败 = 缺席 + 告警，不拖垮整体；启动期漂移检查（声明 vs 实际发现的工具）。

### ModelProvider — 模型可插拔

三层优先级路由（请求覆盖 → 频道/租户配置 → 全局默认），带降级链。

```ts
interface ModelProvider {
  provider: 'openai' | 'anthropic' | 'ollama' | 'local'
  models: Record<string, string>       // sonnet/haiku 等别名 → 真实 model id
  fallbackChain: string[]              // 健康探活短路
  usageAttr: { provider, model, tenant } // 用量归因标签
  // 路由状态 ∈ DB（多 pod 安全）
}
```

---

## 四层插件设计

知识库、模型、MCP 工具、入口 —— 四层**不各做一套机制**，共享同一个四元组：

```
Manifest（静态声明） → Contract（版本化接口） → Loader（实例化→挂载） → Registry（运行时查询）
```

preset 是四层的唯一汇合点：一个业务的 preset 只做**引用**，不写任何实现。

```yaml
# preset-example.yml —— 一业务一份；换业务 = 换这一个文件
knowledge: { provider: weknora, workspaceId: w-123, tokenEnv: WEKNORA_TOKEN }
model:      { provider: anthropic, policy: default }
tools:      [ datadog-monitoring, github-actions ]
entry:      { slack: { channel: "#engineering", confirmUI: blockkit } }
# 凭证永不进 manifest，只留 tokenEnv 引用
```

### EntryAdapter — 入口层（最后补，非先行）

入口插件 ≠ 每客户端一套，而是只抽四件跨层翻译：

| 方法 | 职责 |
|------|------|
| `identity()` | 凭证 → `{ userId, tenant }`（API key / OAuth / Slack mapping） |
| `session()` | 客户端会话 ↔ agent session 映射 |
| `render()` | SSE 事件流 → 该客户端呈现（透传 / Block Kit / 文本） |
| `confirm()` | 确认交互能力声明（决定知识写权限） |

### Conformance Test Suite

每个契约配一组「任何实现必须通过」的黑盒测试，跑在 CI 而非运行时。有了它，插件化才不是架构美学而是可验证承诺；它同时是未来第三方接入者唯一的说明书。

### 落地顺序

| Step | 做什么 | 验收 | 为什么在这 |
|------|--------|------|-----------|
| 0 | Manifest 元 schema + 四契约文本 | 每份契约能描述一个已有系统 | 纸面收敛，零风险 |
| 1 | 已有项目的 MCP 注册表改 manifest 驱动 | 改造前后工具集零差异 | 有参照物，机制最容易显形 |
| 2 | 引入第二个项目作为外来第一条 manifest 接入 | 幂等声明生效、非幂等工具被保护 | 立刻被第二个真实方压测 |
| 3 | 抽取两个 ModelProvider 实现（如 OpenAI / Ollama） | 一次请求内换 provider，路由/降级正常 | 纯抽取，机制已广泛运行 |
| 4 | EntryAdapter 两个实现：Slack + REST | 同一 preset 两端跑同一次对话 | 两实现原则契约定稿 |
| 5 | knowledge-core + 多 provider + 跨运行时 conformance | 同一 preset 在两个运行时各跑通全流程 | 依赖前四步格式稳定 |

### 三个反模式（已否决）

| # | 反模式 | 状态 | 替代方案 |
|---|--------|------|---------|
| ① | 自造工具协议 | 已否决 | 工具层直接用 MCP，只管挂载不管定义 |
| ② | 热插先于启动加载 | 已否决 | 第一步只做「启动期读 manifest」，运行时热插是最后一个里程碑 |
| ③ | 一个入口两个内核 | **第一天定死** | channel →（内核, preset）路由表，禁止两边接同一 thread |

---

## 知识库

### 七通道知识注入

| # | 通道 | 知识类型 | 谁触发 | 成本模式 | 放什么 |
|---|------|---------|--------|---------|--------|
| 1 | System prompt | 规矩 | 代码拼装 | 每圈全量付费 | 极小+每圈必用（HARD RULE） |
| 2 | CLAUDE.md 分层 memory | 项目知识 | 自动加载 | 启动常驻 | 小而稳+全员必用+坑位记录 |
| 3 | Skills | 程序性知识 | 菜单常驻 | 菜单税+按需一次 | SOP / 操作规程 |
| 4 | MCP 工具 | 动态事实 | 模型调用 | 按需，可落盘 | 现查类（监控系统、API 查询） |
| 5 | Workspace 文件 | **静态资料库** | Read/Grep | **零协议成本** | **几十~几百份 md 知识仓 + 导览 + 反写草稿 —— 主战场** |

> 通用 Agent 框架没有内置 RAG —— 大事实库必须自己做成通道 4/5 的组合。

### 规模甜蜜点：几十~几百份不需要向量检索

全库摘要索引 ≈ 1-2K token，目录菜单全量常驻 = 检索问题当场消解；正文按需 Grep（词面匹配对内部文档精度反而高于语义）。上检索层的四条触发线：>150 页 / 改写差距出现 / 非 git 受众 / 跨租户共享 —— 满足任意两条再动。

### 演化阶梯与插槽裁决

| 插槽 | 住在这里的候选 | 裁决 |
|------|--------------|------|
| 源真相层（图书馆） | **git + markdown** | 无软件依赖，承重墙，不再动 |
| 编辑/浏览层（人的桌子） | VSCode / Typora / Obsidian | 可与 git 仓叠加，非替代 |
| 索引/检索层（研究院大脑） | LangChain RAG / LlamaIndex / pgvector | 纯算法无产品，几百份不碰 |
| 一站式平台（全打包） | Dify KB / RAGFlow / Outline | 触发后公平比测，license 合规优先 |

### 对接链路：harness 如何见到知识库

```
git + markdown 仓（源真相 · 书）
  ↓ 单向灌入 · reindex.sh 可重跑
知识库引擎（索引层 · 书皮：chunks + 向量 + Wiki UI）
  ↑ 方言止步于这层
provider-<engine>（薄壳 · 唯一真胶水：治理+租户+凭证）
  ↓ 说普通话：MCP
kb-mcp-server（kb_search · kb_get_page · kb_append）
  ↓ MCP 协议 · 谁都能插
LangGraph · CrewAI · AutoGen · 自定义框架
```

**理由：** 方言隔离（引擎细节不出壳）· 治理在壳（反写两段/待审排除/>10KB 落盘）· 一次四通吃（写一次全框架通用）

---

## 过渡路线

三种策略，**推荐路线 C**：

| 路线 | 内核 | 动作 | 结论 |
|------|------|------|------|
| A | 全上某一运行时 | 一切插件化挂到单一框架 | 观察：长上下文工程短期复刻不了 |
| B | 全上另一运行时 | 深度定制适配 | 次选：被上游版本节奏绑定 |
| **C** | **契约先行 · 多运行时并存** | **契约定稿，各运行时各自实现，能力逐步接入** | **推荐** |

### 路线 C · 四步落地（每步可回退）

1. **三个契约定稿** — 只写契约与 schema，runtime-free 资产
2. **引入第一个外部 ToolProvider** — 验证 provider-mcp 路径
3. **给既有系统加一条知识库 entry** — 补充业务知识，原内核不动
4. **跨运行时验收测试** — 同一 preset 在不同运行时各跑通注入→检索→反写

> 「每步可回退」= 每一步都是加法，不修改不删除任何在跑的旧系统。回退 = 撤掉该步新增项。

---

## 工程纪律

| # | 纪律 | 级别 | 说明 |
|---|------|------|------|
| 1 | **会话主权**：一个入口只归一个内核 | 高 | 双内核抢会话 = 上下文劈半、状态对不上账 |
| 2 | **Schema 以 JSON Schema 交换** | 中 | 不同版本的 schema 不兼容会静默丢全部工具 |
| 3 | **idempotent 必填** | 中 | 非幂等工具在自动重试下执行不可逆操作 |
| 4 | **注册表配置驱动** | 纪律 | 多 pod 下禁用 module-level 状态 |
| 5 | **大结果治理进契约** | 纪律 | >10KB 结果落盘，只回指针 |

---

## 快速开始

### 环境要求

- Node.js ≥ 20
- TypeScript ≥ 5.4

### 安装

```bash
git clone https://github.com/charlie-bit/agentos.git
cd agentos
npm install
```

### 开发

```bash
# 运行测试
npm test

# 类型检查
npm run typecheck
```

### 贡献

详见 [CONTRIBUTING.md](./skills/CONTRIBUTING.md)。
