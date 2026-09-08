# 预-mortem 分析：AgentOS MVP

> 练习：框架发布 6 个月后无人问津——没有第三方 provider 实现，conformance suite 没人跑，preset 规范成了又一份文档。哪里出了问题？

---

## 老虎（真实风险）

### 老虎 T1 — "为什么需要另一层抽象？"协议 nobody adopts

- **类别：** Launch-Blocking（阻塞上线）
- **证据：** MCP 已经赢了 LLM↔工具连接层。开发者反应可能是"MCP + 自定义 tool 就够了"。如果讲不清楚 AgentOS 和 MCP 的边界，开发者 30 秒内划走。
- **深层问题：** 「三层 Provider 契约」是真需求还是架构师的自嗨？LangGraph/CrewAI 的用户真的觉得换模型供应商是个大痛点吗？还是他们直接硬编码 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 环境变量就完了？
- **为什么睡不着：** 这是价值根基。如果 agent 项目不换模型、不加工具、不换知识库，契约就没有存在理由。
- **缓解：** 发布前先跑 E1（5 人可用性实测）。核心问题："你最近一次换模型供应商是怎么做的？花了多久？" ≥ 3/5 表示有真实痛苦才继续。

### 老虎 T2 — 框架冷启动比平台更隐蔽

- **类别：** Launch-Blocking
- **证据：** 平台死在"鸡生蛋"，框架死在"谁第一个用"。Conformance Test Suite 再完善也没有意义——如果没有第二个 provider 实现跑测试，它就是个空壳。
- **具体死法：** 契约写得漂亮 → 没有人接 → preset 变成纸上谈兵 → 维护者失去信心 → 项目沉寂。
- **缓解：** Step 0（纸面收敛）零风险先行；Step 1-2 自带参照物（已有 MCP 注册表现改 manifest）；不等新接入方，先用现有仓库做改造验证。

### 老虎 T3 — 运行时绑定反噬

- **类别：** Fast-Follow
- **证据：** Claude Agent SDK 或 DSH 如果内置了同样风格的 Provider 抽象，AgentOS 被边缘化。SDK 原生支持 = 生态锁定。
- **护城河候选：** 契约的 runtime-free 属性 + conformance suite 的可验证承诺 + preset 格式的通用性。是否够用待验证。
- **缓解：** 契约设计时主动对齐主流运行时 API，减少迁移成本；conformance suite 对任何实现开放，不依赖特定上游。

### 老虎 T4 — 过度设计陷阱

- **类别：** Track
- **证据：** 四层四元组、七通道知识注入、演化阶梯插槽……架构复杂度可能超出最小可用范围。MVP 阶段最容易犯的错是"先把体系建全"。
- **放大效应：** 架构太厚导致开发者看不懂 preset.yml 该怎么写，5 人实测失败。
- **缓解：** MVP 只交付三契约 + preset + provider-markdown。其他所有内容（EntryAdapter、ModelProvider 路由策略、conformance 扩展）留到 v0.3。

### 老虎 T5 — 一人维护框架的成本误判

- **类别：** Track
- **证据：** 框架项目的维护负担远重于应用项目——每个新 provider 实现都要配 conformance 测试，每次接口变更要协调所有已有实现更新。
- **缓解：** MVP 明确「一个内核三个插座」的边界，不加第四插座；契约稳定后再考虑扩展。

---

## 纸老虎（被夸大的担忧）

### PT1 — "架构被批评'为了解决问题而发明问题'"

为什么不必担心：契约本身没有成本——不看、不用是你的自由。看了觉得有用才会接入。MCP 最初也被质疑"又一个协议"，但生态证明了它的价值。关键指标是 conformance 通过数。

### PT2 — "开源框架需要团队运营，一个人做不了"

为什么不必担心：MVP 阶段的框架是契约文档 + 一个最小实现（provider-markdown）+ conformance suite。这些都是标准开发者资产，一人+AI 可做。生态运营是 v0.3 后的问题。

### PT3 — "大厂做了类似的东西怎么办"

为什么不必担心：大厂做的是绑定自家生态的（如 SDK 内置 model routing），AgentOS 做的是 runtime-free 的抽象。兼容性不是竞争关系——更好的情况是大厂参考 conformance 标准，反而验证了方向。

---

## 大象（没被充分讨论的担忧）

### 大象 E1 — 纸面收敛 vs 工程落地的鸿沟

三契约在文档上看起来完美，但落到真实代码时有看不见的摩擦：OpenAI 和 Anthropic 的 token 管理方式不同、MCP transport 在不同 SDK 版本的兼容性问题、markdown KB 的 frontmatter schema 设计决策。这些细节不会出现在预设计中但决定生死。**需要在 Step 0 前先确认至少两个真实系统的机制可以被现有契约描述。**

### 大象 E2 — preset.yml 可能只是一个配置文件的增强版

如果 preset.yml 最终只做了"引用 provider + 传 token env"，那它本质上就是一个增强的 .env 文件，不值得单独成为产品的核心叙事。**差异化应该在 Loader 的逻辑**——读 manifest → 实例化 → 挂载 → 漂移检查 → 健康探活。preset 只是入口，真正的价值在 Loader + Registry 的配合。

### 大象 E3 — Conformance Test Suite 的生命周期管理

今天的 conformance 覆盖五动词（KB 契约），明天如果要加 ToolProvider 和 ModelProvider 的测试，如何保持版本一致？conformance suite 的更新频率应与契约版本绑定而非随时间漂移。**需要建立契约版本与 conformance 版本的对应关系。**

---

## 阻塞上线老虎的行动计划

### 老虎 T1 — 价值验证

| 项目 | 详情 |
|------|------|
| **风险** | 开发者不认为需要 Provider 层面的抽象 |
| **缓解** | 发布前先跑 5 人访谈（LangGraph/CrewAI/DSH/Sdk 各 1），核心问题："你最近一次换模型供应商是怎么做的？知识库怎么管理的？"≥ 3/5 表示有痛点 |
| **负责人** | Charlie Liu |
| **截止** | 第 1 月前两周 |

### 老虎 T4 — 范围控制

| 项目 | 详情 |
|------|------|
| **风险** | 架构复杂度失控 |
| **缓解** | MVP 严格限定在三契约 + preset + provider-markdown + conformance suite v0.1。EntryAdapter 和 ModelProvider ×2 实现在 v0.3。不在 v0.1 做任何 UI。 |
| **负责人** | Charlie Liu |
| **截止** | 持续执行 |

---

*Charlie Liu 构建。最后更新：2026-09-07。*
