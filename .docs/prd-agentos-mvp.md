# PRD：AgentOS — 可插拔 Agent 执行框架

> 2026-09-07 重写：产品从"商业能力操作系统"翻转为"一个内核三个插座的插件化 Agent 执行框架"。

## 1. 摘要

MVP 交付四件事：

| # | 交付物 | 说明 |
|---|--------|------|
| 1 | **三契约文本 + Manifest Schema** | KnowledgeProvider / ToolProvider / ModelProvider 的完整接口定义 + YAML schema |
| 2 | **preset 格式规范** | 四层共享的四元组引用模型（Manifest → Contract → Loader → Registry） |
| 3 | **provider-markdown** | 零依赖知识库兜底实现：git+markdown 源真相层，五动词契约 |
| 4 | **Conformance Test Suite v0.1** | 每个契约一组黑盒测试，跑在 CI；第一个第三方接入者唯一的准入说明书 |

这不是「平台 MVP」。这是**框架 MVP**——先有契约和最小实现，让后续 provider 和运行时有据可依。

## 2. 联系人

| 姓名 | 角色 | 备注 |
|------|------|------|
| Charlie Liu | 创始人/产品/架构 | 蓝图设计、契约定义、核心实现 |
| TBD | 工程师（协作） | 运行时集成、conformance suite 扩展 |

## 3. 背景

2026 年 Agent 开发生态碎片化严重：LangGraph 硬编码 loop，CrewAI 内置工具协议，DSH 插槽绑定 DeepSeek 生态，Claude Agent SDK 的 skill/model 体系各走各的路径。同一个项目如果未来想换模型供应商、换知识库后端、或迁移运行时无缝升级——没有一套统一的抽象可以复用。

现有框架的知识注入是七条通道（system prompt、CLAUDE.md、Skills、MCP 工具、Workspace 文件、hooks、subagents），但每一层都是各自为政的实现。知识管理没有契约，只有惯例。

AgentOS 做一件简单的事：**把散落的隐式机制收敛成显式契约**。三层 Provider（Model / Tool / Knowledge）各有一组确定的方法签名；preset 是四层的唯一汇合点，只做引用不写实现；Loader 读 manifest 实例化并挂载；Registry 提供运行时查询。Conformance Test Suite 保证任何新实现不破坏已有行为。

**为什么现在做：** 两条生产级仓库（合计 6 万+ LOC）已各自长出相似的机制——模型路由表、MCP 注册表、skill 热插拔、SSE 事件契约。不是巧合，是信号：这些隐式插座已经存在，只是没被显式化。现在是把它们收拢成契约的时机。

## 4. 目标与关键结果（6 个月 OKR）

### 做什么
发布三契约 + preset 规范 + 最小 provider 实现 + conformance suite，证明「一个 preset 跨运行时跑通同一流程」可行。

### 为什么重要
- 契约是 runtime-free 资产——一旦确立，所有 Agent 运行时都可以对接，不依赖任何一个上游
- preset 模型解决了「换业务 = 换配置不换代码」的体验缺口
- Conformance Test Suite 是第三方接入的唯一说明书

### 关键结果

| 关键结果 | 基线 | 目标 | 衡量 |
|---------|------|------|------|
| KR1：通过 conformance 的 Provider 实现数 | 0 | ≥ 4（markdown KB ×1 + 至少 1 model ×1 + 1 tool ×1 + 1 entry ×1） | CI 报告 |
| KR2：同一 preset 在不同运行时中跑通的次数 | 0 | ≥ 2（如 Claude Agent SDK + 另一运行时） | 跨运行时验收测试 |
| KR3：契约文档可读性 | N/A | 外部开发者能在 30 分钟内用 preset.yml 挂上自己的工具 | 5 人可用性实测 |
| KR4：开源信号 | 0 | GitHub ≥ 200 star | GitHub |

## 5. 技术范围

### 包含（MVP）

| ID | 范围 | 优先级 | 描述 |
|----|------|--------|------|
| T1 | **三契约文本** | P0 | KnowledgeProvider（五动词定稿）+ ToolProvider（manifest 格式）+ ModelProvider（路由+降级链） |
| T2 | **Manifest Schema** | P0 | preset.yml 的 JSON Schema，四层共享 |
| T3 | **preset 引用模型** | P0 | 一层引用 Provider 注册表条目，凭证只留 tokenEnv 不落地 |
| T4 | **provider-markdown** | P0 | git+markdown 源真相层，index 生成器，CI lint 两条 |
| T5 | **Conformance Test Suite v0.1** | P0 | KB 契约黑盒测试（bootstrap/search/getPage/write/commit） |
| T6 | **ToolProvider manifest 驱动示例** | P1 | 将一条 MCP 服务声明从 TS 数组改为 YAML manifest |
| T7 | **ModelProvider 两个实现** | P1 | OpenAI / Anthropic 基础路由 + fallback chain |

### 不包含（MVP 边界）

| # | 排除项 | 理由 |
|---|--------|------|
| ✗ | 运行时热插 provider | 第一步只做「启动期读 manifest」，热插是最后一个里程碑 |
| ✗ | 自定义工具协议 | 工具层直接用 MCP，只管挂载不管定义 |
| ✗ | 多内核并行监听同一入口 | channel→(kernel, preset) 路由表第一天定死 |
| ✗ | 商业信任层（实名/存证/审计） | 不在框架范畴内，provider 层面可叠加但不阻塞主线 |
| ✗ | UI/市场/注册表前端 | MVP 是 CLI + 契约文档，不是 web app |

### 技术选型

| 层级 | 选择 | 理由 |
|------|------|------|
| 契约载体 | TypeScript interfaces + JSON Schema | 类型安全 + 可生成交互式文档 |
| 语言 | TypeScript / Node.js ≥ 20 | 覆盖主流 Agent 开发者栈 |
| 知识库源真相 | git + markdown | 无软件依赖，PR 评审是唯一 commit 点 |
| Conformance 测试 | Vitest（CI） | 与主仓库同测试栈 |
| 开源 | GitHub + Gitee 双仓库 | 国内开发者可达性 |

## 6. 解决方案

### 6.1 产品架构

```
┌─────────────────────────────────────────────┐
│  入口层 · 全部薄桥化                         │
│  Slack bot │ Web UI │ IDE/MCP client │ REST  │
└──────────────┬──────────────────────────────┘
               ▼
┌─────────────────────────────────────────────┐
│           Harness 内核                       │
│  agent 循环 · 会话（DB 态）· 沙箱            │
└──────────────┬──────────────────────────────┘
               ▼
┌───────────────────────────────────────────────────────────┐
│  Manifest → Contract → Loader → Registry                 │
├─────────────────┬──────────────────┬──────────────────────┤
│  ModelProvider  │  ToolProvider    │  KnowledgeProvider   │
│  (OpenAI等)     │  (MCP server)    │  (markdown/RAG)      │
└─────────────────┴──────────────────┴──────────────────────┘
               ▲
         preset.yml（引用层）
```

### 6.2 Conformance Test Suite

每个契约配一组黑盒测试，跑在 CI 而非运行时：

```
knowledge-provider-conformance.test.ts
├── bootstrap() returns structured index
├── search(q) returns hits with page refs
├── getPage(id) returns full content
├── writePage(draft) creates receipt without committing
├── commit(receipt) persists to source truth layer
└── listPages(scope) respects scope boundaries
```

Conformance 是未来的第三方接入者唯一的准入标准——它比文档更有说服力。

### 6.3 落地顺序（Step 0-5）

| Step | 做什么 | 验收 |
|------|--------|------|
| 0 | Manifest 元 schema + 四契约文本 | 每份契约能描述一个真实已有系统 |
| 1 | MCP 注册表现改 manifest 驱动 | 改造前后工具集零差异 |
| 2 | 引入第二条 manifest 作为外来接入方 | 幂等声明生效、非幂等工具受保护 |
| 3 | ModelProvider 抽取（OpenAI / Anthropic） | 一次请求内换 provider，路由正常 |
| 4 | EntryAdapter 两个实现 | 同一 preset 两端跑通对话 |
| 5 | 跨运行时 conformance 验收 | 同一 preset 不同运行时各跑通全流程 |

## 7. 发布规划

| 版本 | 时间 | 范围 | 目标 |
|------|------|------|------|
| v0.1 | 第 1 月 | 三契约文本 + Manifest Schema + provider-markdown | 契约纸面收敛，知识库可用 |
| v0.2 | 第 2-3 月 | Conformance Test Suite v0.1 + ToolProvider manifest 示例 | 第一个第三方接入验证 |
| v0.3 | 第 4-6 月 | ModelProvider ×2 + EntryAdapter ×2 + 跨运行时 conformance | 跨运行时验收通过 |

---

*Charlie Liu 构建。最后更新：2026-09-07。*
