# 产品决策与交互原则
> 保留开发过程中已经定下来的产品方案、工作区原则、多入口一致性、布局和主题化规则。
> 主入口见 [`../Hermes_Cowork_开发文档.md`](../Hermes_Cowork_开发文档.md)。

## 3.3 开发方案解释区

这一部分面向产品判断。它解释当前每块功能为什么这样做、是否符合 Hermes 后端能力、后续还有什么升级空间。以后重功能开发前，先在这里补充方案，再进入具体代码。

### 3.3.1 对话与流式输出

当前方案：

- 对话区不再直接渲染 Hermes 原始 stdout，而是先把后端事件归类成 message parts：用户文本、Hermes 正文、文件卡片、审批卡、运行过程、变更摘要。
- 运行中过程显示在对话流里，右侧工作区只保留产品级任务拆解、产物和上下文资源。
- Hermes 没有返回产品级 plan 时，右侧任务拆解宁可空着，也不把工具调用清单伪装成任务计划。

为什么这样做：

- Hermes 后端事件有工具、状态、thinking、approval、message、artifact 等不同语义。直接显示会造成噪声，用户很难判断 Agent 到底在做什么。
- 产品层需要“对话主线”和“执行过程”分开：最终答案必须可读，过程信息必须可追踪但不抢主线。

可升级空间：

- 如果 Hermes 后续暴露明确的 plan / todo / reflection 结构化事件，Cowork 应把 plan 放入右侧任务拆解，把 todo/action 放入对话过程流。
- 如果 Hermes 暴露 token usage、step id、tool call id，可进一步让右侧资源和对话过程精准同步。

判断标准：

- 用户发出消息后，自己的气泡必须立刻出现。
- Hermes 运行中必须有可读进度，不允许长时间空白。
- 最终答案不应被折叠进过程记录。
- 审批、文件、产物不能只是文字，必须是可操作卡片。

### 3.3.2 文件、附件与预览

当前方案：

- 文件进入对话时，先作为本轮附件 chip 出现在输入框，再上传到当前授权工作区。
- 发送后，用户消息保留附件卡片；Hermes 产出文件时，Assistant 回复下方展示产物卡片。
- 点击文件卡片后，右侧工作区让位给文件预览区；顶部提供本机打开、Finder 定位、固定、全屏和关闭。

为什么这样做：

- 对用户来说，文件首先是“我要让 AI 处理的上下文”，不是单纯拖入工作区的后台上传结果。
- Web 预览很难 100% 等同本机 Office/WPS/Keynote 渲染，所以高保真优先级是：本机默认应用打开 > macOS Quick Look > Web 内联预览 > 文本兜底。

可升级空间：

- 做客户端化后，可用 Electron/Tauri 调用更稳定的文件选择、Quick Look、系统安全书签和本机打开。
- 文件编辑阶段要新增 `file_edit.ts` 或并列 API，支持备份、保存、版本和撤销，不能把编辑逻辑塞进预览模块。

判断标准：

- 拖文件到对话框时，必须进入输入框附件区，而不是只上传到工作区。
- 预览区不能导致三栏宽度抖动、外层页面滚动错乱或内容出界。
- Office 文件如果 Web 预览不可信，必须明确给“本机打开”作为主操作。

### 3.3.3 模型设置

当前方案：

- Hermes 的模型配置仍以 `~/.hermes/config.yaml` 和 `.env` 为真源。
- Cowork 只提供用户友好的配置入口：供应商、模型、Base URL、Key/Plan Key、fallback、reasoning。
- 输入框底部只显示已配置可用模型和本次运行参数；完整配置放在设置 > 模型。

为什么这样做：

- 模型不是 Cowork 自己发起的第三方 API 调用，真实执行仍由 Hermes 决定。
- 同一个供应商的 Key 和 Base URL 应该复用，用户不应为 MiMo 多个模型反复填写同一组凭据。

可升级空间：

- provider 模型目录继续做官网刷新和 Hermes 内置目录合并。
- 更细的 thinking / fast / reasoning 能力要先确认 Hermes 是否有稳定配置字段，再进入 UI。

判断标准：

- 设置页和输入框入口必须展示同一批模型。
- 保存模型后，下一次真实对话必须使用新模型或明确跟随 Hermes 默认模型。
- 401/invalid key 必须给重填入口，不能只报错。

### 3.3.4 MCP 与 Skills

当前方案：

- MCP 管理覆盖 Hermes `mcp_servers` 和官方 `hermes mcp` 命令：本地/远程服务添加、测试、删除、启停、工具级 include/exclude、OAuth/Header/preset 配置和 Hermes MCP Server 诊断。
- Skills 管理覆盖本机 skill 文件：扫描、上传、启停、查看 `SKILL.md` 和子文件、加入下一次任务。

为什么这样做：

- MCP 是 Hermes 的外部工具连接层；Skill 是提示词和工作方法层。两者都影响 Agent 能力，但产品入口要分开。
- 用户看到的应是“这个工具/技能能做什么”，不是一堆命令、env、headers。

可升级空间：

- MCP 不再维护 Cowork 自建 GitHub 市场或每日推荐；当前固定 Hermes 内核没有类似 Skills Hub 的 MCP 官方市场。能力来源以 Hermes 官方 MCP add/list/test/configure/login/serve、本机源码中可验证的 preset/OAuth/serve 能力，以及未来官方生态入口为准。
- gateway 目前不完整支持 Cowork 自定义 skill 预载时，应保留 bridge 回退或等待 Hermes 增加参数。

判断标准：

- 已安装 MCP 必须有功能说明、图标、连接状态和工具列表。
- Skill 详情必须能打开完整文件树。
- 任务过程中调用的 MCP/Skill 要进入过程资源，不要污染任务拆解。

### 3.3.5 定时任务与 Hermes Cron

当前方案：

- 定时任务页直接管理 Hermes Cron，而不是 Cowork 自己保存一套假任务。
- 后端 Adapter 读取列表时优先走 Hermes 官方 Dashboard `/api/cron/jobs`，避免 Cowork 自己猜字段；Dashboard 不可用时回退读取 `~/.hermes/cron/jobs.json`。
- create/update/pause/resume/run/remove 仍通过 Hermes 自己的 `cronjob` 工具函数执行，输出读取 `~/.hermes/cron/output/<job_id>/`。
- 前端只展示对用户有决策意义的信息：是否自动执行、下次执行时间、绑定工作区、绑定 Skill、最近输出和可操作动作。
- 定时任务页不展示“页面边界”“下一步”这类开发解释；必要说明合并到自动运行状态卡里。
- 新建/编辑任务时，执行时间使用“每天 / 每周 / 每月 / 每隔 / 高级”的周期选择器，前端生成 Hermes 能识别的 schedule 字符串，不让普通用户直接填写 `every 1d` 或 cron 表达式。
- 绑定 Skill 使用类目选择器、搜索和多选列表，不再把所有 skill 平铺成标签；类目由 skill 名称、描述和路径推断，用于支撑后续大量 skill 的管理。

为什么这样做：

- Hermes Cron 运行在后台，不继承当前聊天上下文，也不能临场反问用户，所以 Cowork 必须让任务说明自包含。
- “运行一次”在 Hermes 语义上是把 job 排到下一次 scheduler tick；如果 gateway 没运行，任务不会自动触发，所以界面必须显示 gateway 状态，而不是假装已经执行。

可升级空间：

- 如未来重新需要 MCP 推荐，先验证 Hermes 是否提供原生生态/Hub/API，再决定是否作为真实 Hermes Cron job 生成，不再恢复 Cowork 独立 LaunchAgent。
- 可以增加输出文件卡片和右侧预览，把 cron 输出纳入任务产物体系。
- 可以增加 delivery 配置页，把 Feishu/Slack/Email 等投递目标从高级字段变成可配置渠道。

判断标准：

- 新建/编辑/删除必须真实改变 Hermes cron 数据，不允许只改 Cowork 状态。
- 定时任务 prompt 需要提示用户写清目标、目录、输入来源和输出格式。
- gateway 未运行时，静态提示只能告诉用户下一步动作，不展示无用日志。

### 3.3.6 官方 Dashboard Adapter

当前方案：

- Cowork 后端新增 `hermes_dashboard.ts`，负责启动或探测 `hermes dashboard --no-open`。
- Hermes Dashboard 的受保护 API 需要本机会话 token；Cowork 后端从 Dashboard HTML 中读取 `window.__HERMES_SESSION_TOKEN__`，再用 `X-Hermes-Session-Token` 请求官方 API。
- 第一阶段已代理只读接口：状态、Skills、Toolsets、Cron jobs、Sessions、Config、Env 状态和 Model info。写入类接口按能力逐项开放：Skills 启停写 Hermes `/api/skills/toggle`；Toolsets 启停由 Cowork Adapter 受控写入 Hermes `platform_toolsets.cli`。
- 设置 > 运行环境已使用 Dashboard adapter 的真实状态：显示官方后台是否启动、官方 API 是否可读、Hermes 版本、Gateway 状态、配置版本和活动会话数，并提供“启动 Hermes 后台”入口。

为什么这样做：

- 过去 Cowork 为了覆盖 Hermes 能力，直接读配置文件或调用局部 CLI/工具函数，容易漏掉 Hermes 已经在官方 Dashboard 中整理好的状态。
- 官方 Dashboard API 是 Hermes 自己面向本机 UI 的结构化后端，比继续猜配置文件字段更稳。
- Token 只留在 Cowork 本机后端，不暴露给前端，避免把 Hermes Dashboard 的完整权限交给浏览器页面。

可升级空间：

- 下一步评估 Cron 写入类接口是否也切到官方 Dashboard API；切换前必须确认备份、错误恢复和 UI 提示。
- Skills 页已对齐官方 `/api/skills`：官方 API 负责技能清单和启用状态，本机扫描只负责文件预览和 Cowork 上传技能补充。
- 技能页已集成官方 `/api/tools/toolsets`：Toolsets 和 Skill、MCP 服务同属“能力管理”，不再把工具集只放在调度页里。Toolset 启停通过 Cowork 后端读取 Hermes config 后写回 `platform_toolsets.cli`，避免前端直接编辑 YAML。
- 写入类能力逐项开放：Skill toggle 和 Toolset toggle 已有受控写入；Cron create/update、其他 Config update 必须先补 UI、备份、错误恢复和测试。

尚未前端化的 Hermes 官方后台能力：

- Provider OAuth：官方有 Provider OAuth 的开始授权、提交、轮询和删除能力；Cowork 目前模型设置仍主要走 Key/Base URL 配置，尚未做“在前端完成授权”的流程。
- 官方日志：官方 `/api/logs` 能读取后台日志；Cowork 目前只在错误卡片和少量调试区展示归一化错误，尚未做用户可理解的日志诊断页。
- 原始配置查看与编辑：官方 `/api/config/raw` 能读取或更新 raw config；Cowork 目前只开放模型、MCP、Cron 等产品化配置，不直接暴露 raw config 编辑。
- 使用量分析：官方 `/api/analytics/usage` 可作为模型调用、会话和工具使用统计来源；Cowork 尚未做“本机使用报告”页面。
- Dashboard 主题和插件：官方 `/api/dashboard/themes`、`/api/dashboard/plugins` 属于官方 UI 自身能力；Cowork 暂不需要直接前端化，除非未来支持管理 Hermes Dashboard 插件。
- Gateway 重启与 Hermes 更新动作：官方有 gateway restart / update 类写入动作；Cowork 现有更新页有复测和自动更新守卫，但还未把官方写入接口作为主通道。
- Action 状态和 Session 详情：官方可读取具体 action 状态、session 列表、搜索、详情、messages，并暴露 `DELETE /api/sessions/{session_id}`；Cowork 已完成列表、搜索、命中定位、详情、重命名、删除和继续对话。当前结论是：读取和搜索优先使用官方 Dashboard；删除虽然有官方 REST，但 Cowork 保留带备份和确认的安全删除链路；重命名、继续、导出暂未发现官方 Dashboard REST，继续由 Cowork adapter / gateway 承担。
- Toolset 内部工具级策略：Cowork 已能显示每个 Hermes Toolset 下有哪些工具，并能启停整个 Toolset；但还没有做“只启用/禁用某个内置工具”的细粒度 UI。这个能力要等 Hermes 官方配置字段稳定后再做，避免 Cowork 自己发明一套不兼容的工具策略。

判断标准：

- 前端新增 Hermes 后端能力时，优先看官方 Dashboard API 是否已有结构化数据。
- 只读代理可以先接；写入代理必须有明确用户入口、备份策略和失败恢复。
- Dashboard 不可用时，界面必须说明“需要启动 Hermes 后台服务”，不能显示内部 token、端口错误或 Python traceback。

### 3.3.7 工作区与本机客户端化

当前方案：

- 工作区是用户授权给 Hermes 的本机文件夹，不是聊天分类。
- 点击工作区进入文件管理页；点击工作区内会话进入对话页。
- 当前 Web 版通过 Node Adapter 调 macOS 能力；后续客户端化再用 Electron/Tauri 管理窗口、目录授权、托盘、后台常驻和自动更新。

为什么这样做：

- Hermes 的能力依赖本机文件和本机命令，工作区必须表达“哪些文件允许 AI 读写”。
- 纯 Web 对本机文件权限、系统弹窗、Office 高保真预览和后台常驻支持有限，客户端化是必要方向。

可升级空间：

- Kernel Manager：Cowork 管理固定 Hermes Core 的安装、版本锁定、补丁、升级、回滚和兼容性复测。
- 文件编辑：在授权目录内支持主流文本/Markdown/表格的安全编辑，Office 先走本机应用打开和产物回收。

判断标准：

- 授权工作区必须通过 Finder 选择，不要求用户手填路径。
- 归档/删除会话不能误删真实文件。
- 升级 Hermes 前后必须自动复测 Cowork 的核心链路。

### 3.3.8 UI 主题与信息披露

当前方案：

- 全局视觉以 `tokens.css` 为真源，设置 > 外观只修改主题 token，不直接改组件内部样式。
- 静态可见信息必须能帮助用户做决策；后台日志、原始 payload、诊断细节进入折叠或高级页。

为什么这样做：

- AI Agent 产品的信息量天然很大，如果不做分层，用户会看到大量“看不懂也处理不了”的后台信息。
- 主题化只有建立字号、颜色、密度、组件状态的统一 token，后续客户端化和暗色模式才不会反复返工。

可升级空间：

- 增加主题 profile：办公密度、宽松密度、深色高对比。
- 给每个页面建立视觉层级检查表：页面标题、区域标题、主操作、次操作、状态、空态、诊断。

判断标准：

- 主界面默认只展示任务目标、过程、产物、上下文资源和下一步动作。
- 红色/错误信息必须告诉用户下一步能做什么。
- 暗色和亮色都必须来自同一套语义 token。

## 3.4 多入口一致性契约

凡是同一个能力在两个以上位置出现，都要在开发前先登记“共同真源”。这部分是防止后续重复出现“设置页正确、对话底部错误”这类问题的硬规则。

| 能力 | 前端入口 | 共同真源 | 必须复用的前端逻辑 |
| --- | --- | --- | --- |
| 模型候选与选择 | 对话底部模型菜单、设置 > 模型、本次任务模型列表、长期默认模型列表 | `/api/models`、`~/.hermes/config.yaml`、`readHermesModelCatalog()`、`listModelOptions()` | `modelGroupsForProvider()`、`groupModelOptionsForMenu()` |
| 模型服务配置与重填 Key | 设置 > 模型、对话底部“重填当前 Key / 模型服务设置” | `/api/models`、`/api/models/configure`、`configureHermesModel()`、`parseHermesAuthList()` | 同一个 `modelPanelOpen` 配置弹窗，入口必须能预选当前 provider 和模型 |
| MCP 服务 | 技能页 > MCP 服务、设置 > MCP、原生添加弹窗 | `/api/hermes/mcp`、Hermes MCP config、`hermes mcp` 原生命令 | 同一套 MCP server 状态、说明、图标、启停、测试和工具开关逻辑 |
| 任务运行状态 | 主对话区、右侧任务上下文、左侧工作区会话树 | `/api/state`、任务事件流、Hermes session 元数据 | `Task`、`executionView`、右侧步骤/产物/资源分层 |
| 上下文用量、过程资源与压缩 | 右侧任务上下文、未来对话框上方风险提示 | `/api/tasks/:taskId/context`、`/api/tasks/:taskId/context/compress`、任务 events、工作区文件索引 | `ContextResourcesCard`，合并展示上下文用量、文件大小/占比、网页、工具和 Skill；不再单独展示来源/阈值/消息数表格 |
| 产物与文件 | 主结果、右侧产物、工作区文件、附件入口 | `/api/artifacts`、`/api/workspaces/*/files` | 同一套文件预览、Finder 打开、下载逻辑 |
| 对话附件 | 输入框附件 chip、用户消息附件、右侧上下文文件 | `/api/workspaces/:id/files`、`Message.attachments`、任务创建/继续请求的 `attachments` | 附件先上传到授权工作区，再作为消息附件和 Hermes prompt 文件路径进入任务 |
| Skills | 技能页、任务输入区预载技能、右侧参考信息 | `/api/skills`、本机 skill 目录 | 同一套 skill 名称、启停和文件查看逻辑 |
| Hermes 原生会话 | 左侧“会话”入口、任务继续对话、右侧任务上下文 | `~/.hermes/sessions/session_*.json`、`~/.hermes/state.db.sessions.title`、`/api/hermes/sessions`、`/api/hermes/sessions/:sessionId`、`PATCH /api/hermes/sessions/:sessionId`、`DELETE /api/hermes/sessions/:sessionId` | `apps/api/src/hermes_sessions.ts` 统一读取列表、详情、标题写入和删除前备份；前端只消费归一化后的 summary/detail，不直接拼 session 文件或写 SQLite |

开发检查清单：

- 改一个入口前，先用 `rg` 搜索同一能力的其他入口。
- 改数据结构前，先改后端归一化函数，再让所有入口消费结果。
- 新增按钮、弹窗、菜单时，必须说明它读哪个 API、写哪个 API。
- 只允许 UI 层做展示分组，不允许 UI 层维护另一份业务真源。
- 每次修复“某入口不一致”后，把入口和共同真源补回本文档。

## 3.6 工作区产品规划（2026-04-29）

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

## 3.7 可调三栏布局原则（2026-04-30）

Hermes Cowork 的主界面是桌面式三栏：左侧工作区导航、中间任务对话、右侧工作区/任务上下文。三栏宽度不是一次性写死的视觉参数，而是用户可以持续调节的工作环境偏好。

- 左侧导航和右侧工作区之间必须有可拖拽分隔线，拖动后写入 `localStorage`，刷新后保留。
- 左侧导航用于工作区、会话和全局入口，默认窄而稳定；右侧工作区用于任务步骤、产物、过程资源和文件预览，默认可以占更大空间。
- 中间对话区保持可读宽度，不随屏幕无限扩张；当右侧工作区变宽时，对话区应收缩到够用状态。
- 三个区域必须按自身容器宽度自适应，而不是只按浏览器总宽度适配：窄对话区要图标化顶部和底部按钮，窄右侧工作区要折叠卡片操作、资源 Tab 和产物按钮。
- 文件预览模式复用右侧工作区宽度，拖宽右侧后应优先给预览内容更多空间。
- 低于窄屏断点时隐藏右侧工作区，避免三栏挤压成不可读状态。

## 3.8 UI 层级与主题化原则（2026-05-01）

当前 UI 进入主题化第一阶段。目标不是局部换色，而是建立全局层级：同一级信息在不同区域必须使用同一套字号、颜色、边框和阴影 token。

视觉真源：

- `apps/web/src/styles/tokens.css` 是全局设计 token 真源。
- `apps/web/src/styles/base.css` 负责把 token 接到 body、字体、代码字体、focus、基础背景。
- `apps/web/src/features/settings/SettingsPages.tsx` 的 `AppearanceSettingsSection` 是用户可见的外观后台。
- `apps/web/src/features/settings/useSettingsPreferences.ts` 负责把外观设置持久化到 `localStorage`，并写入 `document.documentElement` 的 CSS 变量。

层级定义：

| 层级 | token | 使用位置 |
| --- | --- | --- |
| 页面主标题 | `--text-display` / `--text-title` | 工作区页标题、当前任务标题、设置页标题 |
| 区域标题 | `--text-section` | 左侧品牌、右侧卡片标题、Markdown 二级/三级标题 |
| 正文 | `--text-body` | 消息正文、设置项标题、文件列表主信息 |
| 说明 | `--text-caption` | 路径、状态说明、设置项 detail、按钮辅助信息 |
| 辅助微文案 | `--text-micro` | 时间、数量、压缩后的状态补充 |
| 代码/路径/命令 | `--font-code` + `--code-font-size` | Markdown 代码块、命令片段、本机路径 |

外观后台第一阶段已落地：

- 设置弹窗新增 `外观` 分类，主题选择从 `通用` 移入 `外观`。
- 支持亮色、暗色、跟随系统。
- 支持强调色、浅色背景、浅色前景、UI 字体、代码字体、半透明侧边栏、对比度、UI 字号、代码字号、字体平滑。
- 强调色、字体、字号会即时写入 CSS 变量并持久化。
- 暗色模式暂不使用浅色背景/前景配置覆盖，避免黑字压暗底；后续如要支持暗色自定义，应新增独立的暗色主题字段。
- UI 细节第二轮已收敛：顶部长标题最多展示两行，输入框高度降低，外观预览改为真实三栏结构，不再展示开发者代码 diff；右侧任务拆解在 Hermes 未返回产品级计划时显示空态，不显示无意义进度条。
- UI 细节第三轮已收敛：失败/停止任务顶部卡片压缩成状态条，错误详情最多两行；右侧空态降低视觉重量；左侧工作区和会话选中态统一使用 surface/token；发送按钮改为强调色，模型选择入口使用中性 surface。
- UI 细节第四轮已收敛：默认三栏比例调整为左侧约 286px、右侧约 32% 且上限按主区保留空间约束；默认右侧宽度从过宽工作区收窄到约 560px，主对话区拿回阅读空间；整体背景改为近白工作台，不再使用可见网格；右侧资源 Tab 在 550px 级别保持单行。
- UI 细节第五轮已收敛：左下角从“账号菜单”改为本机偏好菜单，去掉管理账号和退出登录；弹出层支持点击外部空白区域关闭；菜单内主题切换直接写入同一份外观主题配置，和设置 > 外观保持一致。

开发约束：

- 新组件优先使用 token，不要再写散落的 `font-size: 13px`、`#fffdf7`、`#d8d1bd` 这类局部常量。
- 旧变量 `--ink`、`--panel`、`--line`、`--moss` 等保留为兼容层，新增样式应优先使用 `--foreground`、`--surface`、`--border`、`--accent`。
- 卡片半径默认不超过 `--radius-card`，按钮和输入框用 `--radius-control`。
- UI 静态信息必须能帮助用户决策；后台状态、原始日志、技术细节进折叠详情或设置诊断区。
- 后续做完整主题后台时，应把 token 分成基础色、语义色、字号、密度和组件态五类，不要让设置页直接散改组件 CSS。

## 8. 当前功能清单

已完成：

- 本地 Web 工作台。
- 调用 Hermes Python bridge。
- 继承 Hermes CLI 配置与模型路由。
- 多轮任务继续同一个 Hermes session。
- 多轮任务默认继续同一个 Hermes session；如果用户在同一任务里切换了底部模型，Cowork 会开启新的 Hermes session，避免旧 session 继续沿用之前的模型和 provider。
- 技能页：扫描真实本机 skill 并展示在“技能”子页；“MCP 服务”子页读取 Hermes MCP 配置中的真实服务，如 `csv-analyzer`、`sqlite`、`mimo-web-search`；“工具集”子页读取 Hermes 官方 Dashboard Toolsets，用于统一管理 Skill、MCP 和 Hermes 内置工具。能力中心总览已把三类能力的启用数量、配置风险和跨入口跳转放到技能页顶部。
- Skill 执行接入：启用的 skill 会进入 Hermes 执行上下文；从 skill 详情点“使用技能”会把该 skill 预载到下一次任务。
- 模型切换：底部输入框可展开模型菜单，默认项显示 Hermes 当前模型；选择默认项时不传 `--model`，选择指定模型时任务创建和继续对话会携带该模型。
- 模型设置页已从 SOLO 静态壳改为 Hermes 覆盖页：围绕“默认大脑 / 本次任务模型 / 长期默认模型 / 备用路线 / 模型服务状态”组织信息，并可把候选模型写回 Hermes 默认模型；Provider、Base URL、config/env 路径和凭据状态作为高级信息折叠展示，不再把底层配置项作为主交互。
- 模型设置页已补齐直接配置闭环：“配置模型服务”弹窗可选择服务商、模型、Base URL、API Key 和 API 模式，保存后直接更新 Hermes 默认模型；服务商和模型下拉来自 Hermes 内置模型目录并合并 Cowork 版本补充，密钥只写入本机 Hermes 配置，前端不回显。
- 模型设置页新增“刷新官网模型”：用户不需要手动维护模型 ID，点击后后端会重新读取 Hermes 目录并从已接入的供应商官网补充新模型；供应商选择已收敛为中国大模型服务商。
- 备用模型页覆盖 Hermes `fallback_providers`：只列出已配置且不是当前 Provider 的候选，用户开关后写回 Hermes 配置；空状态会提示先去凭据页确认服务是否可用。
- 右侧参考信息已从静态展示改为任务派生信息。
- 左侧工作区规划已回正：授权目录必须作为左侧目录树存在，工作区下展示该目录内的工作会话；点击工作区进入文件管理页，跨工作区搜索和归档仍放在搜索/高级页面。
- 定时任务页不再是静态占位，已升级为 Hermes Cron 真实管理入口：job 列表优先读取 Hermes 官方 Dashboard `/api/cron/jobs`，不可用时回退本机配置；同时展示 gateway 状态和输出目录，支持 job 新建、编辑、暂停/恢复、排队运行和删除。页面边界已收敛为 Hermes Cron 本身，不再展示 Cowork 后台服务或 MCP 推荐数据，避免把系统维护项误认为用户创建的定时任务。调度页不再是静态占位，已根据 MCP/skills 派生当前可调用能力。
- 官方 Dashboard adapter 第一阶段已接入：Cowork 后端可启动/探测 `hermes dashboard --no-open`，读取本机会话 token，并代理官方只读接口 `status / skills / toolsets / cron jobs / sessions / config / env / model info`；设置 > 运行环境已前端化官方后台状态和启动入口。Cron 和 Skills 已优先消费官方结构化真源，调度页已读取官方 Toolsets，后续继续把写入类能力逐项迁移到官方接口。
- 账户菜单与设置弹窗：左下角 Lucas 可展开菜单，并打开多分类设置页；通用/MCP/模型/对话流/规则已具备截图中的主要行控件、开关、选择器、空状态和二级添加模型弹窗。
- MCP 设置页已改为读取 Hermes 的真实 MCP 配置；开关会写回 Hermes `config.yaml` 的 `enabled` 字段。
- MCP 设置页已从单页堆叠整理为二级 Tab：本地服务、Hermes Server、云端；设置弹窗改成固定高度和内部滚动，避免长内容撑出屏幕。
- MCP 服务行支持展开查看启动参数、环境变量名、工具选择模式，并可点击“测试”调用 Hermes 原生命令验证连接和工具发现。
- MCP 详情支持工具级开关：测试发现工具后，可逐个启用/停用并写回 Hermes `tools.include`；全部启用时会移除工具筛选配置。
- MCP 设置页新增 “Hermes 作为 MCP Server” 控制台：覆盖 `hermes mcp serve -v` 的启动、停止、状态和最近日志查看。
- MCP 添加入口已收敛为 Hermes 原生添加：支持 stdio、HTTP/SSE、preset、OAuth、Header、环境变量和参数，安装后自动刷新列表并展示测试结果。
- MCP 服务行支持编辑和删除；编辑会自动备份 Hermes 配置，保留隐藏环境变量，保存后自动测试；展开详情后，测试结果会展示发现的工具列表。
- MCP 手动配置已补齐 Hermes `mcp add` 的高级入口：可填写 preset，可为 HTTP/SSE 服务选择无认证、OAuth 或 Header；已安装服务详情会展示认证方式和 Header 名称，但不读取 Header 值。
- MCP 非原生市场、GitHub 搜索安装、每日推荐日报和独立推荐 LaunchAgent 已取消；后续只接 Hermes 官方 MCP 生态能力，不再维护第二套 Cowork 市场数据。
- 左侧任务区已从“最近任务”风格升级为“工作区目录 + 会话”结构；最近任务不再作为侧栏重复区，工作区会话树承担主要会话入口。
- 左侧栏工作区已经改为工作区目录行：点击进入文件管理页，行内菜单承载打开目录、重命名、重新授权和移除工作区。
- 工作区管理第二阶段已补齐：后端支持工作区目录树读取、重命名、重新授权和移除；前端文件管理页支持面包屑、当前目录搜索、文件夹进入、文件预览、Finder 定位和作为上下文发送，并隐藏 `.DS_Store`、`.gitkeep` 等无决策价值文件。
- 左侧工作区下方的全局入口已收敛为技能、定时任务、调度；技能排第一，搜索和模板暂不进入主导航。
- 工作区首页规划已调整为文件管理页：文件列表、目录导航、预览和作为上下文发送是主角；最近任务、产物和常用 Skill 只作为辅助信息，避免把后台统计铺满界面。
- 工作区文件页已做第一版：顶部只显示可工作状态和行动入口；主区域展示工作区文件，支持作为上下文、预览、Finder 定位；右侧只在有内容时展示会话和产物。
- 新建任务首页已按录屏调整为标题 + 任务模板卡片 + 底部输入框。
- 主任务区已改为“主线答案优先”：完成任务只显示轻量状态条，最终回答保留在对话正文；当前对话保留最后一次用户提问和最终回复，其余历史折叠；失败/停止任务提供重试和继续入口。
- Hermes Session 覆盖继续推进：后端已拆出 `apps/api/src/hermes_sessions.ts`，只读解析 `~/.hermes/sessions` 原生 session 元数据和消息详情；前端新增左侧“会话”入口，可搜索、浏览消息、查看模型/来源/工具和打开关联 Cowork 任务。
- Hermes 上下文覆盖已接入：后端通过 Hermes `context_compressor` 和 session 数据返回上下文用量，前端已把上下文管理与过程资源合并成“上下文与资源”；文件按工作区索引匹配大小并计算文件占比，网页、工具、Skill 按任务 events 派生，任务运行结束后仍可调用 Hermes 原生 `/compress` 手动压缩当前 session。
- 右侧工作区已按用户掌控感重新收敛为三块默认信息：任务拆解、任务产出物、上下文与资源；任务拆解只展示产品级结构化计划，最多展示 3-6 个与用户目标直接相关的步骤。Hermes 返回的工具级 todo/执行清单放入对话区过程流；工具/网站/文件放入上下文与资源或过程记录，Skill 作为常驻资源保留，Hermes Session、运行时、阈值、原始日志等退入后台诊断或按需动作，不作为默认静态信息铺开。
- Web 版布局已支持侧栏收起：顶部右侧按钮、右侧“工作区”标题图标都可隐藏/恢复任务上下文面板，主对话区会真实扩宽；左侧导航也可收起并通过左上角按钮恢复；点击产物或工作区文件预览时会自动展开右侧文件详情。
- 侧栏收起后重新校准了默认信息权重：任务页默认把更多宽度分给右侧工作区，右侧列必须铺满到窗口边缘，避免露出无意义背景空白；对话输入框限制到适合流式对话的最大宽度和三行左右高度，底部按钮 icon 化；“更多操作”“后台调试”不进入右侧默认信息流；工作区文件页突破通用 980px 页面宽度，预览模式改为“窄文件列表 + 宽文件预览”，文档预览宽度提升到 860px，并保留窄屏单列回退。
- 左侧栏已完成一次信息架构降噪：去掉和工作区会话树重复的“最近”区，去掉低价值主入口“搜索”和未定版的“模板”；工作区下方只保留“技能、定时任务、调度”，其中技能排第一；底部从账户区改为本机偏好入口，移除“Hermes 命令行”、管理账号和退出登录等不符合本机产品定位的信息。
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
- 主流文件预览：PDF、图片、音视频、HTML 原样内嵌预览；doc/docx/rtf、ppt/pptx/ppsx、xls/xlsx/xlsm 优先走 macOS Quick Look 生成的 HTML 高保真预览包，不再用抽文本/抽表格冒充原版预览。
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
