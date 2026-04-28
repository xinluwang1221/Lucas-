# Hermes Cowork 开发交接文档

## 1. 项目定位

Hermes Cowork 是一个本机 Web 工作台，用来作为开源 Hermes Agent 的前端。

核心原则：

- 不重做 Hermes 的 Agent 能力。
- 不重做文件整理、文档生成、飞书操作、数据分析、网页调研等业务能力。
- 前端负责连接、展示、授权、任务控制、文件入口、产物沉淀。
- 后端 Adapter 负责调用 Hermes、维护本地任务状态、管理授权工作区和文件预览。

## 2. 当前运行方式

项目目录：

```bash
/Users/lucas/Documents/Codex/2026-04-26/new-chat
```

启动：

```bash
cd /Users/lucas/Documents/Codex/2026-04-26/new-chat
npm run dev
```

访问：

```text
http://127.0.0.1:5173/
```

服务：

- 前端 Vite：`http://127.0.0.1:5173`
- 后端 Adapter：`http://127.0.0.1:8787`

注意：不能直接打开 `apps/web/index.html`，必须通过 Vite 服务访问。

## 3. 技术栈

前端：

- React
- TypeScript
- Vite
- lucide-react
- 原生 CSS

后端：

- Node.js
- Express
- TypeScript
- 本地 JSON 状态文件
- Hermes Python bridge

Hermes 对接：

- Hermes 安装位置：`/Users/lucas/.local/bin/hermes`
- Hermes 项目目录：`/Users/lucas/.hermes/hermes-agent`
- Hermes Python：`/Users/lucas/.hermes/hermes-agent/venv/bin/python`
- 当前 bridge 复用 Hermes `HermesCLI` 初始化路径，再嵌入 `AIAgent`

## 4. 目录结构

```text
.
├── apps
│   ├── api
│   │   ├── src
│   │   │   ├── artifacts.ts
│   │   │   ├── hermes.ts
│   │   │   ├── hermes_bridge.py
│   │   │   ├── hermes_python.ts
│   │   │   ├── paths.ts
│   │   │   ├── server.ts
│   │   │   ├── store.ts
│   │   │   └── types.ts
│   │   └── tsconfig.json
│   └── web
│       ├── index.html
│       ├── src
│       │   ├── App.tsx
│       │   ├── lib/api.ts
│       │   ├── main.tsx
│       │   └── styles/app.css
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
- 执行 Hermes 任务。
- 维护运行中任务进程。
- 派生 `executionView`。
- 提供工作区文件列表、预览、Finder 定位。
- 提供 `/api/hermes/sessions` 只读索引：扫描 `~/.hermes/sessions/session_*.json`，只返回 session 元数据、模型、消息数、更新时间和 Cowork 任务关联，不返回原始消息正文。

`apps/api/src/hermes_bridge.py`

- Python bridge。
- 使用 Hermes 自带 venv 启动。
- 通过 `HermesCLI` 加载 Hermes 配置、provider、model、fallback、credentials。
- 初始化 `AIAgent`。
- 通过 NDJSON 事件回传给 Node。

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
- `task.completed`
- `task.failed`

`apps/api/src/hermes_python.ts`

- Node 侧启动 `hermes_bridge.py`。
- 解析 `HC_EVENT` 事件。
- 返回 `finalResponse`、`sessionId`、`stdout`、`stderr`、`events`。
- Node 侧最终会对事件做二次增强：给工具事件补 `category` / `summary`，并从 stdout/stderr 中推断网页调研、文件读写、命令执行、MCP/工具调用和错误事件。推断事件会标记 `synthetic: true`，避免依赖 Hermes 当前 callbacks 暴露程度。

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
- 聚合 Hermes Provider、当前 custom endpoint、`custom_providers` 和 Cowork 本地模型选项，形成模型设置页的 Provider/模型候选列表。
- 支持把模型候选写回 Hermes `config.yaml` 的 `model.default`，写入前自动生成 `config.yaml.cowork-backup-*` 备份。
- 支持管理 Hermes `fallback_providers`，写入前自动生成 `config.yaml.cowork-backup-*` 备份；关闭备用模型时写回空列表。
- 模型设置页已从配置后台收敛为“用户能力”页面：默认展示 Hermes 默认大脑、本次任务临时模型、备用路线和模型服务状态；长期默认模型可写回 Hermes `config.yaml`，本次任务模型只影响 Cowork 发起的新任务，Provider/Base URL/凭据状态统一收进高级折叠区。
- 维护 Cowork 本地模型选项和当前选中模型。
- `Hermes 默认模型 · <当前模型>` 表示不传 `--model`，完全跟随 Hermes 当前 `config.yaml` 与路由。

`apps/api/src/mcp.ts`

- 只读解析 Hermes 的 `/Users/lucas/.hermes/config.yaml`。
- 读取 `mcp_servers` 段并返回服务名称、传输方式、启动命令、参数、地址、认证方式、Header 名称、环境变量名。
- 为已配置 MCP 生成展示元数据：按名称、命令、参数和地址推断图片图标与中文功能描述；技术配置仍在详情里展示。
- 不返回环境变量值、Header 值和密钥值；前端只展示环境变量名/Header 名称，并标注敏感值已隐藏。
- 通过 `hermes mcp test <name>` 测试单个 MCP 服务，返回连接状态、耗时、工具数量和脱敏后的测试输出。
- 支持启用/禁用写回：只修改指定服务配置块内的 `enabled: true/false`，写入前会生成 `config.yaml.cowork-backup-*` 备份。
- 支持 GitHub 市场搜索：按关键词搜索 MCP 服务候选，返回仓库信息、星标、语言、推荐 Hermes 安装命令、命令置信度、图片图标和中文功能描述。
- 支持从市场安装：后端执行 `hermes mcp add <name> --command <cmd> --args ...`，执行前备份 Hermes 配置，成功后自动调用 `hermes mcp test <name>` 并返回测试结果。
- 支持手动配置 MCP：前端填写名称、连接方式、命令/参数/URL/环境变量，也支持 Hermes `--preset`、HTTP/SSE OAuth 和 Header 认证配置；写入前备份配置，成功后自动测试。
- 支持编辑已安装 MCP：前端复用配置弹窗，服务名锁定，命令/参数/URL/认证方式可修改；环境变量和 Header 值默认不回显，留空时保留原 `env`/`headers`，填写新值时替换对应配置；后端直接更新对应配置块，写入前备份，写入后自动测试。
- 支持工具级选择：前端在 MCP 详情里根据 `hermes mcp test <name>` 发现的工具列表生成开关；后端写入 `mcp_servers.<name>.tools.include/exclude`，等价覆盖 `hermes mcp configure <name>` 的核心配置能力，写入前备份，配置在新会话生效。
- 支持删除 MCP：前端删除按钮调用后端，后端备份配置后执行 `hermes mcp remove <name>` 并刷新列表。
- 支持工具列表展示：`hermes mcp test <name>` 输出中的工具名和说明会解析成结构化列表，在 MCP 详情里展示。
- 支持 `hermes mcp serve -v` 控制台：后端可启动/停止由 Cowork 管理的 Hermes stdio MCP Server 诊断进程，返回 PID、启动命令、工作目录和最近 stdout/stderr/system 日志；前端 MCP 设置页显示运行状态和日志。注意：这是 stdio MCP Server，外部 MCP Client 通常仍需配置同一条启动命令，而不是连接 HTTP 端口。
- 支持每日 MCP 推荐：根据最近任务、错误信息和卡点提取需求关键词，搜索 GitHub MCP 候选，并按文件与文档、浏览器自动化、数据分析、办公协作、网页调研、视觉理解、记忆知识库、研发协作、本机自动化等类别分组。后端运行时每天 00:10 后自动刷新一次，也支持前端手动刷新。
- 支持 Hermes 智能 MCP 推荐：`npm run mcp:recommend:ai` 会调用 Hermes 分析最近任务和卡点，再生成搜索词并刷新推荐库。
- 支持 macOS 常驻后台：设置页启用后写入两个 LaunchAgent：
  - `com.hermes-cowork.api.plist`：登录时启动 Hermes Cowork API 后台。
  - `com.hermes-cowork.daily-mcp-ai.plist`：每天 00:10 调用 Hermes 智能生成 MCP 推荐。

### 前端

`apps/web/src/App.tsx`

- 主 UI。
- 三栏布局：
  - 左侧：品牌、当前授权工作区、Cowork 一级导航、最近任务、底部账户入口；复杂任务管理收进项目/搜索等专门页面。
  - 中间：任务结果卡、当前轮对话、欢迎页、输入框、上传附件。
  - 右侧：任务总览、Hermes Session 对齐、任务进度、最近操作、产物、参考信息、调试信息。
- 左侧一级导航已按 Cowork 产品参考图整理为：新建任务、搜索、定时任务、项目、调度、任务模板、自定义。
- 左侧工作区已按新产品图简化为当前授权工作区卡 + Recents：不再展示任务管理筛选或按工作区分组；搜索、归档、标签和工作区筛选放入专门页面。
- 搜索页：支持搜索任务标题、prompt、错误、Hermes session、执行结果、技能名和标签。
- 定时任务页：接入真实后台服务状态，展示 Cowork API 后台、每日 MCP 推荐 LaunchAgent、日志目录、下一次日报生成时间，并可手动生成 MCP 推荐日报。
- 项目页：展示授权工作区、每个工作区的任务数/完成数/运行中数量，并提供进入项目和 Finder 打开目录入口。
- 调度页：根据真实 MCP 连接器和已启用 lark skills 汇总网页浏览器、飞书办公、数据与文件三类能力，并可跳转 Connectors 或 MCP 管理。
- 任务模板页：补充中文办公模板，覆盖文件整理、文档生成、飞书办公、数据分析、网页调研，并支持分类筛选。
- 自定义页：按 Cowork 产品参考图拆成 `Skills / Connectors` 二级结构。Skills 读取真实本机 skill，支持搜索、市场/已安装切换、启用/停用、上传 `SKILL.md`；Connectors 读取真实 Hermes MCP 服务，展示已安装/启用数量、配置路径、服务说明、传输方式和配置状态，并提供“从市场添加”和“打开 MCP 管理”入口。
- 技能详情弹窗：点击技能卡片后，可查看该 skill 的 `SKILL.md` 和配套子文件内容，并可将该 skill 加入下一次任务的预载技能。
- 对话区内联执行轨迹：用户消息后展示 Hermes 的“查看详情”，包含思考摘要、状态、工具/搜索/文件操作和完成/失败事件；当前阶段会突出显示最后一条活动，并用“思考 / 检索 / 文件 / 工具 / 结果”阶段条帮助用户快速判断 Hermes 运行到哪里。
- 任务结果卡：完成、失败、停止、运行中都有统一顶部状态卡；完成后沉淀结果摘要、工作区、运行时长、Hermes Session、原生记录数、产物与引用，并提供继续追问、重新运行、归档、删除等入口。
- 对话历史降噪：任务完成后默认只保留最后一次用户提问，较早对话与最终回复收进“较早对话”；最终答案以结果卡作为主展示，避免主界面重复堆信息。
- 任务停止：运行中的任务可在对话区 pending 消息和右侧“任务进度”直接停止；后端会向 Hermes 子进程发送 `SIGTERM`，记录 `task.stopped` 事件，并避免子进程退出码把用户主动停止误判为失败。
- 任务实时流：后端新增 `/api/tasks/:taskId/stream` SSE 事件流；前端选中运行任务时自动订阅该任务快照，实时更新 live response、执行轨迹、工具事件、产物和停止/完成状态，原轮询机制保留为兜底。运行消息和右侧任务总览会显示“连接中 / 实时同步 / 轮询兜底”等状态，帮助用户判断当前是否实时连接 Hermes。
- 输入框底部模型切换：默认项跟随 Hermes 当前模型，另支持显式选择 Hermes 当前默认模型和用户添加模型；创建任务时把选中模型传给后端。
- 右侧任务上下文：顶部“任务总览”展示状态、模型、工作区、运行时长、Hermes session、思考/工具/文件/产物计数和最近活动；新增 Hermes Session 卡，对齐 Cowork 任务与 Hermes 原生 session 文件；“任务进度”保留五阶段待办；“最近操作”展示最近的工具、搜索、文件和结果事件；参考信息按当前任务展示预载技能、联网/工具来源、当前工作区文件。
- 左下角账户菜单：点击 Lucas 弹出账户菜单，可进入设置弹窗。
- 设置弹窗：包含账号、通用、MCP、模型、对话流、外部应用授权、云端运行环境、命令、规则、关于等分类；通用、模型、对话流、规则页已按录屏补齐基础控件和本地交互骨架。MCP 页拆成“本地服务 / Hermes Server / 每日推荐 / 云端”四个二级 Tab，分别承载服务管理、`hermes mcp serve` 控制台、推荐日报和未来云端配置。
- 设置弹窗已补响应式与内部滚动规则：桌面下固定弹窗高度、面板独立滚动；窄窗口下侧栏折为顶部网格，模型/MCP/定时任务等卡片栅格自动降列，避免内容撑出屏幕。
- 界面语言规范：Hermes Cowork 的按钮、标题、状态、表头、空状态和说明文案默认使用简体中文；GitHub、MCP、Hermes、OpenAI 等品牌/协议名、配置键、命令行片段和第三方返回内容可保留原文。
- 输入框键盘操作：`Enter` 发送，`Shift + Enter` 换行；点击“新建任务”和模板卡片后会自动聚焦输入框。

`apps/web/src/lib/api.ts`

- 前端 API client。
- 类型定义。

`apps/web/src/styles/app.css`

- 全部页面样式。

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
GET /api/hermes/mcp
GET /api/hermes/mcp/marketplace?q=...
GET /api/hermes/mcp/recommendations
GET /api/hermes/mcp/serve
POST /api/hermes/mcp/:serverId/test
POST /api/hermes/mcp/:serverId/enabled
POST /api/hermes/mcp/manual
POST /api/hermes/mcp/install
POST /api/hermes/mcp/recommendations/refresh
POST /api/hermes/mcp/recommendations/refresh-ai
POST /api/hermes/mcp/serve/start
POST /api/hermes/mcp/serve/stop
PATCH /api/hermes/mcp/:serverId
PATCH /api/hermes/mcp/:serverId/tools
DELETE /api/hermes/mcp/:serverId
```

全量状态：

```http
GET /api/state
```

工作区：

```http
GET /api/workspaces
POST /api/workspaces
GET /api/workspaces/:workspaceId/files
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
POST /api/models/fallbacks
```

## 8. 当前功能清单

已完成：

- 本地 Web 工作台。
- 调用 Hermes Python bridge。
- 继承 Hermes CLI 配置与模型路由。
- 多轮任务继续同一个 Hermes session。
- 自定义页：扫描真实本机 skill 并展示在 Skills 子页；Connectors 子页读取 Hermes MCP 配置中的真实服务，如 `csv-analyzer`、`sqlite`、`mimo-web-search`，用于把 MCP 从设置页逐步迁移到产品化连接器入口。
- Skill 执行接入：启用的 skill 会进入 Hermes 执行上下文；从 skill 详情点“使用技能”会把该 skill 预载到下一次任务。
- 模型切换：底部输入框可展开模型菜单，默认项显示 Hermes 当前模型；选择默认项时不传 `--model`，选择指定模型时任务创建和继续对话会携带该模型。
- 模型设置页已从 SOLO 静态壳改为 Hermes 覆盖页：围绕“默认大脑 / 本次任务模型 / 长期默认模型 / 备用路线 / 模型服务状态”组织信息，并可把候选模型写回 Hermes 默认模型；Provider、Base URL、config/env 路径和凭据状态作为高级信息折叠展示，不再把底层配置项作为主交互。
- 备用模型页覆盖 Hermes `fallback_providers`：只列出已配置且不是当前 Provider 的候选，用户开关后写回 Hermes 配置；空状态会提示先去凭据页确认服务是否可用。
- 右侧参考信息已从静态展示改为任务派生信息。
- 左侧工作区已按新产品图收敛：不再把授权目录、筛选器和项目树放进侧栏；侧栏只保留一级导航、最近任务和本机说明，项目页继续承载授权工作区管理。
- 定时任务页不再是静态占位，已读取 `BackgroundServiceStatus` 和 `HermesMcpRecommendations`；调度页不再是静态占位，已根据 MCP/skills 派生当前可调用能力。
- 账户菜单与设置弹窗：左下角 Lucas 可展开菜单，并打开多分类设置页；通用/MCP/模型/对话流/规则已具备截图中的主要行控件、开关、选择器、空状态和二级添加模型弹窗。
- MCP 设置页已改为读取 Hermes 的真实 MCP 配置；开关会写回 Hermes `config.yaml` 的 `enabled` 字段。
- MCP 设置页已从单页堆叠整理为二级 Tab：本地服务、Hermes Server、每日推荐、云端；设置弹窗改成固定高度和内部滚动，避免长内容撑出屏幕。
- MCP 服务行支持展开查看启动参数、环境变量名、工具选择模式，并可点击“测试”调用 Hermes 原生命令验证连接和工具发现。
- MCP 详情支持工具级开关：测试发现工具后，可逐个启用/停用并写回 Hermes `tools.include`；全部启用时会移除工具筛选配置。
- MCP 设置页新增 “Hermes 作为 MCP Server” 控制台：覆盖 `hermes mcp serve -v` 的启动、停止、状态和最近日志查看。
- MCP 添加入口已拆成“从市场添加 / 手动配置”；“从市场添加”已接入 GitHub 搜索和市场弹窗，支持把带有明确启动命令的候选安装到 Hermes，安装后自动刷新列表并展示测试结果。
- MCP 服务行支持编辑和删除；编辑会自动备份 Hermes 配置，保留隐藏环境变量，保存后自动测试；展开详情后，测试结果会展示发现的工具列表。
- MCP 手动配置已补齐 Hermes `mcp add` 的高级入口：可填写 preset，可为 HTTP/SSE 服务选择无认证、OAuth 或 Header；已安装服务详情会展示认证方式和 Header 名称，但不读取 Header 值。
- MCP 设置页新增“每日 MCP 推荐日报”：只展示日报摘要、手动生成入口和后台权限开关；推荐的 MCP 候选统一进入 MCP 市场展示。
- MCP 市场新增“每日推荐 / 搜索市场”切换；每日推荐内容来自推荐日报，搜索市场仍走 GitHub 搜索。
- 左侧任务区已按新的 Cowork 产品图回正为简洁 Recents 风格；搜索、归档、标签和工作区筛选等高级管理能力放在搜索页/项目页/任务详情中承载。
- 左侧栏新增当前授权工作区卡，显示当前工作区任务量/运行状态，点击进入项目页；导航文案收敛为“模板”等更短入口。
- 左侧最近任务升级为任务卡：展示状态、更新时间、结果/产物提示；运行中和失败任务有更明确底色；完成任务可一键继续追问，失败/停止任务可一键重新运行，非运行任务可直接归档。
- 项目页已按“工作区不是文件管理器，而是 Hermes 工作驾驶舱”的原则升级为工作区首页：默认展示当前工作边界、开始工作模板、最近任务、工作区产出物、常用 Skill 和关键文件；文件列表不再作为页面主角。
- 新建任务首页已按录屏调整为标题 + 任务模板卡片 + 底部输入框。
- 主任务区新增任务结果卡：完成任务会把最终回答沉淀为摘要卡，当前对话只保留最后一次用户提问，其余历史折叠；失败/停止任务提供重试和继续入口。
- Hermes Session 覆盖已推进：后端读取 `~/.hermes/sessions` 原生 session 元数据；前端在主结果卡和右侧 Session 卡展示原生消息数、模型、更新时间和 Cowork 任务关联状态。
- 右侧工作区已按用户掌控感重新收敛为三块默认信息：任务步骤进度、任务产出物、当前/本轮过程资源；工具/网站/文件会随当前步骤刷新，Skill 作为常驻资源保留，Hermes Session、运行时和原始日志退入后台调试折叠区，更多操作也降级为辅助折叠项。
- 任务运行控制已产品化：运行中可从对话区或右侧进度直接停止，停止状态会进入执行轨迹和任务进度。
- 任务详情已补 SSE 实时同步：运行中的选中任务会通过事件流更新，减少等待轮询造成的延迟；任务总览和运行消息会显示事件流状态与最近同步时间。
- 任务执行过程已做降噪：主对话只展示当前这一轮运行的过程，不再把同一任务历史轮次混在一起；运行中默认展开最近 8 条过程，完成/停止/失败后默认折叠并只保留最近关键记录；终止事件后的进程清理噪音不再进入最近操作；右侧任务上下文隐藏非运行状态下的实时同步卡片，最近操作和参考信息在任务结束后默认折叠，没有产物时不再展示空产物卡。
- 任务搜索。
- 任务工作区筛选：当前工作区 / 全部工作区。
- 任务范围筛选：活跃 / 归档 / 全部。
- 任务场景标签：文件整理 / 文档生成 / 飞书 / 数据分析 / 网页调研。
- 按任务标签筛选。
- 任务收藏置顶。
- 任务归档与恢复。
- 删除任务记录。
- 任务导出 Markdown。
- 当前筛选任务批量导出 Markdown。
- 停止运行中任务。
- 授权工作区管理。
- 上传附件到工作区。
- 拖拽文件到窗口上传到当前工作区。
- 多文件批量上传。
- 打开授权目录。
- 工作区文件列表。
- 工作区文件作为上下文插入输入框。
- 工作区文本文件预览。
- Markdown 文件渲染预览。
- CSV/TSV 文件表格预览。
- 工作区文件 Finder 定位。
- 产物识别。
- 产物识别增强：任务完成时会生成 `artifact.created` 事件，右侧“最近操作”和对话区过程流能直接显示新增产物。
- 产物下载。
- 文本产物预览。
- 产物 Finder 定位。
- Hermes 运行时状态面板：
  - bridge 模式
  - 当前模型
  - provider
  - gateway 状态
  - active sessions
  - 已配置消息平台
  - Hermes version/path
- Hermes 事件结构化展示：
  - 正文
  - 工具
  - 日志
  - 错误
  - 对话区内联“查看详情”执行轨迹
  - 待办进度
  - 步骤时间线
  - 工具调用卡片
  - 工具调用参数/返回可展开查看
  - 工具调用过滤
  - 工具参数/返回一键复制
  - 从 stdout/stderr 补充合成事件，降低对 Hermes 回调完整性的依赖

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

当前升级为：

```text
Node Adapter -> hermes_bridge.py -> HermesCLI -> AIAgent
```

好处：

- 保留 Hermes CLI 配置加载。
- 拿到 `AIAgent` callbacks。
- 能回传结构化事件。

### 9.2 为什么 bridge 必须走 HermesCLI

直接 `AIAgent()` 会绕过 Hermes CLI 的 provider/model/fallback/runtime credentials，容易出现模型配置错误。

现在 bridge 先创建 `HermesCLI`，再调用：

- `_ensure_runtime_credentials`
- `_resolve_turn_agent_config`
- `_init_agent`

然后把 callbacks 挂到 `cli.agent`。

### 9.3 工作区安全

所有工作区文件操作都必须经过：

```ts
ensureInsideWorkspace(filePath, workspacePath)
```

目的是防止 `..` 路径逃逸。

### 9.4 产物识别

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

## 11. 后续开发建议

优先级 1：

- 接 Hermes sessions 全文浏览、删除/重命名和双向同步。
- 支持选择 Hermes profile。
- 支持选择 model/provider/toolsets/skills。
- 按工具名/事件类型统计耗时与失败率。
- 支持 docx/pptx/xlsx/pdf 的高保真预览或转码预览。

优先级 2：

- 用 SQLite 替代 `data/state.json`。
- 支持自定义任务标签。
- 支持批量导出为 zip。
- 支持上传文件夹并保持目录结构。

优先级 3：

- Tauri 打包成 macOS 客户端。
- 原生文件夹选择授权。
- 菜单栏常驻。
- 系统通知。
- 自动启动后端 Adapter。

## 12. 已知限制

- 当前不是 macOS 原生客户端，还是本地 Web。
- 工作区授权目前是手动输入路径，不是系统级原生授权。
- 文件预览只覆盖文本类和小型无扩展文本文件。
- docx/pptx/xlsx/pdf 还没有高保真预览。
- 任务状态存在 `data/state.json`，大规模数据不适合长期使用。
- Hermes session 已有只读元数据索引和 Cowork 任务关联；原生 session 删除、重命名、全文浏览和双向同步还没有接。
- 工具事件依赖 Hermes 当前 callbacks 暴露程度。

## 13. 相关文档

- `Hermes_前端对接版开发文档.md`
- `Hermes_前端开发缺口与MVP计划.md`
- `SOLO_MTC_产品开发文档.md`
- 桌面截图资料：`/Users/lucas/Desktop/Hermes_Cowork_录屏关键截图`
- 外部开源参考：`https://github.com/ComposioHQ/open-claude-cowork`
  - 结构：Electron 桌面壳 + Node/Express 后端 + Claude Agent SDK / Opencode Provider + Composio Tool Router / MCP。
  - 可借鉴：桌面化外壳、SSE 流式事件、Provider 抽象、工具调用可视化、会话恢复、中止任务。
  - 不照搬：Composio/Claude SDK 不是 Hermes Cowork 的后端真源；本项目仍以本机 Hermes 配置、模型、MCP、session 和执行日志为准。
