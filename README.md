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

## Hermes 本机路径

当前默认路径在 `apps/api/src/paths.ts` 中：

- `HERMES_BIN`：默认 `/Users/lucas/.local/bin/hermes`
- `HERMES_AGENT_DIR`：默认 `/Users/lucas/.hermes/hermes-agent`
- `HERMES_PYTHON_BIN`：默认 Hermes agent venv 中的 Python

迁移到其他 Mac 时，可以通过环境变量覆盖这些路径。

## 开发文档

- `Hermes_Cowork_开发交接文档.md`
- `Hermes_前端对接版开发文档.md`
- `Hermes_前端开发缺口与MVP计划.md`
- `SOLO_MTC_产品开发文档.md`

## 不提交的本机数据

仓库默认排除了运行数据、录屏拆帧、截图产物、构建产物、`node_modules`、`.env` 和本机工作区内容，避免把个人文件或敏感配置上传到 GitHub。
