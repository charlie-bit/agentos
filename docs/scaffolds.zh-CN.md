# 从零到有(脚手架)

每个配置面都有脚手架:写出的骨架先经真实 loader 校验,通过后才报告成功。

```bash
agentos preset validate config/presets/example.yml   # 校验组装后的 preset
agentos agents scaffold my-role                      # 角色 yml
agentos workflows scaffold my-flow                   # 五步骤 workflow yml
agentos projects scaffold my-project                 # 项目模板 yml
agentos agents export my-role --out share.yml        # 带走一个角色
```

四者都在名字非法时非零退出、拒绝覆盖,并打印下一条要跑的命令。没有生成器、没有编辑器:文件本身就是产品。
