# Hermes Cowork

Hermes Cowork 是一个本机使用的 Hermes 前端工作台。第一版目标是把 Hermes 的任务执行、模型、MCP、Skills、工作区文件和产物管理做成可视化界面，方便在 macOS 上日常工作。

## 功能范围

- 本地 Web 前端，默认运行在 `http://127.0.0.1:5173`
- 本地 API Adapter，默认运行在 `http://127.0.0.1:8787`
- 对接本机 Hermes CLI / Python bridge
- 管理授权工作区、任务、产物、MCP、模型、Skills
- 展示 Hermes 的执行过程、工具调用、任务进度和参考信息

## 本地运行

当前主开发目录已经迁移到 Hermes 本机目录内：

```bash
cd /Users/lucas/.hermes/hermes-agent/cowork
```

```bash
npm ci
npm run dev
```

类型检查：

```bash
npm run typecheck
```

前端构建：

```bash
npm run build:web
```

Hermes 消息连接测试：

```bash
npm run test:hermes-connection
```

任务拆解展示测试：

```bash
npm run test:task-decomposition
```

真实 Hermes gateway smoke：

```bash
npm run smoke:hermes-real
```

`test:hermes-connection` 使用 fake gateway，适合每次开发后跑；`test:task-decomposition` 确保右侧任务拆解只使用 Hermes `todo` 计划，不把工具日志伪装成步骤；`smoke:hermes-real` 会调用本机真实 Hermes 和当前模型配置，适合升级 Hermes、修改模型配置或排查 Failed to fetch / 无返回时跑。

## Hermes 本机路径

当前默认路径在 `apps/api/src/paths.ts` 中：

- `HERMES_BIN`：默认 `/Users/lucas/.local/bin/hermes`
- `HERMES_AGENT_DIR`：默认 `/Users/lucas/.hermes/hermes-agent`
- `HERMES_PYTHON_BIN`：默认 Hermes agent venv 中的 Python

迁移到其他 Mac 时，可以通过环境变量覆盖这些路径。

## 代码位置

- 当前 Cowork 主开发目录：`/Users/lucas/.hermes/hermes-agent/cowork`
- 原始历史目录：`/Users/lucas/Documents/Codex/2026-04-26/new-chat`
- 后续开发、提交和推送优先在主开发目录执行，避免两个目录并行修改。

## 开发文档

- `Hermes_Cowork_开发文档.md`

仓库只保留这一份主开发文档。阶段定版、架构体检、后续计划和交接信息都合并到这份文档中，避免后续开发时多份文档互相打架。

阅读顺序：

- 产品判断：先看 `3.1 Cowork 与 Hermes 对应架构图`。这一节包含新手版分层图、术语翻译表和用户操作到 Hermes 后端能力的对应表；再看 `3.2 Hermes 能力覆盖矩阵`、`3.3 开发方案解释区`。
- 继续开发：先看 `3.4 多入口一致性契约`、`5. 关键文件说明`、`10. 常用开发命令`、`11. 后续开发建议`。
- 评估 Hermes 官方 API Server / Runs API 时，先看 `apps/api/src/hermes_official_api.ts` 和 `/api/hermes/official-api`，确认本机 Hermes 源码能力和 8642 API Server 运行状态，再决定是否做并行 adapter。

## 不提交的本机数据

仓库默认排除了运行数据、录屏拆帧、截图产物、构建产物、`node_modules`、`.env` 和本机工作区内容，避免把个人文件或敏感配置上传到 GitHub。
