# Hermes Cowork

Hermes Cowork 是一个本机使用的 Hermes 前端工作台。第一版目标是把 Hermes 的任务执行、模型、MCP、Skills、工作区文件和产物管理做成可视化界面，方便在 macOS 上日常工作。

## 功能范围

- 本地 Web 前端，默认运行在 `http://127.0.0.1:5173`
- 本地 API Adapter，默认运行在 `http://127.0.0.1:8787`
- 对接本机 Hermes CLI / Python bridge
- 管理授权工作区、任务、产物、MCP、模型、Skills
- 展示 Hermes 的执行过程、工具调用、任务进度和参考信息

## 本地运行

```bash
npm install
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

## 开发文档

- `Hermes_Cowork_开发文档.md`

仓库只保留这一份主开发文档。阶段定版、架构体检、后续计划和交接信息都合并到这份文档中，避免后续开发时多份文档互相打架。

## 不提交的本机数据

仓库默认排除了运行数据、录屏拆帧、截图产物、构建产物、`node_modules`、`.env` 和本机工作区内容，避免把个人文件或敏感配置上传到 GitHub。
