# 产品愿景

> **一个内核，三个插座。**

## 产品定义

AgentOS 是**可插拔的 Agent 执行框架**：一个 Harness 内核承载 agent 循环、会话和沙箱；三层 Provider 契约（Model / Tool / Knowledge）让模型、工具、知识库随时更换——**换业务 = 换 preset 文件，不动任何代码**。

与 LangGraph、CrewAI、AutoGen 等 Agent 框架不同：它们把模型路由、工具注册、知识注入写死在框架内部或各做一套配置。AgentOS 把这些隐式机制收敛成**显式的三契约**，并通过四元组（Manifest → Contract → Loader → Registry）让每一层都能独立替换。preset 是唯一汇合点：引用 provider，不写实现。

## 候选愿景

| # | 愿景陈述 | 调性 |
|---|---------|------|
| A | 让任何 Agent 运行时都能热插拔模型、工具和知识库 | 技术叙事、精准 |
| B | 一个内核，三个插座 | 口号型、记忆点强 |
| C | 换业务 = 换 preset | 开发者友好、行动导向 |
| D | 所有 Agent 执行机制都应该可插拔 | 哲学型、架构叙事 |

## 选定愿景

**"一个内核，三个插座。"**

- **架构即品牌** — 七字说清产品的结构主张，不是营销话术而是架构声明
- **可扩展** — 未来增加第四插座（Scheduler？Memory？）不破坏现有认知
- **开源友好** — 开发者一看就知道这是底层框架，不是上层应用
- **差异化清晰** — 对比 LangGraph（硬编码 loop）、DSH（插槽密度高但闭源）、Claude Agent SDK（主 loop + skill 体系），AgentOS 做中间层：契约抽象 + preset 模型

## 支撑声明

| 层次 | 声明 |
|------|------|
| **北极星指标** | 通过 Conformance Test Suite 的 Provider 实现数 × 使用同一 preset 的运行时数 |
| **使命** | 让模型、工具、知识库像 npm 包一样可按 manifest 引用、按契约挂载、跨运行时复用 |
| **定位** | Agent 执行框架层。与 LangGraph（hardcoded loop + graph primitives）、DSH（MIT 但插槽绑定 DeepSeek 生态）、Claude Agent SDK（主 loop + skill 体系）不同，AgentOS 专注**三层 Provider 的契约抽象与 preset 管理**——契约是 runtime-free 的资产，一个 preset 可以在多个运行时中落地。 |
| **价值观** | 契约优先（接口 > 实现）· 渐进演化（纸面收敛先行，工程落地跟随）· 开源开放（Conformance Test Suite 是真正的保险）· 拒绝重复发明（MCP 协议直接用，不自造工具语言） |

## 与技术生态的对齐

- **MCP 验证了协议路线** — Model Context Protocol 赢了 LLM↔工具连接层，AgentOS 做 MCP 没做的：契约化抽象 + 多 provider 管理 + preset 调度
- **LangGraph / CrewAI 证明了框架需求** — 但这些框架的知识/模型层仍然是硬编码或半配置的，缺「一文件切换全栈」的体验
- **DSH 展示了插槽模型的潜力** — DSH 插件密度最高且 MIT，但被 DeepSeek 生态绑定；AgentOS 做 runtime-free 的抽象层，不依赖特定上游
- **对标历史**：npm package.json（声明依赖 → 安装器解析）→ preset.yml（声明 provider → Loader 实例化挂载）

*基于两轮生产仓库分析 × DeepSeek Harness 插件模型 · rev 09-07*
*Charlie Liu 构建。最后更新：2026-09-07。*
