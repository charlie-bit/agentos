# Projects：模板与实例

**项目**是角色、workflow 与待办交汇的地方。这里有一条硬边界(裁决 A):模板是配置,实例是数据。

## 模板(配置,git)

`config/projects/*.yml` —— 启动期挂载、走 git 评审、web 只读:

```yaml
kind: project
version: "1"
name: web-revamp
description: Q3 checkout 重写
agents: [triage-analyst, docs-writer]   # 必须存在于 config/agents
workflows: [daily-brief]                # 必须存在于 config/workflows
tools: [mcp-filesystem]                 # tool manifest 名
knowledge: [local-markdown]
```

`agentos projects validate <file-or-dir>` 校验全部引用;骨架用 `agentos projects scaffold <name>`。

## 实例(数据,web 可写)

从模板创建项目会写入一个**实例**到 `.agentos/`:`{id, template, title, 时间戳}`。实例拥有自己的待办、会话与 workflow 运行(均带实例标签)。

**为什么 web 不能改模板?** 否则两个人可以悄悄把"这个项目被允许做什么"分叉掉,审计线索也从可评审的 diff 变成一行数据库记录。模板变更 = 改 yml + PR;实例变更(标题、数据)才是你的。

API 把这条写明:`PATCH /api/project-instances/:id` 只接受 `title`——传 `agents`、`workflows`、`tools`、`knowledge`、`template`、`description` 一律 **400** 并回显字段名。

## 围栏

实例内只能使用模板声明的角色/workflow。围栏 = 模板 ∩ preset 挂载:模板只能收窄,不能放宽。围栏外的角色 turn 与 workflow 触发在服务端被拒,UI 也只列出声明项。

## 生命周期

1. 写模板(或 scaffold)→ `projects validate` → git PR
2. 控制台:选模板、取名、创建实例
3. 加待办(模型或 web)、开角色 turn、触发 workflow
4. 仪表盘展示待办四态计数、最近会话、最近运行
5. 整实例导出(`/export?format=jsonl|md`)或删除——模板仍在
