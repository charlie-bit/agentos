# Examples —— 业务逻辑只住在这里

内核永远不认识领域模型(spec #177)。仓库里一切"业务形状"的东西都在这里,以文件形式存在。全部内容为虚构(R6)。

## 五件套在同一处

`workbench/` 是聚合示例:五个角色、一条按日程触发的 workflow、一个项目模板、一本知识库。

| 面 | 位置 | 为什么是文件 |
|----|------|--------------|
| **角色** | [`workbench/agents/`](workbench/agents) | 角色 = prompt + 工具围栏 + 可选继承;改角色 = 改 yml |
| **Workflow** | [`workbench/workflows/daily-brief.yml`](workbench/workflows/daily-brief.yml) | 五型步骤封闭列表 + 触发器;没有编辑器,没有图存储 |
| **项目** | [`workbench/projects/workbench-demo.yml`](workbench/projects/workbench-demo.yml) | 模板声明项目可用什么;实例是数据,模板在 git |
| **知识** | [`workbench/knowledge/book/`](workbench/knowledge/book) | markdown + git 是唯一真相;kb_search 读,kb_write 草稿写回 |
| **待办** | (运行时) | 由 `todo_*` 工具或 web 创建,存 `.agentos/`,从不进配置 |
| **外部 agent** | [`../scripts/fixtures/echo-mcp-server.mjs`](../scripts/fixtures/echo-mcp-server.mjs) | 外部 agent 是 MCP 工具服务器,只经 yml 挂载 |

## 快速校验

```bash
node cli/main.mjs preset validate examples/workbench/presets/workbench.yml
node cli/main.mjs projects validate examples/workbench/projects/workbench-demo.yml
node cli/main.mjs kb lint examples/workbench/knowledge/book --strict
```

## 单一业务示例

| 示例 | 演示 | 运行 |
|------|------|------|
| [`triage-demo/`](triage-demo/presets/triage-demo.yml) | 事故分诊:两个占位工具服务器 + 知识库 | `preset validate …` |
| [`docs-assistant/`](docs-assistant/presets/docs-assistant.yml) | 纯知识助手 + 两阶段写回闭环 | `preset validate …` |

占位项声明为 `enabled: false` 且端点为 `*.invalid`:只演示形状,不指向真实厂商。模型租约只写 env 名;把 env 指到任意 Anthropic 兼容端点即可运行。

## 做自己的

复制 `workbench/`,重命名 preset,改四个槽位(knowledge / model / tools / entry)与项目模板里的列表。这就是全部上手路径:无脚手架、无生成器、无代码。
