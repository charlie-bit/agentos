# 编写角色(agent manifest)

角色就是 `config/agents/*.yml` 里的一个文件。它跑在本内核上,不是第二个 agent 运行时(裁决 C:外部 agent 是 MCP 工具,永远不是角色)。

```yaml
kind: agent
version: "1"
name: triage-analyst
# baseAgent: 本仓库内的另一个角色   # 继承;绝不能是 MCP 工具(#418)
systemPrompt: |
  你是 triage-analyst。先读知识库;把后续事项用 todo_add 记录下来,
  而不是只在正文里提一句。
tools: [kb_search, kb_get_page, todo_add]   # 裸工具名 = 本 turn 的围栏
knowledge: local-markdown                   # 可选:限制知识库范围
# model: deepseek                           # 可选:请求级模型
```

## loader 强制的规则

- `systemPrompt` 必填;未知字段与内联密钥一律拒绝。
- `baseAgent` 只能指向同一棵树里的角色;环、悬空名在 validate 期失败,指向工具 manifest 也会被拒。
- `tools` 是裸工具名(`kb_search`、`todo_add`…),构成角色的硬围栏:预批准列表与内核 canUseTool 都会消费它,围栏外调用被拒并落审计。
- `knowledge`/`model` 是 manifest 引用,静态校验。

## 继承语义(#329)

prompt 按 根 → 叶 拼接(子角色在后,措辞冲突时子优先)。tools 取并集去重(root 顺序优先)。`knowledge`/`model` 取最近一层子覆盖。

## 生命周期

```bash
agentos agents scaffold my-role        # 产出骨架,返回前先过真实 loader
agentos agents validate config/agents  # 退出码即结论
agentos agents export my-role --out share.yml
```

角色在启动期挂载。改角色 = 改 yml + 重启(不热插,#188);web 只读展示目录(`GET /api/agents`)。角色后来被删除,已有会话仍保留其角色标签。
