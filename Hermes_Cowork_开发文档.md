# Hermes Cowork 开发文档

文档状态：

- 这是仓库唯一主开发文档。
- 原阶段定版、架构体检、早期 MVP 文档已经合并到本文档。
- 新开发、代码审查、GitHub 交接和新对话恢复上下文时，都以本文档为准。
- `README.md` 只保留项目简介、运行命令和本文档入口。

当前阶段结论：

- Hermes Cowork 已经从静态前端原型推进到本机 Hermes 工作台原型。
- 当前主线不是扩散新功能，而是工程稳定、后端覆盖、信息降噪和客户端化准备。
- 文件编辑、主题化、客户端化和 Hermes 后端融合都属于重功能，必须先按本文档的模块边界推进。
- 技术路线定为 React + TypeScript UI、Node + TypeScript Local Adapter、SQLite 本地状态、Electron macOS 客户端壳、Hermes managed runtime。
- Hermes 暂不直接混入 Cowork 主目录，先作为 Cowork 管理的 runtime：负责安装、版本锁定、升级、回滚和兼容性复测。

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

前端 API 默认直连后端 Adapter：

```text
http://127.0.0.1:8787
```

可通过环境变量覆盖：

```bash
VITE_API_BASE=http://127.0.0.1:8787 npm run dev:web
```

这样页面请求不会依赖 Vite 的 `/api` 代理；如果 `5173` 只负责页面热更新，后端请求仍会稳定打到 `8787`。

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
- Hermes Runtime Adapter：普通任务优先走 Hermes `tui_gateway` 常驻进程，必要时回退 Python bridge

Hermes 对接：

- Hermes 安装位置：`/Users/lucas/.local/bin/hermes`
- Hermes 项目目录：`/Users/lucas/.hermes/hermes-agent`
- Hermes Python：`/Users/lucas/.hermes/hermes-agent/venv/bin/python`
- 常驻运行通道：`tui_gateway.entry` JSON-RPC，按授权工作区启动，负责普通任务、流式输出、停止和上下文 usage。
- 回退运行通道：`hermes_bridge.py` 复用 Hermes `HermesCLI` 初始化路径，再嵌入 `AIAgent`；主要用于预加载 Cowork skill、上下文读取/压缩兜底和 gateway 不可用时的任务执行。

## 3.1 系统架构图

Hermes Cowork 的产品边界必须按下面这张图理解：前端可以有多个入口，但后端 Adapter 和 Hermes 本机配置才是真源。不要让某个入口单独维护一份模型、MCP、工作区或任务状态。

```mermaid
flowchart LR
  subgraph UI["React 前端 多入口"]
    Composer["对话输入区\n模型菜单 / 附件 / 发送"]
    Settings["设置弹窗\n模型 / MCP / 对话流 / 规则"]
    Sidebar["左侧导航\n任务 / 工作区 / 技能"]
    RightPanel["右侧任务上下文\n步骤 / 产物 / 过程资源"]
  end

  subgraph Adapter["Node Adapter 127.0.0.1:8787"]
    StateApi["/api/state\n任务、消息、工作区"]
    ModelApi["/api/models\n模型候选、默认模型、fallback"]
    McpApi["/api/hermes/mcp\nMCP 服务、市场、推荐"]
    TaskApi["/api/tasks\n创建、继续、停止、流式事件"]
    Runtime["Hermes Runtime Adapter\ngateway 优先 / bridge 回退"]
    ContextApi["/api/tasks/:id/context\n上下文用量、手动压缩"]
    FileApi["/api/files\n授权工作区、产物、预览"]
  end

  subgraph Hermes["本机 Hermes"]
    Config["~/.hermes/config.yaml\nmodel / mcp / fallback"]
    Sessions["~/.hermes/sessions\n原生 session 元数据"]
    StateDb["~/.hermes/state.db\nsession token 与消息索引"]
    Compressor["Context Compressor\n阈值、保护消息、压缩次数"]
    Gateway["tui_gateway.entry\nJSON-RPC 常驻进程"]
    Agent["HermesCLI + AIAgent\n真实执行能力"]
  end

  Composer --> ModelApi
  Composer --> TaskApi
  Settings --> ModelApi
  Settings --> McpApi
  Sidebar --> StateApi
  RightPanel --> StateApi
  RightPanel --> FileApi
  ModelApi --> Config
  McpApi --> Config
  TaskApi --> Runtime
  Runtime --> Gateway
  Runtime --> Agent
  TaskApi --> Sessions
  ContextApi --> Runtime
  ContextApi --> StateDb
  ContextApi --> Compressor
  RightPanel --> ContextApi
  FileApi --> Agent
```

架构约束：

- 前端多个入口只能消费同一套 API，不允许各自拼静态清单。
- 写 Hermes 配置只能通过后端 Adapter 做备份、归一化和敏感信息遮蔽。
- UI 文案可以按场景重组，但状态含义必须来自同一份后端数据。
- 新增入口时，必须先确认它复用哪个 API、哪个状态字段、哪个后端归一化函数。

## 3.2 多入口一致性契约

凡是同一个能力在两个以上位置出现，都要在开发前先登记“共同真源”。这部分是防止后续重复出现“设置页正确、对话底部错误”这类问题的硬规则。

| 能力 | 前端入口 | 共同真源 | 必须复用的前端逻辑 |
| --- | --- | --- | --- |
| 模型候选与选择 | 对话底部模型菜单、设置 > 模型、本次任务模型列表、长期默认模型列表 | `/api/models`、`~/.hermes/config.yaml`、`readHermesModelCatalog()`、`listModelOptions()` | `modelGroupsForProvider()`、`groupModelOptionsForMenu()` |
| 模型服务配置与重填 Key | 设置 > 模型、对话底部“重填当前 Key / 模型服务设置” | `/api/models`、`/api/models/configure`、`configureHermesModel()`、`parseHermesAuthList()` | 同一个 `modelPanelOpen` 配置弹窗，入口必须能预选当前 provider 和模型 |
| MCP 服务 | 设置 > MCP、自定义 > Connectors、MCP 市场弹窗 | `/api/hermes/mcp`、Hermes MCP config | 同一套 MCP server 状态、说明、图标和启停逻辑 |
| 任务运行状态 | 主对话区、右侧任务上下文、左侧工作区会话树 | `/api/state`、任务事件流、Hermes session 元数据 | `Task`、`executionView`、右侧步骤/产物/资源分层 |
| 上下文用量、过程资源与压缩 | 右侧任务上下文、未来对话框上方风险提示 | `/api/tasks/:taskId/context`、`/api/tasks/:taskId/context/compress`、任务 events、工作区文件索引 | `ContextResourcesCard`，合并展示上下文用量、文件大小/占比、网页、工具和 Skill；不再单独展示来源/阈值/消息数表格 |
| 产物与文件 | 主结果、右侧产物、工作区文件、附件入口 | `/api/artifacts`、`/api/workspaces/*/files` | 同一套文件预览、Finder 打开、下载逻辑 |
| Skills | 技能页、任务输入区预载技能、右侧参考信息 | `/api/skills`、本机 skill 目录 | 同一套 skill 名称、启停和文件查看逻辑 |

开发检查清单：

- 改一个入口前，先用 `rg` 搜索同一能力的其他入口。
- 改数据结构前，先改后端归一化函数，再让所有入口消费结果。
- 新增按钮、弹窗、菜单时，必须说明它读哪个 API、写哪个 API。
- 只允许 UI 层做展示分组，不允许 UI 层维护另一份业务真源。
- 每次修复“某入口不一致”后，把入口和共同真源补回本文档。

## 3.3 工作区产品规划（2026-04-29）

工作区的新定义：工作区不是一个筛选器，也不是一个普通项目卡片，而是用户授权给 Hermes 的本机文件夹，以及围绕这个文件夹产生的任务会话、文件、产物和上下文。左侧栏的工作区入口必须像目录一样存在；点击工作区进入文件管理页，点击工作区下的工作会话进入对话页。

参考依据：

- Web 端可以使用浏览器目录选择能力（MDN `showDirectoryPicker()`），但浏览器出于隐私不会稳定暴露绝对路径，不能完全满足 Hermes 后端需要的本机工作目录。
- Electron `dialog.showOpenDialog({ properties: ['openDirectory'] })` / Tauri dialog 这类 macOS 客户端能力可以调原生目录选择器，适合未来客户端化。
- VS Code Workspace、ChatGPT Projects、Claude Projects 都把“工作区/项目”理解成文件、会话和上下文的集合，而不是单一聊天记录。

工作区信息原则：

- 静态可见信息必须是用户能决策的信息：当前是否可工作、需要重新授权、有哪些文件可用、有哪些任务会话、下一步能做什么。
- 原始路径、mtime、session id、后台计数、配置细节默认隐藏到详情或 tooltip。
- 空状态必须给行动入口，例如“选择文件夹授权”“拖入文件”“新建对话”，不要展示无法处理的技术状态。
- 删除和归档的文案必须说清边界：归档/删除会话记录不删除工作区真实文件。

左侧栏结构：

```text
新建任务

工作区                         +
  小红书 redcase                 ...
    优化小红书 CMO 逐字稿        归档 / 删除
  lucas                          ...
    根据录屏开发软件
    翻译桌面文件

技能
定时任务
调度
```

- 工作区标题右侧“+”是新增工作区入口，默认打开 macOS Finder 目录选择，不让用户手填路径。
- 工作区行点击：进入该工作区的文件管理页。
- 工作区展开后展示该工作区内的活跃会话；会话点击进入对话页。
- 工作区行菜单：重命名、打开目录、重新授权、移除工作区。
- 会话行菜单：归档、删除。归档后从当前会话列表移入该工作区下的“已归档”折叠区，可恢复；删除只删 Cowork 任务记录和会话索引，不删工作区文件。
- 工作区下方的全局入口只保留高频且已确定的能力：技能、定时任务、调度。技能排第一；搜索和模板暂不作为左侧主入口；最近任务不再重复展示，工作区会话树就是主要会话入口。

工作区文件管理页：

- 顶部只显示工作区名称和一个简短状态，例如“可工作”“目录不存在，需要重新授权”。
- 主区域是文件浏览器：面包屑、搜索、列表/网格切换、文件类型筛选、上传/拖入、新建任务。
- 文件行支持预览、在 Finder 中显示、作为下一次任务上下文、复制相对路径。
- 右侧轻量展示最近会话和最近产物；如果没有有效内容，不展示空卡片。
- 点击文件夹进入下级目录，点击文件按类型预览或提示用 Hermes 处理。

实现路线：

1. 已完成：Web 本地版新增 `POST /api/system/pick-directory`，由 Node Adapter 在 macOS 上调用系统目录选择器，返回用户选择的 POSIX 路径；前端只显示“选择文件夹”，不显示手动路径输入。
2. 已完成：保留当前 `/api/workspaces` 作为写入真源，并新增 `PATCH /api/workspaces/:id`、`DELETE /api/workspaces/:id`、`GET /api/workspaces/:id/tree`；工作区页开始消费目录树，不再只复用 flat file list。`GET /api/workspaces/:id/summary` 仍作为后续聚合接口。
3. 部分完成：前端已经让点击工作区进入文件管理页、点击会话进入对话页；下一阶段再把导航状态显式整理成 `activeSurface = workspace | task | custom | settings`。
4. 任务会话继续复用现有归档/删除 API；如果删除 API 缺少后端覆盖，要补齐 `DELETE /api/tasks/:taskId`，并保证不会碰工作区真实文件。
5. 客户端化阶段用 Tauri/Electron 原生目录选择替换 AppleScript，并在 macOS sandbox 场景使用安全书签保存目录授权。

验收标准：

- 新建工作区时弹出系统 Finder 选择目录，不要求用户输入路径。
- 左侧点击工作区显示文件管理页，点击会话显示对话页，不互相跳转。
- 工作区文件页首屏只展示状态、文件、任务入口和必要操作，不铺后台调试信息。
- 工作区文件页支持当前目录面包屑、当前目录搜索、文件夹进入、文件预览、Finder 定位和作为上下文发送。
- 会话可以归档和删除，操作后左侧列表即时更新；工作区文件不会被误删。
- 刷新页面后仍能恢复工作区列表、当前工作区和活跃会话。

### 3.4 可调三栏布局原则（2026-04-30）

Hermes Cowork 的主界面是桌面式三栏：左侧工作区导航、中间任务对话、右侧工作区/任务上下文。三栏宽度不是一次性写死的视觉参数，而是用户可以持续调节的工作环境偏好。

- 左侧导航和右侧工作区之间必须有可拖拽分隔线，拖动后写入 `localStorage`，刷新后保留。
- 左侧导航用于工作区、会话和全局入口，默认窄而稳定；右侧工作区用于任务步骤、产物、过程资源和文件预览，默认可以占更大空间。
- 中间对话区保持可读宽度，不随屏幕无限扩张；当右侧工作区变宽时，对话区应收缩到够用状态。
- 三个区域必须按自身容器宽度自适应，而不是只按浏览器总宽度适配：窄对话区要图标化顶部和底部按钮，窄右侧工作区要折叠卡片操作、资源 Tab 和产物按钮。
- 文件预览模式复用右侧工作区宽度，拖宽右侧后应优先给预览内容更多空间。
- 低于窄屏断点时隐藏右侧工作区，避免三栏挤压成不可读状态。

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
- 提供 `/api/hermes/sessions` 只读索引：扫描 `~/.hermes/sessions/session_*.json`，只返回 session 元数据、模型、消息数、更新时间和 Cowork 任务关联，不返回原始消息正文。
- 提供 `/api/tasks/:taskId/context` 和 `/api/tasks/:taskId/context/compress`：前者读取当前任务对应 Hermes session 的上下文用量，后者调用 Hermes 原生手动压缩能力并把新 session 状态写回任务事件。

`apps/api/src/file_preview.ts`

- 后端文件预览服务模块，已从 `server.ts` 抽离。
- 对外提供 `readPreviewBody()` 和 `sendInlineFile()`。
- 负责文本、Markdown、CSV、HTML、JSON、docx/doc/rtf、pptx/ppsx、xlsx/xlsm 的正文级预览，以及 PDF、图片、音视频、HTML 等 raw inline 响应的 MIME / Content-Disposition。
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

- Hermes 是外部开源 runtime，Cowork 不直接复制或改写 Hermes 源码；Cowork 后端负责做 Adapter 和治理层。
- 读取本机 Hermes 版本、当前 tag/commit、GitHub 最新 tag、落后提交数、工作树是否有未提交改动。
- 维护 Cowork 已验证 Hermes 基线 tag，给前端返回“可继续使用 / 升级前需复测 / 暂不建议升级”的兼容性判断。
- 提供自动复测接口：检查 `hermes version/status`、Cowork 模型 Adapter、MCP Adapter，并通过 `runHermesPythonBridge` 发起一个真实 Hermes 小任务，验证模型、session 和事件桥接链路。
- 更新区域只做检测、自动复测和升级前守卫，不自动运行 `hermes update`；真正升级前必须先备份 Hermes 配置并跑模型、MCP、session、流式事件的 smoke test。

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
- 仍是应用壳和主要状态容器，但已经把 file-preview、markdown、workspace、chat、settings/models、settings/mcp 的核心视图和部分 API 边界拆到 feature 模块；当前不要再把文件编辑、模型设置、MCP 设置等重功能直接堆回 `App.tsx`。
- 三栏布局：
  - 左侧：品牌、新建任务、工作区目录树、工作区内会话、技能、定时任务、调度、底部账户入口；工作区是授权目录入口，不是普通筛选器。
  - 中间：当前轮对话、最终回答、轻量过程摘要、输入框、上传附件。输入框不能膨胀成主画布，默认保持三行左右的可写高度；输入框底部操作按桌面工具条处理，工作区、模型、发送等高频动作优先 icon 化，完整含义放在 `title/aria-label`。
  - 右侧：只默认展示任务拆解、任务产出物、上下文与资源。Hermes Session、运行时、原始日志、标签编辑、导出等维护入口不作为默认静态卡片展示。
- 左侧一级导航已收敛为：新建任务、工作区目录树、技能、定时任务、调度、账户设置。搜索和模板暂不放主导航，避免和工作区会话树重复。
- 左侧工作区已经回到目录树结构：工作区行代表授权文件夹，展开后展示该工作区内的工作会话；点击工作区进入文件管理页，点击会话进入对话页。
- 搜索页：支持搜索任务标题、prompt、错误、Hermes session、执行结果、技能名和标签；当前作为内部能力保留，暂不在左侧主入口展示。
- 定时任务页：接入真实后台服务状态，展示 Cowork API 后台、每日 MCP 推荐 LaunchAgent、日志目录、下一次日报生成时间，并可手动生成 MCP 推荐日报。
- 工作区页：点击左侧工作区进入，展示该授权目录的文件管理、最近会话、最近产物和可执行入口；项目页/搜索页只作为高级管理和跨工作区检索入口。
- 工作区第一阶段已落地：左侧工作区以目录树展示，工作区下挂活跃会话；点击工作区进入文件管理页，点击会话进入对话页；“授权文件夹”通过本机 API 调 macOS Finder 选择目录，不再展示手动路径输入表单。
- 工作区第二阶段已落地：后端新增目录树、重命名、重新授权和移除工作区 API；文件管理页接入面包屑、当前目录搜索、文件夹进入、文件预览、Finder 定位和作为上下文发送。移除工作区只删除 Cowork 记录和该工作区会话索引，不删除真实文件；`.DS_Store`、`.gitkeep` 等系统占位文件默认不展示。
- 调度页：根据真实 MCP 连接器和已启用 lark skills 汇总网页浏览器、飞书办公、数据与文件三类能力，并可跳转 Connectors 或 MCP 管理。
- 任务模板页：补充中文办公模板，覆盖文件整理、文档生成、飞书办公、数据分析、网页调研，并支持分类筛选。
- 自定义页：按 Cowork 产品参考图拆成 `Skills / Connectors` 二级结构。Skills 读取真实本机 skill，支持搜索、市场/已安装切换、启用/停用、上传 `SKILL.md`；Connectors 读取真实 Hermes MCP 服务，展示已安装/启用数量、配置路径、服务说明、传输方式和配置状态，并提供“从市场添加”和“打开 MCP 管理”入口。
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
- 右侧任务上下文：默认顺序固定为任务拆解、任务产出物、上下文与资源。任务拆解不能写死固定五步，必须优先消费 Hermes 显式 `steps/todos/task.plan` 类事件；当 Hermes 未暴露正式拆解时，再从本轮 thinking/status/tool/artifact/complete 事件推导动态步骤。步骤命名必须面向用户，使用中文动宾短语，例如“确认交付目标 / 检索资料 / 读取文件 / 处理文件 / 检查与修正 / 交付产物”；Plan、ReAct、Reflection、Result 只作为每步后面的中文小标签（计划/行动/校验/结果），不能在顶部铺成静态模式条；表情化 thinking、后台心跳、`The user is`、`reasoning.available`、`Hermes 已返回最终结果` 等原始事件不能作为用户可见步骤或说明。
- 左下角账户菜单：点击 Lucas 弹出账户菜单，可进入设置弹窗。
- 设置弹窗：包含账号、通用、MCP、模型、对话流、外部应用授权、云端运行环境、命令、规则、关于等分类；通用、模型、对话流、规则页已按录屏补齐基础控件和本地交互骨架。MCP 页拆成“本地服务 / Hermes Server / 每日推荐 / 云端”四个二级 Tab，分别承载服务管理、`hermes mcp serve` 控制台、推荐日报和未来云端配置。
- 关于页新增 Hermes 后台更新区：读取本机 Hermes 版本、GitHub 最新 tag、Cowork 已验证基线、工作树状态和基础检查结果，先做升级风险判断；页面默认只展示升级结论、检查更新、运行复测和自动更新入口，版本路径、基础检查、升级建议、复测明细和命令输出全部收进折叠诊断区，避免后台信息铺满主界面。静态可见信息必须是用户可决策信息：当前无需更新且复测通过时显示“当前很好，无需操作”，本机仓库改动等维护信息只放在诊断详情；旧自动更新失败结果如果被新的成功复测覆盖，不再继续挂红色卡片。
- 设置弹窗已补响应式与内部滚动规则：桌面下固定弹窗高度、面板独立滚动；窄窗口下侧栏折为顶部网格，模型/MCP/定时任务等卡片栅格自动降列，避免内容撑出屏幕。
- 界面语言规范：Hermes Cowork 的按钮、标题、状态、表头、空状态和说明文案默认使用简体中文；GitHub、MCP、Hermes、OpenAI 等品牌/协议名、配置键、命令行片段和第三方返回内容可保留原文。
- 输入框键盘操作：`Enter` 发送，`Shift + Enter` 换行；点击“新建任务”和模板卡片后会自动聚焦输入框。

`apps/web/src/features/file-preview/FilePreviewPanel.tsx`

- 前端文件预览 feature 模块，已从 `App.tsx` 抽离。
- 对外导出 `FilePreviewPanel`、`Preview`、`FilePreviewTarget`、`FilePreviewState`、`previewKind()`、`isInlinePreviewKind()`。
- 负责文件详情面板、PDF/HTML/image/media iframe 或原生预览、Markdown/演示文稿渲染、CSV/表格预览、正文级文档预览和复制路径。
- 后续文件编辑 UI 先在这个 feature 里扩展“查看 / 编辑 / 历史”，再通过后端文件 API 写入，不要在 `App.tsx` 里新增编辑器。

`apps/web/src/features/markdown/MarkdownContent.tsx`

- Markdown 渲染模块，已从 `App.tsx` 抽离。
- 统一使用 `react-markdown + remark-gfm`，并保留链接白名单，避免模型输出 HTML/JS 被执行。
- 对话正文和文件预览都应复用这个组件。

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
- 负责授权/重新授权工作区、移除工作区、上传文件、读取 flat 文件列表、读取目录树、Finder 显示、workspace 文件 raw URL 和预览内容读取。
- 后续文件编辑写入、历史版本、权限检查、目录批量操作都优先加在这里，而不是回到总 `lib/api.ts`。

`apps/web/src/features/chat/MessageBody.tsx`

- 对话消息正文渲染模块，已从 `App.tsx` 抽离。
- Assistant 回复统一走 `MarkdownContent`，用户消息保持普通文本展示。
- 后续优化流式输出样式、消息分段、引用块和代码块时，先从这里进入。

`apps/web/src/features/chat/ChatComposer.tsx`

- 对话输入框和底部模型/运行参数入口，已从 `App.tsx` 抽离。
- 负责预载 Skill 条、输入框、工作区入口、模型菜单、思考强度、显示原始思考开关、重填 Key、模型服务设置、发送/停止按钮。
- 只通过 props 接收模型列表、Hermes reasoning 状态和任务运行状态；后续优化模型选择和思考强度入口时，优先改这里。

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

`apps/web/src/features/chat/taskState.ts`

- 对话任务状态合并工具，已从 `App.tsx` 抽离。
- 负责把 Hermes stream 回来的 task payload 合并进全局 `AppState`，并按 id 去重、按创建时间排序 messages/artifacts。
- 后续如果 stream payload 需要增量 patch、事件去重、artifact 去重策略调整，优先改这里。

`apps/web/src/features/settings/models.tsx`

- 模型设置 feature 模块，已从 `App.tsx` 抽离。
- 负责“设置 > 模型”的完整页面、底部入口共用的模型候选分组规则、Hermes provider 归一化、MiMo 版本分组、模型凭据状态展示，以及“配置或重填模型 Key”弹窗。
- 后续修复“设置入口和对话底部入口模型表不一致”“同供应商多模型重复填 Key”“MiMo 新模型分组”“删除模型服务”等问题时，优先改这里和 `apps/api/src/models.ts`，不要在 `App.tsx` 里新增第二套模型 UI。

`apps/web/src/features/settings/mcp.tsx`

- MCP 设置 feature 模块，已从 `App.tsx` 抽离。
- 负责“设置 > MCP”的本地服务、Hermes Server、每日推荐、云端四个 Tab，以及 MCP 市场、手动配置/编辑、服务详情、工具开关、连接器摘要。
- 后续修复“MCP 页面拥挤”“市场分类与推荐日报”“已安装 MCP 说明/图标/工具级开关”“Hermes mcp serve 诊断”等问题时，优先改这里和 `apps/api/src/mcp.ts`，不要在 `App.tsx` 里新增第二套 MCP UI。

`apps/web/src/lib/http.ts`

- 前端通用 HTTP 基础层，已从 `lib/api.ts` 分离。
- 统一维护 `API_BASE`、`apiUrl()`、`request()`、`parseError()` 和 JSON header。
- 后续按 feature 拆 API service 时，都复用这里，不重复写 fetch 错误处理。

`apps/web/src/lib/api.ts`

- 前端 API client。
- 类型定义。

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

## 8. 当前功能清单

已完成：

- 本地 Web 工作台。
- 调用 Hermes Python bridge。
- 继承 Hermes CLI 配置与模型路由。
- 多轮任务继续同一个 Hermes session。
- 多轮任务默认继续同一个 Hermes session；如果用户在同一任务里切换了底部模型，Cowork 会开启新的 Hermes session，避免旧 session 继续沿用之前的模型和 provider。
- 自定义页：扫描真实本机 skill 并展示在 Skills 子页；Connectors 子页读取 Hermes MCP 配置中的真实服务，如 `csv-analyzer`、`sqlite`、`mimo-web-search`，用于把 MCP 从设置页逐步迁移到产品化连接器入口。
- Skill 执行接入：启用的 skill 会进入 Hermes 执行上下文；从 skill 详情点“使用技能”会把该 skill 预载到下一次任务。
- 模型切换：底部输入框可展开模型菜单，默认项显示 Hermes 当前模型；选择默认项时不传 `--model`，选择指定模型时任务创建和继续对话会携带该模型。
- 模型设置页已从 SOLO 静态壳改为 Hermes 覆盖页：围绕“默认大脑 / 本次任务模型 / 长期默认模型 / 备用路线 / 模型服务状态”组织信息，并可把候选模型写回 Hermes 默认模型；Provider、Base URL、config/env 路径和凭据状态作为高级信息折叠展示，不再把底层配置项作为主交互。
- 模型设置页已补齐直接配置闭环：“配置模型服务”弹窗可选择服务商、模型、Base URL、API Key 和 API 模式，保存后直接更新 Hermes 默认模型；服务商和模型下拉来自 Hermes 内置模型目录并合并 Cowork 版本补充，密钥只写入本机 Hermes 配置，前端不回显。
- 模型设置页新增“刷新官网模型”：用户不需要手动维护模型 ID，点击后后端会重新读取 Hermes 目录并从已接入的供应商官网补充新模型；供应商选择已收敛为中国大模型服务商。
- 备用模型页覆盖 Hermes `fallback_providers`：只列出已配置且不是当前 Provider 的候选，用户开关后写回 Hermes 配置；空状态会提示先去凭据页确认服务是否可用。
- 右侧参考信息已从静态展示改为任务派生信息。
- 左侧工作区规划已回正：授权目录必须作为左侧目录树存在，工作区下展示该目录内的工作会话；点击工作区进入文件管理页，跨工作区搜索和归档仍放在搜索/高级页面。
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
- 左侧任务区已从“最近任务”风格升级为“工作区目录 + 会话”结构；最近任务不再作为侧栏重复区，工作区会话树承担主要会话入口。
- 左侧栏工作区已经改为工作区目录行：点击进入文件管理页，行内菜单承载打开目录、重命名、重新授权和移除工作区。
- 工作区管理第二阶段已补齐：后端支持工作区目录树读取、重命名、重新授权和移除；前端文件管理页支持面包屑、当前目录搜索、文件夹进入、文件预览、Finder 定位和作为上下文发送，并隐藏 `.DS_Store`、`.gitkeep` 等无决策价值文件。
- 左侧工作区下方的全局入口已收敛为技能、定时任务、调度；技能排第一，搜索和模板暂不进入主导航。
- 工作区首页规划已调整为文件管理页：文件列表、目录导航、预览和作为上下文发送是主角；最近任务、产物和常用 Skill 只作为辅助信息，避免把后台统计铺满界面。
- 工作区文件页已做第一版：顶部只显示可工作状态和行动入口；主区域展示工作区文件，支持作为上下文、预览、Finder 定位；右侧只在有内容时展示会话和产物。
- 新建任务首页已按录屏调整为标题 + 任务模板卡片 + 底部输入框。
- 主任务区已改为“主线答案优先”：完成任务只显示轻量状态条，最终回答保留在对话正文；当前对话保留最后一次用户提问和最终回复，其余历史折叠；失败/停止任务提供重试和继续入口。
- Hermes Session 覆盖已推进：后端读取 `~/.hermes/sessions` 原生 session 元数据；前端在主结果卡和右侧 Session 卡展示原生消息数、模型、更新时间和 Cowork 任务关联状态。
- Hermes 上下文覆盖已接入：后端通过 Hermes `context_compressor` 和 session 数据返回上下文用量，前端已把上下文管理与过程资源合并成“上下文与资源”；文件按工作区索引匹配大小并计算文件占比，网页、工具、Skill 按任务 events 派生，任务运行结束后仍可调用 Hermes 原生 `/compress` 手动压缩当前 session。
- 右侧工作区已按用户掌控感重新收敛为三块默认信息：任务拆解、任务产出物、上下文与资源；任务拆解已从固定五步升级为事件驱动，并在 UI 上区分 Plan-and-Execute、ReAct 和 Self-Reflection 信号；工具/网站/文件会随当前步骤刷新，Skill 作为常驻资源保留，Hermes Session、运行时、阈值、原始日志等退入后台诊断或按需动作，不作为默认静态信息铺开。
- Web 版布局已支持侧栏收起：顶部右侧按钮、右侧“工作区”标题图标都可隐藏/恢复任务上下文面板，主对话区会真实扩宽；左侧导航也可收起并通过左上角按钮恢复；点击产物或工作区文件预览时会自动展开右侧文件详情。
- 侧栏收起后重新校准了默认信息权重：任务页默认把更多宽度分给右侧工作区，右侧列必须铺满到窗口边缘，避免露出无意义背景空白；对话输入框限制到适合流式对话的最大宽度和三行左右高度，底部按钮 icon 化；“更多操作”“后台调试”不进入右侧默认信息流；工作区文件页突破通用 980px 页面宽度，预览模式改为“窄文件列表 + 宽文件预览”，文档预览宽度提升到 860px，并保留窄屏单列回退。
- 左侧栏已完成一次信息架构降噪：去掉和工作区会话树重复的“最近”区，去掉低价值主入口“搜索”和未定版的“模板”；工作区下方只保留“技能、定时任务、调度”，其中技能排第一；底部账户区移除“Hermes 命令行”说明，只保留账号与设置入口。
- 左侧工作区语义已澄清：会话“归档”只从当前列表收起，不删除内容，并进入同一工作区的“已归档”折叠区；“重新授权”是重新选择本机文件夹，不是刷新页面；Default Workspace 是兜底工作区，不能移除，只能重新授权到别的目录。
- 重新授权工作区后，工作区名称应跟随新授权文件夹名更新；后端 PATCH `/api/workspaces/:id` 在只收到 path 时也会用路径 basename 兜底更新名称。
- 任务运行控制已产品化：运行中可从对话区或右侧进度直接停止，停止状态会进入执行轨迹和任务进度。
- 任务详情已补 SSE 实时同步：运行中的选中任务会通过事件流更新，减少等待轮询造成的延迟；任务总览和运行消息会显示事件流状态与最近同步时间。
- 任务执行过程已做降噪：主对话只展示当前这一轮运行的过程，不再把同一任务历史轮次混在一起；运行中和完成后都默认只露出最后一条关键活动，完整过程折叠到“查看过程记录”；实时输出区域取消内部滚动，让页面自然滚动；终止事件后的进程清理噪音不再进入最近操作；右侧任务上下文隐藏非运行状态下的实时同步卡片，最近操作和参考信息在任务结束后默认折叠，没有产物时不再展示空产物卡。
- 后端联调记录：2026-04-29 使用真实 Hermes 任务 `2afda9fd-b372-461e-98a2-03813d4c787a` 验证，`executionView.response` 返回“Hermes 后端事件分层验证成功。”，`executionView.activity` 返回来自 Hermes 的桥接启动、推理轮次、思考和任务完成事件，证明当前对话流不只是前端静态壳。
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
- 主流文件预览：PDF、图片、音视频、HTML 原样内嵌预览；docx/doc/rtf、pptx/ppsx、xlsx/xlsm 走内容级抽取预览。
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
- `approval.request` 是阻塞终态：Cowork 当前不能代用户审批 Hermes 命令时，必须停止当前 Hermes 运行、标记任务为失败/需要处理，并给出下一步含义；不能让旧任务一直 `running`，否则右侧上下文、主对话和 SSE 会持续显示过期状态。
- 前端多入口必须共享 `executionTraceRows`、`groupTraceRows`、`traceSummaryParts` 这组函数，避免对话区、右侧工作区和调试区各自解释一遍事件。
- `rawOutput`、`rawLog`、完整工具 payload 只能在调试页或右侧详情里出现，不进入主对话默认视图。
- 产物卡、文件变更卡、权限请求卡是独立对象，不能混在过程列表里。过程列表只回答“刚刚发生了什么”，对象卡回答“用户现在可以操作什么”。

参考成熟实现时遵循同一个原则：Vercel AI SDK 的 `UIMessage` 把 text、reasoning、tool、data parts 分层；LangGraph streaming 明确区分 `updates`、`messages`、`custom` 等 stream mode；assistant-ui 也把 text、reasoning、tool-call、data 作为 message parts。Cowork 不直接照搬组件库，但要保留这种“消息正文、工具对象、状态更新、调试数据分通道”的架构。

视觉规则：

- 过程摘要默认折叠，权重低于最终回答。
- 运行中只显示当前动作和必要计数；进入下一阶段时，右侧非常驻资源可以刷新，主对话仍保留可追溯摘要。
- 完成后最终答案不能被折叠，答案永远是主内容；被折叠的是过程，不是答案。
- 等待 Hermes 返回正文时只显示轻量状态行，不能复用普通消息卡片样式。
- 对话区必须有底部滚动锚点：用户停留在底部时，SSE 新事件和新正文自动跟随；用户主动上翻时暂停跟随，避免打断阅读。
- 颜色只表达语义：绿色成功/结果，蓝色检索/链接，黄色文件/产物，红色异常，灰色过程。

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

架构前置：

- 下一阶段不要继续把重功能堆进 `App.tsx` 和 `app.css`；文件预览/编辑、工作区、对话、设置、模型、MCP 都应逐步拆成 feature 模块。
- Hermes 不要立即把源码混进 Cowork 主目录，先作为 Cowork 管理的 runtime：负责安装、版本锁定、升级、回滚和兼容性复测。

工程稳定阶段拆分顺序：

1. 已完成第一刀：`file-preview`。前端拆出 `apps/web/src/features/file-preview/FilePreviewPanel.tsx` 和 `apps/web/src/features/markdown/MarkdownContent.tsx`；后端拆出 `apps/api/src/file_preview.ts`。
2. 第二刀基本完成：`workspace`。已拆左侧工作区树 `SidebarWorkspaceNode.tsx`、工作区文件页 `ProjectsView.tsx`、目录浏览器 `WorkspaceBrowser.tsx`、预览目标转换 `previewTargets.ts` 和 workspace API service `workspaceApi.ts`；后续如继续深化，再拆 workspace hook/provider。
3. 第三刀基本完成：`chat`。已拆 `MessageBody.tsx`、`ChatComposer.tsx`、`ExecutionTracePanels.tsx`、`executionTraceModel.ts`、`TaskFocusPanel.tsx`、`TaskInspectorCards.tsx`、`ToolEventsPanel.tsx`、`messageUtils.ts`、`useTaskSelection.ts`、`useTaskStream.ts`、`useTaskContext.ts` 和 `taskState.ts`；后续如继续深化，再把任务操作拆成 hook/provider。
4. 第四刀基本完成：`settings/models`。已拆 `apps/web/src/features/settings/models.tsx`，模型设置页、配置/重填 Key 弹窗、模型候选分组、Hermes provider 归一化和 MiMo 版本分组都在这个模块；后续如继续深化，再把模型状态请求和保存流程拆成 `modelsApi` / hook。
5. 第五刀基本完成：`settings/mcp`。已拆 `apps/web/src/features/settings/mcp.tsx`，MCP 设置页、市场、手动配置/编辑、serve 面板、工具级开关和 Connectors 摘要都在这个模块；后续如继续深化，再把 MCP API 请求和市场搜索状态拆成 `mcpApi` / hook。
6. 样式主题化第一刀完成：已拆 `apps/web/src/styles/tokens.css`、`base.css`、`shell.css`、`sidebar.css`、`chat.css`、`settings.css`、`workspace.css`、`file-preview.css`；第一批响应式规则已按模块归位。`app.css` 继续保留尚未模块化的通用页面、技能页、调度页和 inspector 基础样式。
7. 每一刀都必须先跑 `npm run -s typecheck`，涉及前端渲染的再跑 `npm run -s build` 和浏览器验证。

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

- 第一版 macOS 客户端优先走 Electron；它可以直接内嵌现有 React/Vite 前端和 Node Adapter，改造成本最低。
- Tauri 可作为第二阶段优化方向，不建议当前切换。
- 客户端化后用 Electron 原生文件夹选择和 macOS 安全书签保存授权；Web 本地版先用 Node Adapter 调系统目录选择器。
- 菜单栏常驻。
- 系统通知。
- 自动启动后端 Adapter。

Hermes runtime 融合顺序：

1. Managed Runtime：Cowork 管理用户机器上的 Hermes 安装、路径、版本、venv、binary、升级、回滚和兼容性复测。
2. Pinned Hermes：Cowork 管理一个固定兼容版本的 Hermes clone 或 submodule，安装和升级都先在隔离环境验证。
3. Integrated Client：等 managed runtime 稳定后，再决定是否 fork/vendor Hermes，或者继续保持 managed clone。

## 12. 已知限制

- 当前不是 macOS 原生客户端，还是本地 Web。
- 工作区授权已改为左侧“+ / 授权文件夹”触发 macOS Finder 目录选择；当前仍是本地 Web + Node Adapter 方案，未来打包成客户端后要替换为 Tauri/Electron 原生授权和安全书签。
- 文件预览已经统一到右侧文件详情面板：点击工作区文件或任务产物时，右侧任务上下文会切换为文件预览、Finder 定位、复制路径和“作为上下文”操作。
- 当前预览覆盖文本类、小型无扩展文本文件、Markdown、CSV/TSV、PDF、图片、音视频、HTML、docx/doc/rtf、pptx/ppsx、xlsx/xlsm。
- Office 文件当前是内容级预览：docx/doc/rtf 抽正文，pptx/ppsx 抽幻灯片文字，xlsx/xlsm 抽前几个工作表为表格；不保留原版分页、字体、图表、图片和复杂排版。后续如需高保真，应接系统 Quick Look 或专门文档渲染服务。
- 任务状态存在 `data/state.json`，大规模数据不适合长期使用。
- Hermes session 已有只读元数据索引和 Cowork 任务关联；原生 session 删除、重命名、全文浏览和双向同步还没有接。
- 工具事件依赖 Hermes 当前 callbacks 暴露程度。

## 13. 参考资料

- 桌面截图资料：`/Users/lucas/Desktop/Hermes_Cowork_录屏关键截图`
- 外部开源参考：`https://github.com/ComposioHQ/open-claude-cowork`
  - 结构：Electron 桌面壳 + Node/Express 后端 + Claude Agent SDK / Opencode Provider + Composio Tool Router / MCP。
  - 可借鉴：桌面化外壳、SSE 流式事件、Provider 抽象、工具调用可视化、会话恢复、中止任务。
  - 不照搬：Composio/Claude SDK 不是 Hermes Cowork 的后端真源；本项目仍以本机 Hermes 配置、模型、MCP、session 和执行日志为准。
