# 工程实现参考
> 保留目录结构、关键文件、数据结构、API、实现细节、常用命令和已知限制，供开发时查细节。
> 主入口见 [`../Hermes_Cowork_开发文档.md`](../Hermes_Cowork_开发文档.md)。

## 4. 目录结构

```text
.
├── apps
│   ├── api
│   │   ├── src
│   │   │   ├── artifacts.ts
│   │   │   ├── file_preview.ts
│   │   │   ├── hermes.ts
│   │   │   ├── hermes_bridge.py
│   │   │   ├── hermes_gateway.ts
│   │   │   ├── hermes_official_api.ts
│   │   │   ├── hermes_python.ts
│   │   │   ├── hermes_runtime.ts
│   │   │   ├── mcp.ts
│   │   │   ├── models.ts
│   │   │   ├── paths.ts
│   │   │   ├── server.ts
│   │   │   ├── store.ts
│   │   │   └── types.ts
│   │   └── tsconfig.json
│   └── web
│       ├── index.html
│       ├── src
│       │   ├── App.tsx
│       │   ├── features
│       │   │   ├── chat
│       │   │   ├── file-preview
│       │   │   ├── markdown
│       │   │   ├── settings
│       │   │   ├── skills
│       │   │   └── workspace
│       │   ├── lib
│       │   │   ├── api.ts
│       │   │   └── http.ts
│       │   ├── main.tsx
│       │   └── styles
│       │       ├── app.css
│       │       ├── base.css
│       │       ├── chat.css
│       │       ├── file-preview.css
│       │       ├── sidebar.css
│       │       ├── settings.css
│       │       ├── shell.css
│       │       ├── tokens.css
│       │       └── workspace.css
│       ├── tsconfig.json
│       └── vite.config.ts
├── data
│   └── state.json
├── workspaces
│   └── default
├── package.json
└── README/开发文档
```

## 5. 关键文件说明

### 后端

`apps/api/src/server.ts`

- Express 服务入口。
- 提供任务、工作区、文件、产物 API。
- 执行 Hermes 任务，实际入口是 `runHermesRuntimeTask()`。
- 维护运行中任务句柄 `HermesRuntimeHandle`，而不是直接假设每个任务都是一个子进程；停止任务时调用 handle 的 `stop()`。
- 派生 `executionView`。
- 提供工作区文件列表、预览、Finder 定位。
- 提供 `/api/hermes/sessions`、`/api/hermes/sessions/:sessionId`、`PATCH /api/hermes/sessions/:sessionId`、`DELETE /api/hermes/sessions/:sessionId` 和 `POST /api/hermes/sessions/:sessionId/continue`：扫描 `~/.hermes/sessions/session_*.json`，读取 Hermes `state.db.sessions.title`，返回 session 元数据、模型、消息数、更新时间、工具、消息正文和 Cowork 任务关联；重命名和删除都通过 Hermes 原生 `SessionDB` 执行；继续对话会把原生 session 绑定或导入为 Cowork 任务，并标记为显式 resume。
- 提供 `/api/tasks/:taskId/context` 和 `/api/tasks/:taskId/context/compress`：前者读取当前任务对应 Hermes session 的上下文用量，后者调用 Hermes 原生手动压缩能力并把新 session 状态写回任务事件。

`apps/api/src/hermes_sessions.ts`

- Hermes 原生会话 Adapter，已从 `server.ts` 抽离。
- 负责解析 `~/.hermes/sessions/session_*.json`，读取 `~/.hermes/state.db.sessions.title`，归一化 session id、标题、预览、模型、provider、platform、base URL、工具、消息数、更新时间、消息正文和 Cowork 任务关联。
- 对外提供 `readHermesSessions()`、`readHermesSessionDetail()`、`renameHermesSession()`、`deleteHermesSession()`、`normalizeHermesSessionId()` 和 `resolveHermesSessionsDir()`；测试可通过 `sessionsDir` 参数或 `HERMES_COWORK_SESSIONS_DIR` 指向临时目录。
- 写入动作只能通过 Hermes 原生 `SessionDB`：重命名调用 `set_session_title()`；删除调用 `delete_session()`，并在删除前备份 DB 行、messages 和 transcript 文件。

`apps/api/src/file_preview.ts`

- 后端文件预览服务模块，已从 `server.ts` 抽离。
- 对外提供 `readPreviewBody()`、`sendInlineFile()` 和 `sendQuickLookPreview()`。
- 负责文本、Markdown、CSV、HTML、JSON 的正文级预览，PDF、图片、音视频、HTML 等 raw inline 响应的 MIME / Content-Disposition，以及 Office 文件的 macOS Quick Look HTML 高保真预览包生成。
- 后续文件编辑能力必须先扩展这个模块或新增并列 `file_edit.ts`，不要把解析、写入、备份逻辑重新塞回 `server.ts`。

`apps/api/src/hermes_runtime.ts`

- Cowork 与 Hermes 运行时的统一入口。
- 默认 `HERMES_COWORK_RUNTIME=auto`：普通任务优先使用 `tui-gateway`；如果 gateway 不可用，或任务需要预加载 Cowork 选中的 skill，则回退到 `python-bridge`。
- 支持 `HERMES_COWORK_RUNTIME=gateway` 强制使用 gateway，支持 `HERMES_COWORK_RUNTIME=bridge` 强制使用旧 bridge。
- 对 server 暴露统一的 `HermesRuntimeHandle`，让停止任务不依赖具体实现。

`apps/api/src/hermes_gateway.ts`

- Node 侧 Hermes `tui_gateway.entry` JSON-RPC 客户端。
- 按工作区路径维护常驻 gateway 进程，启动环境使用 `TERMINAL_CWD` 绑定授权工作区。
- 支持 `session.create`、`session.resume`、`prompt.submit`、`session.interrupt`、`session.close`。
- 把 Hermes gateway 的 `message.delta`、`message.complete`、`tool.start`、`tool.complete`、`thinking.delta`、`status.update` 等事件归一成 Cowork 的 `HermesBridgeEvent`。
- `thinking.delta` / `reasoning.delta` 不直接透传给前端，避免 token 级思考一词一词闪烁；gateway 会聚合成“正在分析问题边界 / 正在规划下一步 / 正在评估工具结果”等可读阶段事件。
- 从 `message.complete.usage` 合成 `context.updated`，让右侧上下文用量能跟随 gateway 任务更新。

`apps/api/src/hermes_official_api.ts`

- 官方 Hermes API Server 能力探测模块，不是当前任务执行主通道。
- 读取本机固定内核 `/Users/lucas/.hermes/hermes-agent` 下的 `website/docs/user-guide/features/api-server.md`、`gateway/platforms/api_server.py`、`hermes_cli/web_server.py`、`mcp_serve.py`，判断当前 Hermes 源码是否具备 Responses、Runs、Events、Stop、Jobs、Dashboard Sessions/Logs/Skills/Toolsets、MCP session events 等能力。
- 探测官方 API Server 默认 `http://127.0.0.1:8642` 的 `/health`、`/health/detailed`、`/v1/models`。可用 `HERMES_COWORK_OFFICIAL_API_URL`、`HERMES_API_SERVER_URL`、`API_SERVER_HOST`、`API_SERVER_PORT`、`HERMES_COWORK_OFFICIAL_API_KEY`、`API_SERVER_KEY` 覆盖。
- `server.ts` 已开放 `/api/hermes/official-api`，并在 `/api/hermes/runtime` 返回 `officialApi`。
- `apps/api/src/hermes_official_runs.ts` 已经完成并行 adapter 和 fake SSE smoke test。当前确认：Runs API 能覆盖创建任务、文本增量、工具开始/完成、reasoning available、完成/失败和 stop；不能覆盖 Cowork 需要的一等能力：授权工作区绑定、危险命令审批、任务澄清反问。

`apps/api/src/hermes_official_runs.ts`

- 官方 Runs API 并行适配层，不是当前主任务通道。
- `runHermesOfficialRunsTask()` 会调用 `/v1/runs` 创建任务，再订阅 `/v1/runs/{run_id}/events`，把官方 SSE 事件转成 Cowork 统一事件。
- `stopHermesOfficialRun()` 会调用 `/v1/runs/{run_id}/stop`，用于验证官方停止能力。
- `officialRunsCoverage()` 明确记录当前覆盖缺口：官方 Runs API 当前没有可靠工作区绑定、审批、澄清协议，所以不能直接替换 `tui_gateway`。

`apps/api/src/hermes_bridge.py`

- Python bridge，当前定位是回退通道和少数深度兼容通道。
- 使用 Hermes 自带 venv 启动。
- 通过 `HermesCLI` 加载 Hermes 配置、provider、model、fallback、credentials。
- 初始化 `AIAgent`。
- 通过 NDJSON 事件回传给 Node。
- 需要预加载 Cowork skill 内容时仍走 bridge，因为 Hermes `tui_gateway` 当前没有 Cowork 自定义 skill 预载参数。

当前事件前缀：

```text
HC_EVENT\t
```

已回传事件：

- `bridge.started`
- `step`
- `thinking`
- `status`
- `message.delta`
- `message.stream_end`
- `tool.progress`
- `tool.started`
- `tool.completed`
- `context.updated`
- `context.compressed`
- `task.completed`
- `task.failed`

`apps/api/src/hermes_python.ts`

- Node 侧启动 `hermes_bridge.py`。
- 解析 `HC_EVENT` 事件。
- 返回 `finalResponse`、`sessionId`、`stdout`、`stderr`、`events`。
- 额外提供 `runHermesContextCommand()`，只用于上下文读取和压缩，不创建新的用户任务。
- Node 侧最终会对事件做二次增强：给工具事件补 `category` / `summary`，并从 stdout/stderr 中推断网页调研、文件读写、命令执行、MCP/工具调用和错误事件。推断事件会标记 `synthetic: true`，避免依赖 Hermes 当前 callbacks 暴露程度。
- Node 侧会生成 `executionView.activity` 作为前端主对话区的稳定展示层：它只包含桥接状态、推理轮次、思考摘要、工具/文件/搜索、产物、完成/失败/停止等用户可理解事件；`reasoning.available` 等内部进度不会作为工具展示，Hermes 原始思考动效文案会归一成“正在思考”。
- 如果 Hermes bridge 以非 0 退出，Node 侧必须优先读取 `task.failed.error` / `status` 事件里的真实后端错误，再退回 stderr；不能只显示 `(Hermes 没有返回内容)`。错误进入 `task.error`、对话消息和 `executionView.errors` 前要做密钥脱敏，避免 API Key 片段泄露。

`apps/api/src/store.ts`

- 本地 JSON 状态管理。
- 默认状态文件：`data/state.json`
- 默认授权工作区：`workspaces/default`

`apps/api/src/artifacts.ts`

- 任务前后文件快照。
- 扫描新增/修改文件并作为产物归属到任务。
- 支持常见办公与报告产物：docx、pdf、pptx、xlsx/xls/xlsm、csv/tsv、md/markdown、html、图片、json/jsonl、txt/log、yaml/xml、zip 等；超过 200MB 的文件不会自动挂为任务产物。
- 任务结束后会为每个识别到的产物追加 `artifact.created` 事件，前端“最近操作”和执行轨迹会把它当成文件阶段展示。

`apps/api/src/skills.ts`

- 扫描本机 skill：
  - `~/.agents/skills`
  - `~/.codex/skills/.system`
  - `~/.codex/plugins/cache`
  - `data/uploaded-skills`
- 解析 `SKILL.md` frontmatter 中的 `name` 与 `description`。
- 支持上传单个 `SKILL.md` 到 Cowork 本地目录。
- 支持列出 skill 目录内的文件和子文件，并安全读取 skill 根目录内的文本文件。
- 启用的 skill 名称会作为 Cowork 执行上下文传给 Hermes；被“使用技能”选中的 skill 会通过 bridge 预载完整内容。

`apps/api/src/models.ts`

- 读取 Hermes 当前默认模型、provider、base_url、api_mode、fallback、config/env 路径，不读取或展示 API 密钥。
- 解析 `hermes status` 和 `hermes auth list` 的模型凭据状态，返回 API key/OAuth/凭据池是否可用，但不返回 token/key 值；Hermes 原始英文状态会在后端转成中文摘要。
- 聚合 Hermes Provider、当前 custom endpoint、`custom_providers` 和 Cowork 本地模型选项，形成模型设置页的 Provider/模型候选列表；Provider 与模型候选优先读取 Hermes 内置 `hermes_cli.models.CANONICAL_PROVIDERS` 和 `_PROVIDER_MODELS`，同时合并 Cowork 已知版本补充（如 Xiaomi `mimo-v2.5-pro`），避免 Hermes 本机包或 Cowork 静态清单任一方滞后。
- 模型目录面向用户侧只展示中国大模型供应商：Xiaomi MiMo、Qwen OAuth、DeepSeek、Z.AI/GLM、Kimi/Moonshot、MiniMax、Alibaba DashScope；已有当前配置会保留显示，避免隐藏用户正在使用的服务。
- 支持“刷新官网模型”：后端重新读取 Hermes 内置模型目录，并抓取供应商公开页面补充新版本；当前已接入 Xiaomi MiMo 官网解析，刷新结果会写入 `data/model-catalog-supplements.json`，后续 `/api/models` 会自动合并这些补充模型。
- 支持把模型候选写回 Hermes `config.yaml` 的 `model.default`，写入前自动生成 `config.yaml.cowork-backup-*` 备份。
- 支持在 Cowork 内直接配置 Hermes 模型服务：服务商、默认模型和 API 模式会写入本机 Hermes `config.yaml` 的 `model` 配置块；DeepSeek、Xiaomi MiMo、MiniMax、Kimi、Z.AI/GLM、Alibaba 等 Hermes 原生 API Key 供应商的 Key 写入 `~/.hermes/.env` 对应环境变量（如 `DEEPSEEK_API_KEY`、`XIAOMI_API_KEY`），Base URL 同步写入对应 `*_BASE_URL`；写入前自动备份 `config.yaml`，API Key 不在前端回显。
- 配置模型服务或修改 Hermes 长期默认模型成功后，Cowork 会把本次任务模型切回 `auto`，确保后续对话跟随刚保存的 Hermes 默认模型，而不是继续沿用旧的临时模型选择。
- `custom_providers` 中名称与中国内置供应商相同的配置会合并回原供应商展示，例如 `xiaomi` 不再显示成 `custom:xiaomi`。
- 前端模型设置页打开或切换到“模型”时会自动刷新后端状态，并在展示层再次合并 `custom:<provider>` 与同名内置供应商，避免旧弹窗状态残留出两个 Xiaomi。
- 支持管理 Hermes `fallback_providers`，写入前自动生成 `config.yaml.cowork-backup-*` 备份；关闭备用模型时写回空列表。
- 模型设置页已从配置后台收敛为“用户能力”页面：默认展示 Hermes 默认大脑、本次任务临时模型、备用路线和模型服务状态；长期默认模型可写回 Hermes `config.yaml`，本次任务模型只影响 Cowork 发起的新任务，Provider/Base URL/凭据状态统一收进高级折叠区。
- 维护 Cowork 本地模型选项和当前选中模型。
- `Hermes 默认模型 · <当前模型>` 表示不传 `--model`，完全跟随 Hermes 当前 `config.yaml` 与路由。
- 底部模型入口不是单纯的模型列表，而是“本次运行参数”入口：模型选择只展示已配置模型，思考强度直接写入 Hermes `agent.reasoning_effort`，可选值按用户语言映射为“智能/低/中/高/超高”；“显示原始思考”直接写入 `display.show_reasoning`。不要在前端做未接后端的速度或 thinking 假开关；速度类体验由低思考强度间接实现。
- `agent.reasoning_effort` 的后端真源来自 Hermes 官方配置，支持 `none/minimal/low/medium/high/xhigh`；Cowork 当前主入口展示用户最常用的 5 档，保留已有配置读取能力，后续若做高级模式再暴露 `none/minimal`。
- 模型运行失败排查顺序：先看 `task.failed.error` 是否为 401/认证失败，再看 `hermes auth list` 的 provider 凭据池状态，最后才检查模型 ID/Base URL。DeepSeek 和 Xiaomi MiMo 这类多 provider 场景下，切换底部“本次任务模型”不会自动修复 provider 凭据；如果 Hermes 返回 401，用户需要在模型设置里重填对应 provider 的 Key/Plan Key。

`apps/api/src/hermes_update.ts`

- Hermes 当前版本会作为 Cowork 固定 Agent 内核管理；Cowork 后端负责做 Kernel Manager、Adapter、配置备份、版本锁定、补丁记录和兼容性复测。
- 读取本机 Hermes 版本、当前 tag/commit、GitHub 最新 tag、落后提交数、工作树是否有未提交改动。
- 维护 Cowork 已验证 Hermes 基线 tag，给前端返回“可继续使用 / 升级前需复测 / 暂不建议升级”的兼容性判断。
- 提供自动复测接口：检查 `hermes version/status`、Cowork 模型 Adapter、MCP Adapter，并通过 `runHermesPythonBridge` 发起一个真实 Hermes 小任务，验证模型、session 和事件桥接链路。
- 更新区域只做检测、自动复测和升级前守卫，不自动运行 `hermes update`；真正升级前必须先备份 Hermes 配置并跑模型、MCP、session、流式事件的 smoke test。

`apps/api/src/hermes_dashboard.ts`

- 官方 Hermes Dashboard adapter，默认连接 `http://127.0.0.1:9120`，可用 `HERMES_COWORK_DASHBOARD_URL`、`HERMES_COWORK_DASHBOARD_HOST`、`HERMES_COWORK_DASHBOARD_PORT` 覆盖。
- `readHermesDashboardAdapterStatus()` 只探测或按需启动 `hermes dashboard --no-open`，返回版本、config 版本、gateway 状态、active sessions 和受保护 API 是否可读。
- `requestHermesDashboardJson()` 从 Dashboard HTML 提取 `window.__HERMES_SESSION_TOKEN__`，并用 `X-Hermes-Session-Token` 代理官方 `/api/*` JSON 接口；token 只缓存于 Cowork 后端内存。读取型调用可以传 `{ start: false }`，避免为了刷新页面状态而悄悄启动 Dashboard。
- `server.ts` 已开放 `/api/hermes/dashboard`、`/api/hermes/dashboard/start` 和 `/api/hermes/dashboard/official/{status,skills,toolsets,cron/jobs,sessions,config,env,model-info}`。
- 当前只代理只读接口；后续开放写入类接口前必须补 UI 决策、配置备份、错误恢复和测试，不能直接把 Dashboard 全量权限暴露给前端。

`apps/api/src/mcp.ts`

- 只读解析 Hermes 的 `/Users/lucas/.hermes/config.yaml`。
- 读取 `mcp_servers` 段并返回服务名称、传输方式、启动命令、参数、地址、认证方式、Header 名称、环境变量名。
- 为已配置 MCP 生成展示元数据：按名称、命令、参数和地址推断图片图标与中文功能描述；技术配置仍在详情里展示。
- 不返回环境变量值、Header 值和密钥值；前端只展示环境变量名/Header 名称，并标注敏感值已隐藏。
- 通过 `hermes mcp test <name>` 测试单个 MCP 服务，返回连接状态、耗时、工具数量和脱敏后的测试输出。
- 支持启用/禁用写回：只修改指定服务配置块内的 `enabled: true/false`，写入前会生成 `config.yaml.cowork-backup-*` 备份。
- 支持 GitHub 市场搜索：按关键词搜索 MCP 服务候选，返回仓库信息、星标、语言、推荐 Hermes 安装命令、命令置信度、图片图标和中文功能描述。
- 支持 Hermes 原生 MCP 添加：前端填写名称、连接方式、命令/参数/URL/环境变量，也支持 Hermes `--preset`、HTTP/SSE OAuth 和 Header 认证配置；后端优先调用 `hermes mcp add`，必要时受控写入配置，写入前备份，成功后自动测试。
- 已取消 Cowork 自建 MCP 市场和 GitHub 搜索安装；MCP 能力来源以 Hermes 官方 `mcp add/list/test/configure/login/serve` 为准，后续如有官方 Hub/API 再接入。
- 支持编辑已安装 MCP：前端复用配置弹窗，服务名锁定，命令/参数/URL/认证方式可修改；环境变量和 Header 值默认不回显，留空时保留原 `env`/`headers`，填写新值时替换对应配置；后端直接更新对应配置块，写入前备份，写入后自动测试。
- 支持工具级选择：前端在 MCP 详情里根据 `hermes mcp test <name>` 发现的工具列表生成开关；后端写入 `mcp_servers.<name>.tools.include/exclude`，等价覆盖 `hermes mcp configure <name>` 的核心配置能力，写入前备份，配置在新会话生效。
- 支持删除 MCP：前端删除按钮调用后端，后端备份配置后执行 `hermes mcp remove <name>` 并刷新列表。
- 支持工具列表展示：`hermes mcp test <name>` 输出中的工具名和说明会解析成结构化列表，在 MCP 详情里展示。
- 支持 `hermes mcp serve -v` 控制台：后端可启动/停止由 Cowork 管理的 Hermes stdio MCP Server 诊断进程，返回 PID、启动命令、工作目录和最近 stdout/stderr/system 日志；前端 MCP 设置页显示运行状态和日志。注意：这是 stdio MCP Server，外部 MCP Client 通常仍需配置同一条启动命令，而不是连接 HTTP 端口。
- 支持 macOS 常驻后台：设置页启用后只写入 `com.hermes-cowork.api.plist`，用于登录时启动 Hermes Cowork API 后台；旧版 `com.hermes-cowork.daily-mcp-ai.plist` 会在安装/卸载后台服务时清理。
- 支持 Hermes Cron 管理：`/api/hermes/cron` 优先读取 Hermes 官方 Dashboard `/api/cron/jobs`，Dashboard 不可用时回退本机 `~/.hermes/cron/jobs.json`；新增/编辑/暂停/恢复/排队运行/删除都通过 Hermes 自己的 `cronjob` 工具函数落到 Hermes cron，输出读取 `~/.hermes/cron/output/<job_id>/`。
- 支持 Hermes Skills 官方真源：`/api/skills` 优先读取 Hermes Dashboard `/api/skills`，把官方启用状态合并到 Cowork 技能页；本机扫描 `~/.hermes/skills`、用户 skills、Codex 插件 skills 和上传 skills，用于展示 `SKILL.md` 及子文件。启停由 Hermes 官方 `/api/skills/toggle` 写回，Dashboard 不可用时才保留本地扫描兜底。
- 支持 Hermes Skills Hub 原生生态：`/api/skills/hub` 直接调用固定 Hermes 内核里的 Skills Hub，读取 official、skills.sh、well-known、GitHub、ClawHub、LobeHub 等来源；`/api/skills/hub/install` 调用 `hermes skills install <identifier> --yes` 安装到 Hermes 本机技能目录。Cowork 技能页只负责展示、筛选、确认和刷新，不维护第二套 Skill 市场数据。
- 支持 Hermes Toolsets 官方真源：技能页新增“工具集”子页，读取 Hermes Dashboard `/api/tools/toolsets`，展示 Hermes 内置工具集、中文说明、启用状态、凭据配置状态和工具列表。启停通过 Cowork 后端读取 `/api/config` 后受控写回 `platform_toolsets.cli`，并保留已有 MCP server 名称，避免 `hermes-cli` 复合工具集覆盖用户选择。

### 前端

`apps/web/src/App.tsx`

- 主 UI。
- 仍是应用壳和主要状态容器，但已经把 file-preview、markdown、workspace、chat、settings/models、settings/mcp、skills 的核心视图、状态和部分 API 边界拆到 feature 模块；当前不要再把文件编辑、模型设置、MCP 设置、技能管理等重功能直接堆回 `App.tsx`。
- 三栏布局：
  - 左侧：品牌、新建任务、工作区目录树、工作区内会话、技能、定时任务、调度、底部本机偏好入口；工作区是授权目录入口，不是普通筛选器。
  - 中间：当前轮对话、最终回答、轻量过程摘要、输入框、上传附件。输入框不能膨胀成主画布，默认保持三行左右的可写高度；输入框底部操作按桌面工具条处理，工作区、模型、发送等高频动作优先 icon 化，完整含义放在 `title/aria-label`。
  - 右侧：只默认展示任务拆解、任务产出物、上下文与资源。Hermes Session、运行时、原始日志、标签编辑、导出等维护入口不作为默认静态卡片展示。
- 左侧一级导航已收敛为：新建任务、工作区目录树、技能、定时任务、调度、本机偏好。搜索和模板暂不放主导航，避免和工作区会话树重复。
- 左侧工作区已经回到目录树结构：工作区行代表授权文件夹，展开后展示该工作区内的工作会话；点击工作区进入文件管理页，点击会话进入对话页。
- 搜索页：支持搜索任务标题、prompt、错误、Hermes session、执行结果、技能名和标签；当前作为内部能力保留，暂不在左侧主入口展示。
- 定时任务页：已升级为 Hermes Cron 管理页，展示真实 job 列表、gateway 自动执行状态、下次执行、绑定工作区/Skill、最近输出，并支持新建、编辑、暂停/恢复、排队运行和删除。这个页面只解释“哪些任务会按时间执行”和“自动执行是否开启”；Cowork 后台保活属于系统设置，MCP 生态能力属于技能页 > MCP 服务，不再混在定时任务主页面里。
- 工作区页：点击左侧工作区进入，展示该授权目录的文件管理、最近会话、最近产物和可执行入口；项目页/搜索页只作为高级管理和跨工作区检索入口。
- 工作区第一阶段已落地：左侧工作区以目录树展示，工作区下挂活跃会话；点击工作区进入文件管理页，点击会话进入对话页；“授权文件夹”通过本机 API 调 macOS Finder 选择目录，不再展示手动路径输入表单。
- 工作区第二阶段已落地：后端新增目录树、重命名、重新授权和移除工作区 API；文件管理页接入面包屑、当前目录搜索、文件夹进入、文件预览、Finder 定位和作为上下文发送。移除工作区只删除 Cowork 记录和该工作区会话索引，不删除真实文件；`.DS_Store`、`.gitkeep` 等系统占位文件默认不展示。
- 调度页：根据真实 MCP 服务、Hermes 工具集和已启用 lark skills 汇总网页浏览器、飞书办公、数据与文件三类能力，并跳转到技能页的“工具集”或“MCP 服务”子页。
- 任务模板页：补充中文办公模板，覆盖文件整理、文档生成、飞书办公、数据分析、网页调研，并支持分类筛选。
- 技能页：按 Cowork 产品参考图拆成 `技能 / MCP 服务 / 工具集` 三个子页。技能读取真实本机 skill，支持搜索、市场/已安装切换、启用/停用、上传 `SKILL.md`；MCP 服务读取真实 Hermes MCP 配置；工具集读取 Hermes Dashboard 官方 `/api/tools/toolsets`，并通过 Cowork 后端受控写回 Hermes `platform_toolsets.cli`。顶部已新增“能力中心”总览，把工作方法、外部服务和内置工具的启用数量、配置风险和下一步入口放在同一层级，避免用户在三套概念之间来回猜。
- 技能详情弹窗：点击技能卡片后，可查看该 skill 的 `SKILL.md` 和配套子文件内容，并可将该 skill 加入下一次任务的预载技能。
- 对话区内联执行轨迹：用户消息后展示 Hermes 的“查看详情”，包含思考摘要、状态、工具/搜索/文件操作和完成/失败事件；当前阶段只在外层突出显示最后一条活动，完整过程默认折叠到“查看过程记录”，避免思考、工具和答案挤在一起。
- 对话区执行轨迹优先消费后端 `executionView.activity`，而不是只在前端从原始 `events` 猜测；旧事件推断逻辑只作为兼容回退。
- 任务状态卡：运行中展示实时同步提示；完成、失败、停止后收敛成轻量状态条，只保留状态、工作区、耗时、模型、Hermes Session、产物与引用，以及继续追问、重新运行、归档、删除等入口，不再把最终答案复制成顶部摘要卡。
- 对话历史降噪：任务完成后保留最后一次用户提问和最终 Hermes 回复作为主线内容，较早对话收进“较早对话”；最终答案不再折叠进过程记录，也不再只依赖顶部卡片展示。
- 对话正文 Markdown 渲染已升级为标准管线：前端使用 `react-markdown + remark-gfm` 渲染 Hermes 回复和 Markdown 文件预览，支持标题、分隔线、表格、任务列表、删除线、自动链接、嵌套列表和代码块；不渲染原始 HTML，链接只允许 `http/https/mailto`、站内相对路径和锚点，避免模型输出的 HTML/JS 在前端执行。
- 运行中过程展示已升级：运行中的 Hermes 回复区会固定显示“实时执行”面板，展示当前思考/规划、工具行动、文件/网页活动和步骤条；最终答案未开始输出时也要明确告诉用户“过程先在上方实时更新”。运行中不再依赖上方折叠过程记录。
- 任务停止：运行中的任务可在对话区 pending 消息和右侧“任务进度”直接停止；后端会向 Hermes 子进程发送 `SIGTERM`，记录 `task.stopped` 事件，并避免子进程退出码把用户主动停止误判为失败。
- 任务实时流：后端新增 `/api/tasks/:taskId/stream` SSE 事件流；前端选中运行任务时自动订阅该任务快照，实时更新 live response、执行轨迹、工具事件、产物和停止/完成状态，原轮询机制保留为兜底。运行消息和右侧任务总览会显示“连接中 / 实时同步 / 轮询兜底”等状态，帮助用户判断当前是否实时连接 Hermes。
- 输入框底部模型切换：默认项跟随 Hermes 当前模型，另支持显式选择当前供应商、fallback 供应商和已配置模型服务下的模型候选；候选必须来自 `/api/models`，不能单独读取旧的本次任务模型清单；创建任务时把选中模型传给后端。
- 输入框附件第一版已落地：支持从对话框选择或拖入 PPT、Word、Excel/CSV、PDF、图片、Markdown/TXT 等主流文件；文件会先进入本轮对话附件区，再上传到当前授权工作区，输入框展示附件 chip；发送任务时附件写入 `Message.attachments`，并把本机路径附加到 Hermes 实际 prompt 中。对话流里的用户消息会显示附件卡片；未点击时只作为流式对话中的轻量文件卡片存在，点击后右侧工作区切换为文件预览。
- Hermes 回复中的文件展示分两层：真实任务产物在最新 Hermes 回复下方显示为文件卡片；正文里只是提到或引用某个文件名时，文件名渲染为彩色文件引用，不再用普通灰色代码样式。能匹配到当前任务附件、产物或工作区文件的引用应可点击并打开右侧预览。
- 对话区显示规则：Cowork 不机械复刻 Hermes 的 Markdown 结构，而是按信息类型选择组件。文件清单、上传确认、产物列表必须展示为文件卡片；正文里的单个文件名展示为彩色文件引用；只有真正需要二维比较、指标矩阵或结构化数据分析时才保留 Markdown 表格。前端会识别“文件名/类型”这类文件清单表格并转成文件卡片，避免用户在对话里阅读无意义表格。
- 对话文件卡片已升级为可操作对象：主区域点击打开右侧预览，右侧图标提供“本机应用打开”“Finder 定位”“作为下一轮上下文”。这套动作同时覆盖用户附件、Hermes 输出产物和正文中能匹配到的文件引用；不能匹配到真实文件的引用仍只展示为被动文件卡，不暴露无效操作。
- 文件预览交互第一版已按“对话流卡片 -> 右侧预览区”收敛：点击附件、工作区文件或任务产物后，右侧任务上下文让位给预览区；预览顶部提供框选批注、本机默认应用打开、Finder 定位、固定预览、全屏预览和关闭。固定预览用于避免切换目录时自动收起，关闭预览会恢复右侧工作区。预览顶部不再放“作为上下文”“复制路径”等低频文字按钮。
- 文件预览批注第五版已落地：点击顶部批注按钮后，在当前预览文件上拖拽框选区域，Cowork 自动生成“批注 1/2/3”编号和区域框；批注会进入输入框上方的批注 chip。批注卡片内支持可选补充说明，适合写“重点看这块”“帮我改这里”“这里信息不对”等简短指令；这段说明会写入 `Message.annotations[].note`，并进入 Hermes 实际 prompt。框选完成时前端会尝试从当前预览 DOM 和同源 iframe 中自动提取被框选文字，写入 `Message.annotations[].selectedText`。如果没有可读选区文本，后端会在保存批注时读取同一文件的正文预览，生成 `contextExcerpt` 作为辅助定位摘录。发送任务时后端校验文件仍在授权工作区内，并把批注编号、文件路径、预览类型、区域坐标、用户补充说明、选区文本或正文摘录写入 Hermes 实际 prompt。用户可以不输入说明，但需要表达额外意图时可以直接在批注卡里写。
- 文件批注当前边界：PDF、Word、Excel/PPT 等仍先走统一预览坐标框选；如果浏览器 PDF viewer 或 macOS Quick Look 不暴露 DOM 文本，Cowork 可以给 Hermes 补正文摘录，但仍无法稳定知道该区域对应的原文段落、单元格或幻灯片对象。后续要分类型升级：PDF 绑定页码和文字选区，HTML 绑定 DOM 选区，Word 绑定段落/页，Excel 绑定工作表和单元格范围，并补充区域截图裁片。
- 文件预览布局稳定性已修正：右侧预览打开时会自动保证预览列的最小可用宽度，`app-shell`、中间工作区、右侧 inspector 和预览面板统一锁定在视口高度内滚动，避免外层页面和预览内层同时滚动导致出界、底部抖动或宽度跳动。
- 右侧任务上下文：默认顺序固定为任务拆解、任务产出物、上下文与资源。任务拆解不能写死固定五步，只能展示产品级计划：少量、面向用户目标、能表达“先做什么、再做什么、交付什么”的步骤。Hermes `todo` 如果只是运行清单（例如读取文件、调用工具、检索资料、整理结果，或超过 6 步的操作流），必须放到对话区过程流，不进入任务拆解。Hermes 未暴露产品级拆解时，任务拆解显示空态，不能再从 thinking/status/tool/artifact/complete 事件推导假步骤。工具调用、网页、文件、Skill 归入“上下文与资源”或过程记录，不污染任务拆解。Plan、ReAct、Reflection、Result 只作为每步后面的中文小标签（计划/行动/校验/结果），不能在顶部铺成静态模式条；表情化 thinking、后台心跳、`The user is`、`reasoning.available`、`Hermes 已返回最终结果` 等原始事件不能作为用户可见步骤或说明。
- 左下角本机偏好菜单：点击 Lucas 弹出本机菜单，可切换语言展示项、循环切换主题、进入设置弹窗；点击菜单外空白区域会关闭。
- 设置弹窗：包含本机、通用、外观、MCP、模型、对话流、外部应用授权、运行环境、命令、规则、关于等分类；外观页是主题后台，负责主题模式、强调色、浅色背景/前景、字体、字号、半透明侧栏和字体平滑；运行环境页展示 Cowork 本机后端和 Hermes 官方后台状态；通用、模型、对话流、规则页已按录屏补齐基础控件和本地交互骨架。MCP 页拆成“本地服务 / Hermes Server / 云端”三个二级 Tab，分别承载服务管理、`hermes mcp serve` 控制台和未来云端配置。
- 关于页新增 Hermes 后台更新区：读取本机 Hermes 版本、GitHub 最新 tag、Cowork 已验证基线、工作树状态和基础检查结果，先做升级风险判断；页面默认只展示升级结论、检查更新、运行复测和自动更新入口，版本路径、基础检查、升级建议、复测明细和命令输出全部收进折叠诊断区，避免后台信息铺满主界面。静态可见信息必须是用户可决策信息：当前无需更新且复测通过时显示“当前很好，无需操作”，本机仓库改动等维护信息只放在诊断详情；旧自动更新失败结果如果被新的成功复测覆盖，不再继续挂红色卡片。
- 设置弹窗已补响应式与内部滚动规则：桌面下固定弹窗高度、面板独立滚动；窄窗口下侧栏折为顶部网格，模型/MCP/定时任务等卡片栅格自动降列，避免内容撑出屏幕。
- 界面语言规范：Hermes Cowork 的按钮、标题、状态、表头、空状态和说明文案默认使用简体中文；GitHub、MCP、Hermes、OpenAI 等品牌/协议名、配置键、命令行片段和第三方返回内容可保留原文。
- 输入框键盘操作：`Enter` 发送，`Shift + Enter` 换行；点击“新建任务”和模板卡片后会自动聚焦输入框。

`apps/web/src/features/app/appStateApi.ts`

- 全局 App state API service，已从 `apps/web/src/lib/api.ts` 抽离。
- 负责读取 `/api/state`，即工作区、任务、消息、产物、skill 设置和模型设置的聚合快照。
- 后续扩展“局部 state patch / 增量刷新 / 多窗口同步 / 本地缓存恢复”时，先在这里确认 API 边界，再由 `useAppState.ts` 消费。

`apps/web/src/features/app/useAppState.ts`

- 全局 App state hook，已从 `App.tsx` 抽离。
- 负责 `AppState`、当前工作区、当前任务、刷新后默认任务选择、工作区 fallback 和相关 ref 同步。
- 后续修复“刷新后跳错会话”“工作区删除后选中状态异常”“多入口选中任务不同步”时，优先检查这里和 `useTaskSelection.ts`。

`apps/web/src/features/app/useAppBootstrap.ts`

- 应用启动初始化 hook，已从 `App.tsx` 抽离。
- 负责首轮加载 Hermes runtime、更新状态、Hermes sessions、MCP、MCP serve、MCP 推荐、后台服务、Skills 和 Models。
- 后续修复“打开应用初始数据没加载”“启动时多个模块刷新顺序不清楚”“后台服务状态初始展示异常”等问题时，优先检查这里。

`apps/web/src/features/layout/usePanelLayout.ts`

- 三栏布局状态 hook，已从 `App.tsx` 抽离。
- 负责左右侧栏折叠状态、左右面板宽度、拖拽调整、窗口 resize 后的宽度约束和本地持久化。
- 后续继续优化“两个侧栏隐藏后主对话区与右侧工作区比例”“三栏自动适应区域大小”“拖拽手感和最小宽度”时，优先改这里和 `apps/web/src/styles/shell.css`。

`apps/web/src/features/layout/AppSidebar.tsx`

- 左侧栏组件，已从 `App.tsx` 抽离。
- 负责品牌区、新建任务入口、工作区树、技能/定时任务/调度入口和本机偏好菜单展示。
- 只通过 props 消费任务、工作区、本机偏好菜单和导航动作；后续调整左侧栏层级、入口排序、工作区会话展示时，优先改这里和 `SidebarWorkspaceNode.tsx`。

`apps/web/src/features/layout/SecondaryViews.tsx`

- 次级页面组件集合，已从 `App.tsx` 抽离。
- 负责搜索页、调度页、任务模板页，以及模板图标渲染。
- 后续调整“任务搜索”“调度入口能力归类”“任务模板沉淀方式”时，优先改这里；不要把这些次级页重新写回 `App.tsx`。定时任务已经迁移到 `features/scheduled`。

`apps/web/src/features/scheduled/`

- 负责 Hermes Cron 定时任务页、Cron API service 和定时任务状态 hook。
- 后续调整定时任务列表、新建/编辑弹窗、周期选择器、Skill 类目多选、Cron 输出展示、gateway 状态提示和每日 MCP 推荐迁移时，优先改这里。

`apps/web/src/features/file-preview/FilePreviewPanel.tsx`

- 前端文件预览 feature 模块，已从 `App.tsx` 抽离。
- 对外导出 `FilePreviewPanel`、`Preview`、`FilePreviewTarget`、`FilePreviewState`、`previewKind()`、`isInlinePreviewKind()`。
- 负责文件详情面板、PDF/HTML/image/media iframe 或原生预览、Office Quick Look iframe、Markdown/CSV/表格预览、拖拽框选批注，以及预览顶部轻量操作栏（批注、本机打开、Finder 定位、下载、固定、全屏、关闭）。
- 后续文件编辑 UI 先在这个 feature 里扩展“查看 / 编辑 / 历史”，再通过后端文件 API 写入，不要在 `App.tsx` 里新增编辑器。

`apps/web/src/features/file-preview/useFilePreview.ts`

- 文件预览状态 hook，已从 `App.tsx` 抽离。
- 负责打开任务产物预览、打开工作区文件预览、inline 文件直接就绪、文本预览请求、预览错误状态和关闭预览。
- 后续做“主流文件高保真预览”“可编辑文件”“预览刷新/保存后回写”时，优先从这里扩展预览状态机。

`apps/web/src/features/file-preview/artifactApi.ts`

- 任务产物 API service，已从 `apps/web/src/lib/api.ts` 抽离。
- 负责 artifact 下载 URL、raw URL、本机默认应用打开、Finder reveal 和正文预览请求。
- 后续扩展“产物重命名 / 产物删除 / 产物版本 / 文件编辑后的产物刷新”时，先在这里确认 API 边界，再由 file-preview、workspace 和右侧任务产物卡消费。

`apps/web/src/features/markdown/MarkdownContent.tsx`

- Markdown 渲染模块，已从 `App.tsx` 抽离。
- 统一使用 `react-markdown + remark-gfm`，并保留链接白名单，避免模型输出 HTML/JS 被执行。
- 对话正文和文件预览都应复用这个组件；对话正文可传入 `fileReferences`，将 inline code 中的文件名渲染为彩色文件引用并支持点击预览。

`apps/web/src/features/workspace/SidebarWorkspaceNode.tsx`

- 左侧工作区树节点模块，已从 `App.tsx` 抽离。
- 负责工作区标题、会话列表、归档折叠、打开文件夹、重命名、重新授权、刷新、删除等入口展示。
- 只通过 props 接收工作区、当前任务、展开状态和回调，不直接访问全局状态，后续可继续下沉到 workspace feature。

`apps/web/src/features/workspace/ProjectsView.tsx`

- 工作区文件管理页模块，已从 `App.tsx` 抽离。
- 负责点击工作区后的主页面：授权目录标题、文件区、会话区、产物区、其他工作区切换、文件预览侧栏。
- 只接收工作区、会话、产物、文件树、预览状态和回调；页面内不直接请求后端，后续再把工作区数据加载拆到 API service/hook。

`apps/web/src/features/workspace/WorkspaceBrowser.tsx`

- 工作区文件浏览器模块，已从 `App.tsx` 抽离。
- 负责面包屑、搜索、文件/文件夹列表、创建文件夹、上传、删除、打开预览等 UI。
- 后续文件编辑、版本历史和 Finder 打开都应从这里进入文件预览/编辑 feature，不要重新在 `App.tsx` 写一套文件列表。

`apps/web/src/features/workspace/previewTargets.ts`

- 工作区和产物预览目标转换模块，已从 `App.tsx` 抽离。
- 统一把 `WorkspaceFile` / `Artifact` 转成 `FilePreviewTarget`，并集中维护 raw URL 生成逻辑。
- 后续新增文件编辑、下载、打开外部应用时，先复用这个 preview target contract。

`apps/web/src/features/workspace/workspaceApi.ts`

- 工作区前端 API service，已从总 `lib/api.ts` 分离。
- 负责授权/重新授权工作区、移除工作区、上传文件、读取 flat 文件列表、读取目录树、本机默认应用打开、Finder 显示、workspace 文件 raw URL 和预览内容读取。
- 后续文件编辑写入、历史版本、权限检查、目录批量操作都优先加在这里，而不是回到总 `lib/api.ts`。

`apps/web/src/features/workspace/useWorkspaceFiles.ts`

- 工作区文件状态 hook，已从 `App.tsx` 抽离。
- 负责当前工作区 flat 文件列表、目录树、当前目录路径、文件搜索词、工作区切换时重置目录和关闭预览，以及上传/产物变化后的刷新。
- 后续做文件编辑、文件删除、创建文件夹、版本历史、主流文件预览刷新时，优先从这里接状态，不要在 `App.tsx` 新增第二套文件树状态。

`apps/web/src/features/workspace/useWorkspaceActions.ts`

- 工作区动作 hook，已从 `App.tsx` 抽离。
- 负责新增工作区、重命名、重新授权、移除、上传文件、本机默认应用打开、Finder 显示、工作区文件/任务产物 Reveal、把预览目标加入对话上下文等动作状态。
- 后续修复“新增/重新授权入口不一致”“默认工作区移除规则”“上传后文件列表刷新”“文件预览上下文引用”“工作区动作错误提示”等问题时，优先改这里和 `workspaceApi.ts`。

`apps/web/src/features/workspace/useWorkspaceDropzone.ts`

- 工作区拖拽上传 hook，已从 `App.tsx` 抽离。
- 负责拖入文件时的深度计数、遮罩显示、dropEffect 和落下后调用上传动作。
- 后续做“拖入文件直接作为上下文”“上传进度”“拖拽区域细分”时，优先改这里和 `useWorkspaceActions.ts`。

`apps/web/src/features/chat/MessageBody.tsx`

- 对话消息正文渲染模块，已从 `App.tsx` 抽离。
- 现在是轻量 wrapper：只负责接收 message props、调用 `buildMessageParts()`，再交给 `MessagePartList` 渲染。
- 后续优化流式输出样式、消息分段、引用块和代码块时，先从这里进入。

`apps/web/src/features/chat/MessageParts.tsx`

- 对话区 message parts 渲染层，负责把一条消息归类为 `user_text`、`assistant_text`、`file_cards` 等结构化 part。
- Assistant 回复不再直接等同于 Markdown。`buildMessageParts()` 会先识别文件清单表格，把它转成 `file_cards`，真正的数据表格继续留在 `assistant_text` 中由 `MarkdownContent` 渲染。
- 运行中的人工审批已接入 `approval_card`：`buildApprovalMessageParts()` 只在存在未解决的 `approval.request` 时生成审批 part，渲染仍复用 `ApprovalRequestCard`，但入口不再散落在 `App.tsx`。
- 运行中的实时执行面板已接入 `tool_card`，完成后的过程摘要已接入 `activity_group`；两者复用 `executionTraceModel` 的稳定语义层和 `ExecutionTracePanels` 的现有 UI，不再在 `ChatExecutionViews.tsx` 里各自构造。
- 变更摘要已接入 `diff_card`：当前前端可识别 Assistant 回复中的“X 个文件已更改 +A -D”与后续文件路径增删行，转成独立变更卡；后续如果 Hermes/Cowork 后端提供结构化 diff 事件，应把入口切到后端真源。
- 后续新增 message part 时，应优先扩展这里的 part 类型和 renderer，不要在 `App.tsx` 或多个组件里分散判断。

`apps/web/src/features/chat/ChatComposer.tsx`

- 对话输入框和底部模型/运行参数入口，已从 `App.tsx` 抽离。
- 负责预载 Skill 条、附件 chip、输入框、工作区入口、模型菜单、思考强度、显示原始思考开关、重填 Key、模型服务设置、发送/停止按钮。
- 附件入口只负责选择文件和展示上传后的本轮附件；文件上传、消息持久化、Hermes prompt 拼接仍由 App/API 层处理，避免输入组件持有业务真源。
- 对话正文引用文件时使用 `MarkdownContent` 的 file reference contract；不要让 Hermes 回复里的文件名继续以普通 `code` 灰色样式出现。
- 只通过 props 接收模型列表、Hermes reasoning 状态和任务运行状态；后续优化模型选择和思考强度入口时，优先改这里。

`apps/web/src/features/chat/useConversationBehavior.ts`

- 对话区 DOM 行为 hook，已从 `App.tsx` 抽离。
- 负责输入框 ref、对话滚动 ref、自动跟随到底部、用户手动滚动后的跟随判定、输入框聚焦、提交表单和 `Enter` 发送 / `Shift+Enter` 换行键盘行为。
- 后续修复“流式输出不自动下滑”“切换会话后位置不对”“键盘发送行为异常”“聚焦输入框不稳定”等问题时，优先改这里。

`apps/web/src/features/chat/ChatExecutionViews.tsx`

- 对话执行展示 wrapper，已从 `App.tsx` 抽离。
- 负责普通消息 + 完成后内联执行轨迹、运行中实时执行面板、stream 状态中文文案。
- 后续修复“流式过程展示 / 结束后 trace / stream 状态文案 / 运行中过程和最终答案分层”等问题时，优先改这里、`ExecutionTracePanels.tsx` 和 `executionTraceModel.ts`，不要把执行展示逻辑重新写回 `App.tsx`。

`apps/web/src/features/chat/ApprovalRequestCard.tsx`

- Hermes 命令人工审批卡片模块。
- 负责从 `task.events` 中识别最新未处理的 `approval.request`，展示命令、说明和“允许本次 / 本会话允许 / 总是允许 / 拒绝”四个操作。
- 只负责 UI 和选择回调；真正审批通过 `chatApi.respondTaskApproval()` 调 Cowork 后端，再由后端转发给 Hermes gateway 的 `approval.respond`。

`apps/web/src/features/chat/ExecutionTracePanels.tsx`

- 运行过程 UI 面板，已从 `App.tsx` 抽离。
- 负责运行中的“实时执行”卡片、完成后的内联过程记录、trace icon 和 trace detail token 高亮。

`apps/web/src/features/chat/executionTraceModel.ts`

- 执行轨迹语义层，已从 `App.tsx` 抽离。
- 负责 Hermes 事件过滤、thinking 噪声过滤、任务拆解推导、Plan/ReAct/Reflection/Result 标签、运行中 trace、完成后 trace、上下文资源快照和任务耗时统计。
- 后续修复“思考单词刷屏”“用户气泡和上下文错位”“任务拆解命名奇怪”“资源未实时更新”等问题时，优先改这里。

`apps/web/src/features/chat/TaskInspectorCards.tsx`

- 右侧工作区任务卡模块，已从 `App.tsx` 抽离。
- 负责任务拆解、任务产出物、上下文与资源三张默认卡片。
- 后续优化右侧工作区的信息层级、资源实时更新、产物预览入口时，优先改这里；它依赖 `executionTraceModel.ts` 给出的语义数据，不直接解析原始后台噪声。

`apps/web/src/features/chat/ToolEventsPanel.tsx`

- 工具事件与后台详情面板模块，已从 `App.tsx` 抽离。
- 负责旧的工具卡片、事件时间线和 payload 展示能力；当前不作为用户默认静态信息展示，只作为需要时可接回的诊断/高级面板。
- 后续如果要恢复“过程详情”或开发者诊断入口，应从这里接入，而不是在 `App.tsx` 里重新写一套工具 payload UI。

`apps/web/src/features/chat/TaskFocusPanel.tsx`

- 失败/停止后的任务焦点卡，已从 `App.tsx` 抽离。
- 负责继续追问、重新运行、归档/取消归档、删除入口。

`apps/web/src/features/chat/messageUtils.ts`

- 对话消息可见性和结果文本规则模块，已从 `App.tsx` 抽离。
- 负责较早对话收起、最新用户消息定位和任务结果文本兜底选择。
- 后续修复“用户气泡消失”“旧上下文展示错位”等问题时，先检查这里的规则。

`apps/web/src/features/chat/useTaskSelection.ts`

- 对话/任务选择派生状态 hook，已从 `App.tsx` 抽离。
- 负责当前工作区、当前任务、运行中任务、侧栏工作区任务分组、任务过滤、归档统计、当前消息可见/隐藏集合、关联 Hermes session 的统一派生。
- 后续如果要改“工作区和最近重复”“归档显示位置”“任务列表搜索/筛选”“多入口选中任务不同步”，优先改这里，不要在 `App.tsx` 里再写第二套过滤和分组规则。

`apps/web/src/features/chat/useTaskStream.ts`

- Hermes 任务运行流 hook，已从 `App.tsx` 抽离。
- 负责运行中任务 SSE 连接、实时 task payload 合并回调、连接状态、最近同步时间，以及 getState 轮询兜底。
- 后续修复“流式输出不更新”“任务区和对话区不同步”“上下文资源延迟刷新”“事件流失败后如何降级”等问题时，优先改这里和后端 stream API。

`apps/web/src/features/chat/useTaskContext.ts`

- 当前任务上下文资源 hook，已从 `App.tsx` 抽离。
- 负责读取 Hermes context snapshot、上下文加载/错误/压缩状态、手动刷新和手动压缩。
- 后续修复“上下文资源和本轮过程资源重叠”“上下文中文件占比不清楚”“压缩后资源区不同步”等问题时，优先改这里和 `TaskInspectorCards.tsx`。

`apps/web/src/features/chat/taskContextApi.ts`

- 任务上下文 API service，已从 `apps/web/src/lib/api.ts` 抽离。
- 负责读取 Hermes context snapshot 和触发当前任务上下文压缩。
- 后续扩展“手动压缩策略 / 文件占比明细 / 上下文资源实时刷新 / 压缩历史”时，先在这里确认 API 边界，再由 `useTaskContext.ts` 和 `TaskInspectorCards.tsx` 消费。

`apps/web/src/features/chat/useTaskActions.ts`

- 对话任务动作 hook，已从 `App.tsx` 抽离。
- 负责发送新任务/继续已有任务、停止任务、回复 Hermes 命令审批、删除任务、置顶任务、归档/恢复任务、标签切换，以及提交中/停止中/审批中的局部状态。
- 后续修复“发送后会话选中错位”“停止按钮状态不一致”“审批卡状态不一致”“归档和删除入口行为不统一”“标签筛选和任务状态不同步”等问题时，优先改这里。

`apps/web/src/features/chat/chatApi.ts`

- Chat task API service，已从 `apps/web/src/lib/api.ts` 抽离。
- 负责创建任务、继续追问、停止、命令审批回复、删除、置顶、归档、标签、任务导出 URL 和 SSE stream URL。
- 后续新增“任务重试 / 恢复归档 / 多 Agent 调度任务 / 更细粒度运行控制 / clarify 与 secret 交互”时，先在这里定义前端 API 边界，再由 hook 或页面消费。

`apps/web/src/features/chat/taskState.ts`

- 对话任务状态合并工具，已从 `App.tsx` 抽离。
- 负责把 Hermes stream 回来的 task payload 合并进全局 `AppState`，并按 id 去重、按创建时间排序 messages/artifacts。
- 后续如果 stream payload 需要增量 patch、事件去重、artifact 去重策略调整，优先改这里。

`apps/web/src/features/settings/models.tsx`

- 模型设置 feature 模块，已从 `App.tsx` 抽离。
- 负责“设置 > 模型”的完整页面、底部入口共用的模型候选分组规则、Hermes provider 归一化、MiMo 版本分组、模型凭据状态展示，以及“配置或重填模型 Key”弹窗。
- 后续修复“设置入口和对话底部入口模型表不一致”“同供应商多模型重复填 Key”“MiMo 新模型分组”“删除模型服务”等问题时，优先改这里和 `apps/api/src/models.ts`，不要在 `App.tsx` 里新增第二套模型 UI。

`apps/web/src/features/settings/useModelState.ts`

- 模型设置数据 hook，已从 `App.tsx` 抽离。
- 负责模型列表、当前选中模型、Hermes 当前模型概览、模型目录、刷新目录状态、模型通知和模型错误状态。
- 提供统一的 `applyModelResponse()`，后续所有模型 API 返回的 `ModelListResponse` 都应通过这里更新，避免多入口模型状态不一致。

`apps/web/src/features/settings/useModelConfigForm.ts`

- 模型配置表单 hook，已从 `App.tsx` 抽离。
- 负责“配置模型服务”弹窗开关、供应商切换时复用已保存 Base URL/API 模式、模型字段状态、保存中状态、提交后选回 `auto` 并刷新模型列表。
- 后续修复“底部入口和设置入口模型表不一致”“同供应商重复填 Key”“新增模型后当前模型丢失”等问题时，优先检查这里和 `useModelState.ts`。

`apps/web/src/features/settings/modelApi.ts`

- 模型设置 API service，已从 `apps/web/src/lib/api.ts` 抽离。
- 负责模型列表、刷新模型目录、本次模型选择、删除模型、设置 Hermes 默认模型、配置模型服务、思考强度、删除 provider 和 fallback provider 写入。
- 后续修复“模型配置入口不一致”“同供应商多模型凭据复用”“模型官网刷新”“Hermes 默认模型和本次任务模型分层”等问题时，先在这里确认 API 调用边界，再让 `useModelState.ts` / `useModelConfigForm.ts` / `models.tsx` 消费。

`apps/web/src/features/settings/useModelActions.ts`

- 模型设置动作 hook，已从 `App.tsx` 抽离。
- 负责本次模型选择、配置 reasoning、设置 Hermes 默认模型、删除 Cowork 已配置模型、更新 fallback providers 和删除 Hermes provider 配置。
- 后续修复“模型操作后状态没有刷新”“删除模型影响当前选择”“reasoning 设置入口不一致”等问题时，优先改这里和 `modelApi.ts`。

`apps/web/src/features/settings/mcp.tsx`

- MCP 设置 feature 模块，已从 `App.tsx` 抽离。
- 负责“设置 > MCP”的本地服务、Hermes Server、云端三个 Tab，以及 Hermes 原生添加/编辑、服务详情、工具开关、MCP 服务摘要。
- 后续修复“MCP 页面拥挤”“已安装 MCP 说明/图标/工具级开关”“Hermes mcp serve 诊断”“OAuth login/preset 列表”等问题时，优先改这里和 `apps/api/src/mcp.ts`，不要在 `App.tsx` 里新增第二套 MCP UI。

`apps/web/src/features/settings/useMcpState.ts`

- MCP 设置数据和动作 hook，已从 `App.tsx` 抽离。
- 负责读取 Hermes MCP 配置、测试/启停/删除 MCP、原生新增和编辑、工具级选择、Hermes MCP serve 状态。
- 后续修复“MCP 状态刷新不一致”“原生添加后已安装列表不同步”“serve 状态误报”“OAuth/Header/preset 配置异常”等问题时，优先检查这里和 `apps/api/src/mcp.ts`。

`apps/web/src/features/settings/mcpApi.ts`

- MCP 设置 API service，已从 `apps/web/src/lib/api.ts` 抽离。
- 负责 Hermes MCP 配置读取、原生新增/编辑、工具选择、serve 启停、测试、删除和启停写入。
- 后续扩展“官方 MCP 生态/Hub”“云端 MCP”“工具级策略”等能力时，先在这里确认 API 调用边界，再由 `useMcpState.ts` / `mcp.tsx` 消费。

`apps/web/src/features/settings/SettingsModal.tsx`

- 设置弹窗主体，已从 `App.tsx` 抽离。
- 负责设置左侧导航、设置 tab 路由，以及向各设置页面传入共同状态。
- 后续修复“设置弹窗层级混乱”“设置页响应式布局”“设置页主题化”等问题时，优先改这里；具体页面内容优先改 `SettingsPages.tsx`、`models.tsx` 或 `mcp.tsx`。

`apps/web/src/features/settings/SettingsPages.tsx`

- 设置页二级页面集合，已从 `SettingsModal.tsx` 抽离。
- 负责账号、通用、对话流、外部应用授权、云端运行环境、命令、规则和关于页内容；模型页和 MCP 页仍分别在 `models.tsx`、`mcp.tsx`。
- 后续修复“通用/对话流/规则页交互”“规则创建”“对话流偏好入口”“关于页 Hermes 更新包裹层”等问题时，优先改这里。

`apps/web/src/features/settings/settingsControls.tsx`

- 设置区通用控件集合，已从 `SettingsModal.tsx` 抽离。
- 负责 `SettingsSection`、`SettingsBlock`、`SettingsControlRow`、`SelectControl`、`SettingsSubtabs`、`InlineAddControl`、`Toggle` 和 `InfoGrid`。
- 后续做设置页主题化、控件尺寸层级、键盘可访问性和统一表单行为时，优先改这里，再让各设置页面复用。

`apps/web/src/features/settings/settingsTypes.ts`

- 设置区共享类型和默认值，已从 `App.tsx` 抽离。
- 负责 `SettingsTab`、`SettingsPrefs`、规则范围、MCP 范围引用，以及 `defaultSettingsPrefs`。
- 后续做设置持久化、设置迁移、后台可配置默认值时，优先改这里和对应后端配置 API。

`apps/web/src/features/settings/useSettingsPreferences.ts`

- 设置偏好状态 hook，已从 `App.tsx` 抽离。
- 负责界面语言、主题、隐私模式、设置偏好对象和规则新增。
- 后续做“UI 主题化 / 设置持久化 / 设置迁移 / 后台可操作配置”时，优先改这里和 `settingsTypes.ts`，不要把设置偏好状态重新堆回 `App.tsx`。

`apps/web/src/features/settings/HermesUpdatePanel.tsx`

- “关于 Hermes Cowork > Hermes 后台更新”面板，已从 `App.tsx` 抽离。
- 负责 Hermes 版本检查、升级结论、复测结果、自动更新结果、诊断详情和 GitHub 入口展示。
- 后续修复“升级前复测”“自动更新按钮状态”“旧失败信息残留”“诊断信息过多”等问题时，优先改这里和 `apps/api/src/hermes_runtime.ts`。

`apps/web/src/features/settings/useHermesRuntimeState.ts`

- Hermes runtime、版本更新、兼容性复测、自动更新和 Hermes session 数据 hook，已从 `App.tsx` 抽离。
- 负责读取 runtime 信息、刷新升级状态、执行升级前后复测、触发自动更新、同步 Hermes sessions 给任务选择逻辑。
- 后续修复“后台更新页状态不一致”“自动更新后状态未刷新”“Hermes session 关联异常”“runtime 报错显示”等问题时，优先改这里和 `apps/api/src/hermes_update.ts` / `apps/api/src/hermes_runtime.ts`。

`apps/web/src/features/settings/runtimeApi.ts`

- Hermes runtime / 更新 API service，已从 `apps/web/src/lib/api.ts` 抽离。
- 负责读取 Hermes runtime、更新状态、兼容性复测、自动更新、Hermes session 索引、session 详情、session 重命名、session 删除和原生 session 继续对话。
- 后续扩展“Kernel Manager 安装 / 固定内核版本锁定 / 补丁记录 / 回滚 / 多电脑迁移检查”时，先在这里确认 API 边界，再由 `useHermesRuntimeState.ts` 和 `HermesUpdatePanel.tsx` 消费。

`apps/web/src/features/sessions/SessionsView.tsx`

- Hermes 原生会话页面，已作为左侧“会话”入口接入。
- 负责本机会话全文搜索、来源/模型筛选、会话列表、详情消息浏览、重命名、删除、模型/来源/工具摘要、Cowork 关联任务跳转和原生 session 继续对话。
- 只通过 `/api/hermes/sessions`、`/api/hermes/sessions/:sessionId`、`PATCH /api/hermes/sessions/:sessionId`、`DELETE /api/hermes/sessions/:sessionId` 和 `POST /api/hermes/sessions/:sessionId/continue` 消费后端归一化数据；不直接读取本机文件，不直接写 SQLite。
- 继续对话的规则：已有 Cowork 任务时打开并标记显式 resume；没有任务时由后端导入 Hermes 消息并创建 Cowork 任务。前端只负责打开返回的任务，不在页面里伪造会话状态。

`apps/web/src/features/skills/SkillsView.tsx`

- 技能主页面模块，已从 `App.tsx` 抽离。
- 负责能力中心总览、`技能 / MCP 服务 / 工具集` 三个子页、技能市场/已安装切换、技能搜索、技能卡片、刷新、上传、MCP 服务摘要和 Hermes Toolsets 管理入口。
- 后续修复“左侧技能入口层级”“技能市场分类”“MCP 服务和设置入口一致性”“Toolsets 展示与启停”等问题时，优先改这里。

`apps/web/src/features/skills/SkillDetailModal.tsx`

- 技能详情弹窗模块，已从 `App.tsx` 抽离。
- 负责 Skill 基础信息、文件树、`SKILL.md`/子文件预览、复制内容、启用/禁用和加入下一次任务。
- 后续做 skill 文件编辑、版本查看、依赖文件说明、运行前预载策略时，优先从这里扩展。

`apps/web/src/features/skills/useSkillsState.ts`

- 技能区状态和动作 hook，已从 `App.tsx` 抽离。
- 负责 Skill 列表刷新、启用/停用、上传、打开 Skill、读取 Skill 文件、选择 `SKILL.md` 或子文件，以及 Skill 详情弹窗状态。
- 后续修复“skill 区域文件不完整”“点击 skill 后看不到 skill.md 和子文件”“skill 启用状态不同步”等问题时，优先改这里。

`apps/web/src/features/skills/skillsApi.ts`

- Skills API service，已从 `apps/web/src/lib/api.ts` 抽离。
- 负责 Skill 列表、启停、上传、文件树读取和 Skill 文件内容读取。
- 后续扩展“skill 文件编辑 / skill 版本 / skill 市场安装 / 运行前预载策略”时，先在这里确认 API 边界，再由 `useSkillsState.ts` 和技能页面消费。

`apps/web/src/features/skills/skillFormatters.ts`

- 技能区格式化和小工具模块，已从 `App.tsx` 抽离。
- 负责 skill 来源中文名、路径缩写、文件大小、文件时间和复制到剪贴板。
- 后续如果技能区需要更完整的文件元信息展示，先从这里统一格式化规则。

`apps/web/src/lib/http.ts`

- 前端通用 HTTP 基础层，已从 `lib/api.ts` 分离。
- 统一维护 `API_BASE`、`apiUrl()`、`request()`、`parseError()` 和 JSON header。
- 后续按 feature 拆 API service 时，都复用这里，不重复写 fetch 错误处理。

`apps/web/src/lib/api.ts`

- 前后端共享协议类型文件，不再直接发起 feature 请求。
- feature 相关请求已经迁入对应 feature API service；后续不要把模型、MCP、Skill、文件预览、任务执行、runtime、全局 state 等请求重新加回这里。

`apps/web/src/styles/app.css`

- 全局样式入口。
- 当前通过 `@import` 汇入主题 token、基础 reset、shell、sidebar、chat、settings、workspace 和 file-preview 样式模块。
- 仍保留少量尚未模块化的通用页面、技能页、调度页、右侧 inspector 基础样式和它们的响应式规则。

`apps/web/src/styles/tokens.css`

- 主题 token 第一层，已从 `app.css` 抽离。
- 当前保存颜色、阴影、字体和基础变量。
- 后续主题化、密度、字号 profile 先改这里，不要散落到业务组件 CSS。

`apps/web/src/styles/base.css`

- 全局 reset 和基础可访问性样式，已从 `app.css` 抽离。
- 负责 `box-sizing`、`body` 背景、全局字体继承、按钮默认样式和 `focus-visible`。

`apps/web/src/styles/shell.css`

- 三栏 shell 布局样式，已从 `app.css` 抽离。
- 负责 `app-shell`、左右侧栏折叠、文件预览模式、拖拽分隔线和拖拽上传遮罩。
- 第一批 `app-shell` 响应式断点已经迁入。
- 后续优化三栏宽度、自适应和客户端窗口行为时，优先改这里。

`apps/web/src/styles/sidebar.css`

- 左侧栏样式第一刀，已从 `app.css` 抽离。
- 负责品牌区、工作区树、会话行、左侧任务列表和侧边栏按钮的基础样式。
- 第一批 sidebar 容器查询和移动端断点已经迁入。
- 后续整理左侧工具栏和工作区层级时，优先改这里。

`apps/web/src/styles/chat.css`

- 对话区样式第一刀，已从 `app.css` 抽离。
- 负责执行过程、工具事件、主对话、消息 Markdown、输入框、对话底部模型菜单、右侧任务上下文卡片。
- 第一批对话区响应式断点已经迁入。

`apps/web/src/styles/settings.css`

- 设置区样式第一刀，已从 `app.css` 抽离。
- 负责设置弹窗、模型设置、MCP 设置、市场弹窗、模型配置弹窗和通用 modal 外壳。
- 第一批设置、模型、Hermes 更新相关响应式断点已经迁入。

`apps/web/src/styles/workspace.css`

- 工作区样式第一刀，已从 `app.css` 抽离。
- 负责工作区主容器、工作区文件页、目录浏览器、工作区切换卡片、工作区空状态和项目页通用壳。
- 第一批工作区响应式断点已经迁入。

`apps/web/src/styles/file-preview.css`

- 文件预览样式第一刀，已从 `app.css` 抽离。
- 负责右侧文件预览 inspector、预览面板、文档/Markdown/CSV/表格/图片/音视频/嵌入式预览。
- 第一批文件预览响应式断点已经迁入；`app-shell.file-preview-mode` 布局规则归 shell 模块维护。

## 6. 本地数据结构

状态文件：

```text
data/state.json
```

包含：

- `workspaces`
- `tasks`
- `messages`
- `artifacts`
- `skillSettings`
- `modelSettings`

任务不会写入数据库，目前是 JSON 文件。后续如果任务多了，可以迁移 SQLite。

删除任务记录只会删除：

- Cowork task
- Cowork messages
- Cowork artifact index

不会删除：

- Hermes session
- 工作区真实文件
- Hermes 生成的实际产物

## 7. 当前 API

健康检查：

```http
GET /api/health
```

Hermes 运行时：

```http
GET /api/hermes/runtime
GET /api/hermes/update-status
POST /api/hermes/compatibility-test
POST /api/hermes/update
GET /api/hermes/mcp
GET /api/hermes/mcp/serve
POST /api/hermes/mcp/:serverId/test
POST /api/hermes/mcp/:serverId/enabled
POST /api/hermes/mcp/manual
POST /api/hermes/mcp/serve/start
POST /api/hermes/mcp/serve/stop
PATCH /api/hermes/mcp/:serverId
PATCH /api/hermes/mcp/:serverId/tools
DELETE /api/hermes/mcp/:serverId
```

Hermes 自动更新流程：

- `POST /api/hermes/update` 不会直接盲目升级；后端会先读取当前版本状态，并执行一次真实兼容性复测。
- 前端只有在检测到新版本且复测通过时才展示可用的“自动更新”操作；没有更新时只保留检查和复测，不再悬挂单独的更新说明卡片。
- 本机 Hermes 工作树有改动但没有可用更新时，不再判定为用户需要处理的阻塞状态；只有“有可用更新 + 工作树有本机改动”才阻止自动更新，并提示先交给维护者备份或清理。
- 前测通过后，Cowork 会把 `~/.hermes/config.yaml`、`~/.hermes/.env`、`~/.hermes/auth.json` 中存在的文件备份到 `data/hermes-update-backups/<update-id>/`。
- 备份完成后才调用 Hermes 官方命令 `hermes update`。
- 更新命令成功后，Cowork 会再次执行兼容性复测，覆盖 Hermes 命令、模型配置 Adapter、MCP 配置 Adapter 和真实 Bridge 小任务。
- 如果前测失败、本机 Hermes 工作树有风险、更新命令失败或后测失败，接口会返回失败阶段和备份目录，不继续隐藏错误。
- `apps/api/src/hermes_bridge.py` 是 Cowork 与 Hermes Python API 的薄适配层；它需要兼容 Hermes CLI 内部路由字段变化，例如 `route.label` 在 Hermes v0.11.0 中不再稳定存在，因此桥接代码不能强依赖该字段。

全量状态：

```http
GET /api/state
```

工作区：

```http
GET /api/workspaces
POST /api/workspaces
PATCH /api/workspaces/:workspaceId
DELETE /api/workspaces/:workspaceId
GET /api/workspaces/:workspaceId/files
GET /api/workspaces/:workspaceId/tree?path=...
POST /api/workspaces/:workspaceId/files
GET /api/workspaces/:workspaceId/files/preview?path=...
POST /api/workspaces/:workspaceId/files/reveal
POST /api/workspaces/:workspaceId/reveal
```

任务：

```http
GET /api/tasks
GET /api/tasks/export.md?ids=...
GET /api/tasks/:taskId
GET /api/tasks/:taskId/export.md
POST /api/tasks
POST /api/tasks/:taskId/messages
POST /api/tasks/:taskId/stop
POST /api/tasks/:taskId/pin
POST /api/tasks/:taskId/archive
POST /api/tasks/:taskId/tags
DELETE /api/tasks/:taskId
```

产物：

```http
GET /api/artifacts/:artifactId/preview
GET /api/artifacts/:artifactId/download
POST /api/artifacts/:artifactId/reveal
```

技能：

```http
GET /api/skills
GET /api/skills/hub?q=browser&source=all&page=1&pageSize=18
POST /api/skills/hub/install
GET /api/skills/:skillId/files
GET /api/skills/:skillId/files/content?path=...
POST /api/skills/:skillId/toggle
POST /api/skills/upload
```

模型：

```http
GET /api/models
POST /api/models/select
POST /api/models
POST /api/models/hermes-default
POST /api/models/catalog/refresh
POST /api/models/fallbacks
```

## 9. 重要实现细节

### 9.1 为什么不用纯 CLI

最初用：

```bash
hermes chat --quiet --source web-frontend -q "..."
```

问题：

- 工具调用不够结构化。
- 只能靠 stdout/stderr 猜测状态。
- 难以实时做步骤和工具卡片。

当前升级为双通道 Runtime Adapter：

```text
普通任务：
Node Adapter -> hermes_runtime.ts -> hermes_gateway.ts -> Hermes tui_gateway JSON-RPC -> AIAgent

回退任务：
Node Adapter -> hermes_runtime.ts -> hermes_bridge.py -> HermesCLI -> AIAgent
```

好处：

- 普通任务不再每轮新启一个 HermesCLI 进程，开始向常驻 gateway 迁移。
- 仍保留 Hermes CLI 配置加载、模型路由、fallback、credential 行为。
- gateway 能直接复用 Hermes 原生 session、usage、interrupt、model switch 等后端能力。
- bridge 仍可承接 gateway 还没暴露的 Cowork skill 预载能力。

### 9.2 为什么 bridge 必须走 HermesCLI

直接 `AIAgent()` 会绕过 Hermes CLI 的 provider/model/fallback/runtime credentials，容易出现模型配置错误。

现在 bridge 先创建 `HermesCLI`，再调用：

- `_ensure_runtime_credentials`
- `_resolve_turn_agent_config`
- `_init_agent`

然后把 callbacks 挂到 `cli.agent`。

### 9.3 Runtime Adapter 边界

Cowork 不能把“所有 Hermes 后端能力”都理解成 CLI 命令。当前边界如下：

- 任务执行、流式输出、停止、普通 session resume：优先走 `tui_gateway`。
- Hermes 澄清反问：只在 `tui_gateway` 路径内支持。后端运行时 handle 暴露 `clarify(answer)`，Cowork API `/api/tasks/:taskId/clarify` 转发到 Hermes gateway 的 `clarify.respond`；bridge fallback 不具备可继续澄清能力。
- Hermes 命令人工审批：只在 `tui_gateway` 路径内支持。后端运行时 handle 暴露 `approve(choice)`，Cowork API `/api/tasks/:taskId/approval` 转发到 Hermes gateway 的 `approval.respond`；bridge fallback 不具备可继续审批能力。
- 模型、MCP、更新、doctor、配置迁移：仍可走 Hermes CLI 或配置文件 API，因为这些是管理动作，不需要常驻对话进程。
- Cowork 手动预载 skill：暂时走 `hermes_bridge.py`，直到 Hermes gateway 暴露等价参数。
- 上下文读取/压缩：已有 bridge 路径；gateway 任务结束时会从 `message.complete.usage` 同步 `context.updated`。
- 如果 gateway 启动失败，`hermes_runtime.ts` 会发出 `runtime.fallback` 事件，并自动使用 bridge 完成本轮任务。

后续升级原则：不要在 `server.ts` 里直接新增某个具体通道调用；新增 Hermes 执行能力必须先进入 `hermes_runtime.ts`，再由它决定 gateway、bridge 或 CLI 管理命令。

### 9.4 工作区安全

所有工作区文件操作都必须经过：

```ts
ensureInsideWorkspace(filePath, workspacePath)
```

目的是防止 `..` 路径逃逸。

### 9.5 产物识别

任务开始前：

```ts
takeSnapshot(workspacePath)
```

任务结束后：

```ts
findChangedArtifacts(...)
```

通过新增/修改文件判断产物归属。

当前产物识别规则：

- 任务开始前记录工作区文件 `mtimeMs`。
- 任务结束后扫描新增或修改过的文件。
- 只记录常见办公、报告、表格、图片、文本和压缩包类型。
- 产物事件会进入 `task.events`，类型为 `artifact.created`，字段包含 `name`、`relativePath`、`artifactId`、`size`。

### 9.6 会话选择与轮询刷新

前端会定时调用 `/api/state` 刷新任务状态。轮询函数不能直接依赖首次渲染时闭包里的 `selectedTaskId`，否则用户点击靠下的会话后，下一次轮询可能仍按旧的 `undefined` 状态自动选回第一条任务。

当前实现用 `selectedTaskIdRef` 和 `selectedWorkspaceIdRef` 保存最新选择，只在首次进入且未选择任何会话时自动选第一条任务。用户手动选择会话后，轮询只刷新任务数据，不再改动当前会话。

### 9.7 对话区视觉原则

Hermes 的最终回答是主内容，默认用正文流展示，不使用大面积卡片、阴影或粗边框。过程信息是辅助内容：运行中可以显示当前动作，任务完成后只保留一行可展开的“查看过程记录”，避免思考过程和最终答案挤在一起。完成态不要在主对话区悬挂任务状态卡；状态、模型、耗时、Session、产物等信息归右侧任务上下文承载。不要在对话正文里放统计胶囊、阶段分栏等弱操作控件；数量摘要只显示真实发生过的类型。

界面里的轻浮层也要符合桌面产品习惯：全屏弹窗点击遮罩空白关闭；非遮罩浮层（例如底部模型选择器）点击触发器和浮层内部不关闭，点击浮层外任意位置自动收起。

### 9.8 流式输出信息架构

流式输出必须把 Hermes 的后端事件转成 Cowork 的用户语义层，而不是把 stdout/stderr、工具名和调试日志直接堆到对话区。

主对话区只承担三件事：

- 用户输入。
- Hermes 最终回答或正在生成的回答。
- 一条轻量过程摘要，例如“处理中 39 秒 / 已处理 2 分 14 秒”，展开后按类别查看过程。

对话区不是 Markdown 容器，而是 message parts 时间线。Hermes 可以返回 Markdown，后端也可以返回事件，但 Cowork 前端必须先把信息归类，再选择组件。当前参考产品截图体现出一套稳定规律：用户消息是轻量气泡；Assistant 回复默认是文档式正文流；过程、命令、文件、变更、审批、产物都不是普通段落，而是独立对象；对象默认折叠或半展开，只暴露用户当下能判断或能操作的信息。

Message part 类型固定为：

- `user_text`：用户输入气泡。靠右、短宽度、保留原话；用户附带文件时在气泡下方显示附件 chip 或文件卡片，不把文件塞进正文。
- `assistant_text`：Hermes 最终回答或阶段性自然语言总结。用正文流展示，不套大卡片；支持标题、列表、引用、代码块、真正的数据表格。
- `run_summary`：运行摘要行，例如“已处理 8m57s / 已探索 5 个文件 / 已运行 2 条命令”。它是进度锚点，低权重、可展开；不能把每个工具事件都铺成正文。
- `activity_group`：过程证据组，例如“已探索 2 个文件”“已运行 1 条命令”“上下文已自动压缩”。默认显示一行摘要，展开后才看文件名、命令名、链接域名；不显示完整 stdout/stderr。
- `file_card`：用户上传、Hermes 引用、Hermes 生成的文件对象。显示文件名、类型、大小或来源，以及“打开/预览/定位/作为上下文”等动作；文件清单表格必须转成文件卡片。
- `diff_card`：代码或文档变更对象。显示“X 个文件已更改 +A -D”，列表只露文件路径和增删数；行内可展开，支持查看更改、撤销、审核。diff 不是 Markdown 表格。
- `clarify_card`：阻塞式任务澄清。显示 Hermes 的问题、候选选项和自由输入框；回答后调用 `clarify.respond`，继续原任务；不能退化成普通正文或错误文本。
- `approval_card`：阻塞式人工审批。显示动作、风险、命令摘要和允许/拒绝入口；审批请求不能退化成普通错误文本。
- `tool_card`：正在运行的终端、浏览器、MCP、飞书等工具对象。运行中可显示当前工具名和状态，完成后收敛成 activity_group；只有失败或需要用户处理时才提升为可见卡片。
- `artifact_card`：任务产物对象。出现在最终回答附近和右侧“任务产出物”，可点击预览；不要把产物只写成正文里的文件名。
- `reference_chip`：正文里的文件名、路径、URL、commit、命令名等短引用。引用在句子里保持轻量彩色 chip；点击能打开对应文件、网页、diff 或上下文详情。
- `debug_detail`：原始事件、完整命令输出、payload、日志。只进后台诊断或展开详情，不进入默认对话流。

过程摘要分组固定为：

- `思考与规划`：Hermes 推理轮次、状态判断、下一步计划。只保留摘要，不展示冗长 token 或内部 reasoning 原文。
- `网页与搜索`：网页检索、浏览器访问、链接读取。URL 在 UI 中显示为域名 chip。
- `文件活动`：读取、写入、生成产物、工作区路径。路径显示为短路径 chip。
- `工具调用`：MCP、命令、外部工具调用。命令和工具名以短 chip 显示。
- `结果`：任务完成、停止、产物就绪。
- `错误`：失败、超时、权限不足、工具异常。错误可以在主线摘要中出现，但详细堆栈只能放后台诊断或按需日志，不进入右侧默认工作区。

后端兼容规则：

- Hermes 原始事件继续通过 `task.events` 和 `/api/tasks/:taskId/stream` 传递。
- `buildExecutionView` / `buildExecutionActivity` 是 Adapter 层，负责把 Hermes 事件规范化成 `ExecutionActivity.kind`，前端只消费这个稳定语义，不反向依赖 Hermes 内部日志格式。
- `thinking.delta` / `reasoning.delta` 是 token 级内部流，只能作为短暂状态或被聚合，不写入持久 `task.events`，不生成一行一词的 UI。用户可见层只显示“正在思考 / 正在检索 / 正在调用工具 / 正在整理结果”等阶段摘要。
- `message.delta` 只负责累积最终回答，gateway 不再同时通过 stdout 和 event 双通道推送同一段 token，避免每个 token 触发两次渲染。
- `task.events` 是用户可理解的运行证据，不是完整后端日志。事件必须经过去重、降噪和上限裁剪；完整 payload、原始命令、调试输出只能进入后台诊断。
- `clarify.request` 是阻塞交互对象，不是任务拆解，也不是错误。gateway 任务收到后保持当前任务 `running`，主对话区渲染独立澄清卡；用户回答后后端调用 `clarify.respond`，并写入 `clarify.resolved` 事件。只有 bridge fallback 或服务重启后无法继续澄清时，才降级成失败/需要重新运行。
- `approval.request` 是阻塞交互对象，不是普通错误文本。gateway 任务收到后保持当前任务 `running`，主对话区渲染独立审批卡，用户选择“允许本次 / 本会话允许 / 总是允许 / 拒绝”后由后端调用 `approval.respond`，并写入 `approval.resolved` 事件；只有 bridge fallback 或服务重启后无法继续审批时，才降级成失败/需要重新运行。
- 前端多入口必须共享 `executionTraceRows`、`groupTraceRows`、`traceSummaryParts` 这组函数，避免对话区、右侧工作区和调试区各自解释一遍事件。
- `rawOutput`、`rawLog`、完整工具 payload 只能在调试页或右侧详情里出现，不进入主对话默认视图。
- 产物卡、文件变更卡、权限请求卡是独立对象，不能混在过程列表里。过程列表只回答“刚刚发生了什么”，对象卡回答“用户现在可以操作什么”。

参考成熟实现时遵循同一个原则：Vercel AI SDK 的 `UIMessage` 把 text、reasoning、tool、data parts 分层；LangGraph streaming 明确区分 `updates`、`messages`、`custom` 等 stream mode；assistant-ui 也把 text、reasoning、tool-call、data 作为 message parts。Cowork 不直接照搬组件库，但要保留这种“消息正文、工具对象、状态更新、调试数据分通道”的架构。

视觉规则：

- 过程摘要默认折叠，权重低于最终回答。
- 运行中只显示当前动作和必要计数；进入下一阶段时，右侧非常驻资源可以刷新，主对话仍保留可追溯摘要。
- 完成后最终答案不能被折叠，答案永远是主内容；被折叠的是过程，不是答案。
- 等待 Hermes 返回正文时只显示轻量状态行，不能复用普通消息卡片样式。
- 对话区的展示优先级是“文本意图 > 可操作对象 > 原始 Markdown 形态”：上传文件、生成文件、引用文件都先转成可点击文件对象；表格只服务比较和数据，不服务文件枚举。
- 过程对象要“聚合同类项”：连续读取文件、连续搜索网页、连续工具调用合并为一组，显示计数和最后状态；不能一条事件一行滚满屏幕。
- 对象卡片要靠近它解释的上下文：Hermes 说“已生成文档”后紧跟文件卡；Hermes 说“我改了代码”后紧跟 diff_card；运行终端只在运行期间靠近输入区或当前回复，结束后变成摘要。
- 用户消息和 Assistant 回复的视觉语言不同：用户消息是气泡，Assistant 主要是正文流。不要把 Assistant 的长回答也塞进气泡，否则文档阅读、代码块和表格都会变窄。
- 卡片只表示可操作对象，不表示普通段落。文件、diff、审批、终端、产物、错误修复入口可以是卡片；解释、总结、建议仍是正文。
- 数字只在能帮助判断时显示：耗时、文件数量、增删行、上下文占比、运行中工具数量有价值；内部 session、payload 字段、无行动建议的红色日志没有默认展示价值。
- 输入框上方可以有运行中的临时状态条，例如“正在运行 1 个终端”；它是当前任务控制区，不是历史对话内容，完成后自动折叠进本轮过程摘要。
- 历史折叠按“轮次”而不是按任意消息条数：旧用户问题、旧 Assistant 回答和对应过程要一起收进“上 N 条消息”，避免只折叠正文但留下孤立过程卡。
- 对话区必须有底部滚动锚点：用户停留在底部时，SSE 新事件和新正文自动跟随；用户主动上翻时暂停跟随，避免打断阅读。
- 颜色只表达语义：绿色成功/结果，蓝色检索/链接，黄色文件/产物，红色异常，灰色过程。

落地顺序：

1. 先补 `MessagePart` 渲染层：把当前 `MarkdownContent`、附件卡、产物卡、执行摘要、审批卡、文件引用统一成一个 message part renderer。
2. 再补 adapter：从 `Message.attachments`、`Task.artifacts`、`executionView.activity`、`approval.request`、Hermes markdown fallback 中生成稳定 parts；前端不直接在多个组件里各自解析事件。
3. 最后补视觉规则：每种 part 固定密度、字号、颜色、折叠策略和操作入口。新增信息类型必须先归类为 part，再写 UI。

### 9.9 模型配置原则

Hermes Cowork 的“配置模型服务”必须以 Hermes 本机配置为真源。`xiaomi`、`minimax`、`deepseek`、`qwen-oauth` 等 Hermes 原生供应商写入顶层 `model` 配置，不再写入 `custom_providers`，避免出现两个同名供应商、一个有 Key 一个空 Key 的状态。注意：Hermes 原生 API Key 供应商真正读取的 Key 来自 `~/.hermes/.env` 或 credential pool，不是 `model.api_key`；Cowork 保存这类供应商时必须写 `DEEPSEEK_API_KEY`、`XIAOMI_API_KEY`、`MINIMAX_CN_API_KEY` 等 Hermes Provider Registry 中定义的环境变量。

模型 ID 是模型级选择，Base URL、API Key / Plan Key、API 模式是供应商级配置。同一供应商下新增或切换模型时，前端应自动带入已保存的 Base URL 和 API 模式，Key 不回显但允许留空复用；跨供应商切换时，后端必须清理顶层 `model` 里旧供应商的 Base URL / API Key / API 模式，避免把小米 Key 误带到其他供应商。对 Hermes 原生供应商，Key 在 `.env` 中按供应商隔离保存，切换默认模型不能删除其他供应商 Key。

小米 MiMo 模型目录需要覆盖 Token Plan 当前 8 个模型：`mimo-v2.5-pro`、`mimo-v2.5`、`mimo-v2.5-tts-voiceclone`、`mimo-v2.5-tts-voicedesign`、`mimo-v2.5-tts`、`mimo-v2-pro`、`mimo-v2-omni`、`mimo-v2-tts`。前端展示时按 `MiMo V2.5 系列` 和 `MiMo V2 系列` 两层分组，不再平铺混排。

对话输入框底部的快捷模型菜单和设置页必须共用 `/api/models` 的模型候选。后端 `listModelOptions` 需要把 Hermes 当前默认供应商、fallback 供应商、已配置 custom provider 的模型目录并入本次任务候选，避免设置页完整、对话底部仍显示旧的手动模型列表。

模型入口分两类：对话输入框底部的快捷模型菜单、设置页“本次任务用哪个模型”只展示已配置可直接使用的模型，包括 `Hermes 默认模型`、当前 Hermes 默认模型和用户添加的本机模型选项；不得展示 `source: catalog` 的 Hermes 模型目录项。完整模型目录只出现在“配置模型服务”弹窗和长期默认模型配置区，用来刷新官网模型、选择供应商、写入 Key 和保存到 Hermes。

Key 修复必须是显式入口，不得只隐藏在“配置模型服务”里。对话底部模型菜单必须提供“重填当前 Key”，设置 > 模型顶部必须提供“重填 Key”决策入口，长期默认模型的 provider 行也要能直接进入对应供应商的 Key 配置。后端 `/api/models` 负责解析 `hermes auth list` 的认证失败信息；如果出现 401、invalid、expired、unauthorized 等状态，前端显示为“需要重填 Key”，而不是把它算作可用凭据。

如果同一个 provider 同时存在 `model_config` 可用凭据和旧环境变量凭据失败，例如 `custom:xiaomi model_config` 可用但 `XIAOMI_API_KEY` 旧值 401，Cowork 不应在主界面继续提示“需要重填 Key”。这类旧凭据只能作为高级诊断信息处理，当前模型是否可用以 Hermes 实际默认模型配置和一次最小后端验证为准。

配置或切换 Hermes 默认模型时，不能把旧默认模型从 Cowork 可选模型里挤掉。后端需要把“切换前的默认模型”和“切换后的默认模型”都写入 `modelSettings.customModels`，标记为 `source: custom`，让同一供应商已配置过的模型继续留在底部快捷菜单中。目录项仍然保留 `source: catalog`，只用于配置弹窗。

任务会记录 `modelConfigKey`。当用户仍选择“使用 Hermes 默认”但 Hermes 默认模型已经从 A 改成 B 时，继续对话不能复用旧 Hermes session，必须开启新的 Hermes session，确保新模型真实生效。

模型删除分两类处理：设置页“本次任务用哪个模型”里的删除按钮只移除 Cowork 已配置模型列表，也就是 `data/state.json` 里的本地记录；用户在设置里点击删除时，应直接移除该模型，不再弹出临时选项确认框。Hermes 模型服务删除会写回 `~/.hermes/config.yaml`，移除非当前默认的 `custom_providers` 配置和备用模型引用。当前默认模型服务不能直接删除，必须先切换到其他默认模型，避免把 Hermes 删除到不可执行状态。

### 9.10 上下文管理原则

上下文管理必须覆盖 Hermes 后端真实能力，而不是前端估一个进度条。当前真源来自 Hermes `ContextCompressor`、Hermes session 数据库和 Cowork 任务事件：

- `/api/tasks/:taskId/context` 返回当前任务 session 的 `contextUsed`、`contextMax`、`thresholdPercent`、`compressionCount`、`messageCount` 和 token 使用摘要。
- `/api/tasks/:taskId/context/compress` 调用 Hermes 原生 `/compress` 路径；如果 Hermes 压缩后生成 continuation session，Cowork 必须更新 `task.hermesSessionId`。
- `hermes_bridge.py` 在真实任务完成或失败时追加 `context.updated`，避免前端需要额外猜测当前 session 状态。
- 手动压缩只在任务非运行状态展示；运行中只允许刷新查看，不允许压缩正在执行的 session。
- UI 只展示用户可决策信息：当前是否正常、是否建议压缩、压缩按钮和必要用量。`state.db` 路径、原始 prompt token 细节、完整 compressor 配置默认不进入主界面。
- 如果 Hermes 尚未回传精确 prompt token，Cowork 可以标注为“估算”，但不能假装这是精确值。
- 后续如果要在对话框上方做风险提示，也必须复用同一个 `/api/tasks/:taskId/context`，不要单独读取事件或本地状态。

## 10. 常用开发命令

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
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

这个测试会启动隔离的 Cowork API 进程和 fake Hermes TUI gateway，验证 `/api/tasks`、`/api/tasks/:taskId/stream`、`clarify.request`、`/api/tasks/:taskId/clarify`、`clarify.respond`、`clarify.resolved`、`approval.request`、`/api/tasks/:taskId/approval`、`approval.respond`、`approval.resolved` 和最终 `message.complete` 的完整链路。测试使用临时 `HERMES_COWORK_DATA_DIR` 和 `HERMES_COWORK_WORKSPACE_DIR`，不会写入用户真实任务记录。

Hermes 官方 API Server 能力探测测试：

```bash
npm run test:hermes-official-api
```

这个测试不启动真实 Hermes。它用 fake Hermes 源码目录和 fake API Server 验证 `hermes_official_api.ts` 能识别 Runs、Run Stop、Jobs、Dashboard Sessions、MCP session events，并能向 `/health`、`/health/detailed`、`/v1/models` 发送带 Key 的探测请求。

Hermes 诊断聚合测试：

```bash
npm run test:hermes-diagnostics
```

这个测试不启动真实 Hermes。它用 fake Dashboard 响应验证 `/api/hermes/diagnostics` 的聚合规则：使用统计会被整理成会话、模型调用、Token 和费用；错误日志会被整理成近期异常，并能按 Hermes session 或日志时间回链到 Cowork 任务；本地 Cowork 任务事件会被整理成任务异常、审批等待、工具调用、工具失败率和平均耗时；Dashboard 不可用时只返回用户能执行的下一步动作。

任务拆解展示测试：

```bash
npm run test:task-decomposition
```

这个测试验证右侧任务拆解只使用产品级计划：有面向用户目标的 `todos` 时保留标题和状态；只有搜索、文件、工具调用事件，或 Hermes 返回工具级运行清单时，不生成假步骤。

真实 Hermes gateway smoke：

```bash
npm run smoke:hermes-real
```

这个 smoke 会调用本机真实 Hermes TUI gateway 和当前模型配置，请求模型只回复 `COWORK_REAL_GATEWAY_OK`。它用于验证 Cowork 与 Hermes 的真实消息连接、模型凭据、流式返回和 gateway 生命周期，适合 Hermes 升级、模型配置变更或前端出现 `Failed to fetch` / 无返回时先跑。

健康检查：

```bash
curl http://127.0.0.1:8787/api/health
```

查看状态：

```bash
curl http://127.0.0.1:8787/api/state
```

查看 Hermes 运行时：

```bash
curl http://127.0.0.1:8787/api/hermes/runtime
```

查看官方 API Server 探测结果：

```bash
curl http://127.0.0.1:8787/api/hermes/official-api
```

## 12. 已知限制

- 当前不是 macOS 原生客户端，还是本地 Web。
- 工作区授权已改为左侧“+ / 授权文件夹”触发 macOS Finder 目录选择；当前仍是本地 Web + Node Adapter 方案，未来打包成客户端后要替换为 Tauri/Electron 原生授权和安全书签。
- 文件预览已经统一到右侧文件详情面板：点击工作区文件、任务产物或对话附件时，右侧任务上下文会切换为文件预览；顶部操作统一为批注、本机默认应用打开、Finder 定位、下载、固定预览、全屏预览和关闭，不再在预览面板上展示“复制路径”和“作为上下文”。
- 对话附件第一版已补齐：输入框可选择或拖入主流文件并上传到当前授权工作区；拖到输入框时必须作为本轮对话附件，不能只触发工作区上传；发送任务时附件写入消息记录和 Hermes prompt；对话流展示附件卡片，点击复用右侧文件预览，右侧“上下文与资源”会把消息附件计入文件上下文。
- 当前预览覆盖文本类、小型无扩展文本文件、Markdown、CSV/TSV、PDF、图片、音视频、HTML、docx/doc/rtf、pptx/ppsx、xlsx/xlsm。
- Office 文件当前切到 macOS Quick Look 高保真 HTML 预览：后端用 `qlmanage -p -o` 生成 `.qlpreview` 包，并把其中 PDF 资源转成 PNG 以适配 Chromium iframe。它比正文抽取更接近本机预览；如果 Quick Look 生成失败，界面应提示用本机应用打开，不能回退成误导性的简化版 PPT/Word/Excel。
- 任务状态存在 `data/state.json`，大规模数据不适合长期使用。
- Hermes session 已有只读元数据索引、Cowork 任务关联、全文浏览、重命名和删除；原生 session 双向同步还没有接。
- 工具事件依赖 Hermes 当前 callbacks 暴露程度。
