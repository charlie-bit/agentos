# 假设识别：AgentOS MVP

> 8 类风险类别评估（Torres 框架 + 技术可行性 + 生态采纳）。2026-09-07 按"插件化 Agent 执行框架"重写。

---

## 价值风险

| # | 假设 | 信心 (1-5) | 测试方法 |
|---|------|-----------|---------|
| V1 | Agent 开发者认为「换模型供应商」值得用 preset 声明而非直接改代码 | 2 | 5 人访谈：最近一次换模型供应商怎么做？≥ 3/5 表示有痛点才继续 |
| V2 | ToolProvider manifest 比硬编码 MCP_SERVERS 数组更有信息量 | 3 | E1 试用：给现有 TS 注册表和 YAML manifest，问哪个更易理解 |
| V3 | preset 引用模型解决了真实痛苦（非自我发明的概念） | 2 | E1：开发者能否自行写出包含 model/tool/knowledge 引用的 preset |

## 可用性风险

| # | 假设 | 信心 (1-5) | 测试方法 |
|---|------|-----------|---------|
| U1 | 三契约文档能在 30 分钟内让开发者理解并能写一个 provider 实现 | 3 | 5 人实测工作坊：读完契约文档后尝试写一个简单 KB provider |
| U2 | preset.yml 的 schema 足够表达常见配置场景 | 3 | 纸面验证：用 preset 描述 5 种业务（监控调查、QA 工具、知识库查询、多模型路由、本地模型降级），找无法表达的反例 |
| U3 | Conformance Test Suite 能检测出 provider 的关键缺陷而不只捕获边缘 case | 3 | E2：故意破坏 provider-markdown 核心行为，验证全绿率 |

## 商业性风险

| # | 假设 | 信心 (1-5) | 测试方法 |
|---|------|-----------|---------|
| VI1 | 开源框架通过「规范 + SDK」模式在后期获得支持/赞助 | 2 | 参考 MCP、OpenTelemetry 等开源协议项目的发展路径 |
| VI2 | preset 格式的通用性足以支撑第三方付费 provider | 3 | E1/E3 中分别问："如果有一个托管的 RAG provider 只需一行引用，你愿意用吗？" |

## 可行性风险

| # | 假设 | 信心 (1-5) | 测试方法 |
|---|------|-----------|---------|
| F1 | 一人能在 6 个月内交付三契约 + preset 规范 + provider-markdown + conformance suite | 3 | 2 周技术验证：契约草案 + markdown provider stub + 一条 conformance 用例跑通 |
| F2 | Conformance Test Suite 可在 CI 中以 < 60s 完成所有 KB 契约测试 | 4 | MVP conformance 是纯内存测试，不依赖外部服务 |
| F3 | MCP transport 在不同运行时的兼容性可用 JSON Schema 交换统一 | 3 | 调研 Claude Agent SDK / LangChain / DSH 对 MCP tool schema 的实际处理方式 |
| F4 | git+markdown 源真相层能满足几十~数百页规模的知识库需求 | 4 | T0 施工批次已验证该规模下 Grep + Read 足够有效 |

## 生态风险

| # | 假设 | 信心 (1-5) | 测试方法 |
|---|------|-----------|---------|
| ECO1 | Claude Agent SDK / LangGraph / CrewAI 在 18 个月内不会内置同等抽象 | 2 | 季度路线图扫描；若任一平台推出等价功能则重新评估差异化 |
| ECO2 | 第三方会愿意为 AgentOS 写 provider 实现而非直接对接自有 SDK | 2 | E2 实验效果 + conformance suite 文档质量 |
| ECO3 | MCP 协议的持续演进不会与 ToolProvider 契约冲突 | 3 | MCP 版本兼容策略 + 契约中声明版本边界 |

## 工程质量风险

| # | 假设 | 信心 (1-5) | 测试方法 |
|---|------|-----------|---------|
| EQ1 | Loader 机制能在不同运行时中以一致方式工作 | 3 | E3 跨运行时验收测试 |
| EQ2 | preset 中 credential tokenEnv 引用方式安全且实用 | 4 | code review + 安全意识检查（凭证不进 manifest 是底线） |
| EQ3 | 契约变更不会导致已有 preset 失效 | 3 | 建立 backward-compatibility policy；v1.0 前允许 breaking changes 但在 changelog 中明确 |

## Go-to-Market 风险

| # | 假设 | 信心 (1-5) | 测试方法 |
|---|------|-----------|---------|
| GTM1 | 开源发布（GitHub/Gitee）能吸引首批国内开发者关注 | 3 | v0.1 发布后 30 天 star/fork/watch 数 |
| GTM2 | 「一个内核三个插座」叙事能被 5 位以上开发者准确复述 | 3 | E1 结束时的 verbal protocol test |
| GTM3 | Conformance Test Suite 能成为第三方接入的权威标准 | 2 | 第一个独立第三方的接入意愿和速度 |
| GTM4 | 6 个月 ≥ 3 个第三方 Provider 实现通过 conformance | 2 | KR 追踪；第 3 个月中点检查 < 1 个则触发 pivot |

## 战略与目标风险

| # | 假设 | 信心 (1-5) | 测试方法 |
|---|------|-----------|---------|
| S1 | "runtime-free 契约"定位有差异化空间（vs SDK 内置 routing vs DSH slots） | 3 | 持续对比主流运行时 provider 抽象的设计差异 |
| S2 | 框架路线 vs 应用路线没有真正验证过 | 2 | E1-E3 全失败 → 回退到单运行时内置 provider 扩展包 |

## 团队风险

| # | 假设 | 信心 (1-5) | 测试方法 |
|---|------|-----------|---------|
| T1 | solo founder 能同时完成架构设计 + 契约写作 + core 实现 + conformance 编写 | 2 | 精力盘点：v0.1 阶段能否只做架构+契约+provider-markdown，conformance 可精简 |
| T2 | AI 辅助能将契约文档的产出效率提升到一人可行的水平 | 3 | v0.1 实际工时记录作为基准 |

---

## Top 5 最高风险假设

| 排名 | 假设 | 类别 | 信心 | 为什么排这里 |
|------|------|------|------|-------------|
| 1 | **V1** — 开发者真的需要 Provider 层面的抽象吗 | 价值 | 2 | 不成立则整个产品不存在理由 |
| 2 | **GTM4** — 6 个月 ≥ 3 个第三方 Provider 实现 | GTM | 2 | 平台生死指标；没有实现 = 空壳 |
| 3 | **ECO1** — 18 个月内不被内置等价功能 | 生态 | 2 | 框架被绑定的终极风险 |
| 4 | **T1** — 一人能扛架构+契约+core+conformance | 团队 | 2 | 执行瓶颈 |
| 5 | **E2** — preset 只是个增强版 .env 文件，不值得独立存在 | 大象 | 2 | 核心价值在 Loader+Registry，不在 preset 本身 |

## 立即下一步行动

1. **5 人开发者访谈**（2 周内）— 验证 V1 + V3 + GTM2，产出书面 pivot 决策规则
2. **2 周技术验证** — 契约草案 + preset example + provider-markdown stub（验证 F1 + U1）
3. **Conformance 骨架搭建** — 一条 KB 契约测试 + 故意破坏验证（验证 U3 + F2）
4. **跨运行时调研** — Claude SDK / LangGraph / DSH 各自的 provider 抽象方式（验证 F3 + ECO1）
5. **Backward-compatibility Policy 草案** — 契约版本号与 breaking change 规则（验证 EQ3）

---

*Charlie Liu 构建。最后更新：2026-09-07。*
