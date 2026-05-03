# Hermes Core 基线快照

创建日期：2026-05-03

这个目录保存 Cowork 当前锁定的 Hermes Agent 代码基线。它用于未来开发出现问题时对照、回档或重新构建固定内核，不作为日常开发目录直接修改。

Cowork 主开发目录已经迁移到 `/Users/lucas/.hermes/hermes-agent/cowork`。这个 `baselines/` 目录仍然只是 Hermes Core 快照，不是 Cowork 运行目录。

## 当前基线

- 快照目录：`baselines/hermes-core/v2026.4.23-927-g58a6171bf`
- 来源目录：`/Users/lucas/.hermes/hermes-agent`
- 来源 commit：`58a6171bfb0ba2ca10b1b08854511736cd77a623`
- 来源版本：`v2026.4.23-927-g58a6171bf-dirty`
- 来源分支状态：`main...origin/main [behind 411]`
- 来源未提交改动：`web/package-lock.json`
- dirty diff sha256：`c0930692aca3033586bf86e606c22e0ce7c90a48ce51871beb228c11d6ddf8fc`
- 快照大小：约 `63M`
- 快照文件数：`2743`

## 快照规则

已复制源码、文档、配置样例、lockfile、license 和运行入口。

未复制以下内容：

- `.git/`
- `node_modules/`
- `web/node_modules/`
- `venv/`
- `__pycache__/`
- `.pytest_cache/`
- `.mypy_cache/`
- `.ruff_cache/`
- `.cache/`
- `dist/`
- `build/`
- `.next/`
- `.DS_Store`
- `*.pyc`
- `.env`

## 回档原则

1. 回档前先备份当前 `/Users/lucas/.hermes/hermes-agent`。
2. 回档只恢复 Hermes Core 代码，不覆盖 Cowork 用户配置、API Key、工作区文件或会话数据。
3. 回档后必须重新运行 Cowork 兼容性复测：Hermes 启动、gateway 连接、模型列表、一次真实对话、一次工具调用、一次人工审批。
4. 如果未来 Cowork 已经实现 Kernel Manager，回档动作应由 Kernel Manager 完成，不再手工执行。
