# SOLO MTC 产品开发文档

## 1. 产品定位

SOLO MTC 是一个面向办公与知识工作的 AI Agent 工作台。用户通过自然语言发起任务，系统自动调用模型、技能、文件系统、网页检索、飞书/文档/表格等外部工具，完成资料整理、文档生成、PPT/Excel 分析、文件管理、内容改写等工作，并在任务执行过程中展示进度、参考信息和最终产物。

录屏中产品主标语为：

> More Than Coding
> 多场景办公任务，交给 SOLO 搞定

## 2. 目标用户

- 内容、运营、市场、研究人员：需要整理资料、生成文档、分析表格、制作汇报。
- 项目管理/行政/团队协作者：需要管理文件夹、同步外部文档、处理日常办公任务。
- AI 工具重度用户：需要安装技能、管理 MCP/外部应用授权、复用已有任务。
- 企业内部用户：需要接入飞书、云文档、表格、审批、日历、邮件等内部系统。

## 3. 核心价值

- 用自然语言驱动复杂办公任务。
- 将任务执行过程可视化：待办、进度、产物、参考资料同时呈现。
- 支持技能扩展：通过技能市场安装/启用特定能力。
- 支持外部系统集成：飞书文档、表格、审批、邮件等。
- 支持文件与文档产物预览：docx、pdf、表格、图片、代码文件等。
- 支持人机协作：Agent 遇到歧义时向用户发起选择确认。

## 4. 信息架构

### 4.1 应用整体布局

页面采用三栏结构：

- 左侧导航栏：工作区、项目列表、任务列表、技能入口、用户信息。
- 中间主工作区：聊天式任务流、Agent 输出、工具调用记录、文件产物卡片。
- 右侧信息栏：待办进度、任务产物、参考信息、调用过的技能或网页资料。

### 4.2 左侧导航

固定入口：

- 新建任务
- 技能
- 项目列表
- 用户信息

项目列表支持分组与展开：

- 工作区，例如 `02-工具与资源`、`04-SOLO 工作区`
- 项目/任务，例如 `AI Agent 工具列表`、`修改飞书文档内容`、`翻译核心人群`
- 个人目录，例如 `lucas`
- 普通项目，例如 `基诺浦`

每个任务项可显示：

- 当前选中状态
- 更多操作按钮
- 任务详情/列表图标
- 任务更新时间或创建时间

## 5. 关键页面与功能

### 5.1 首页/新建任务页

首页展示产品主标题与推荐任务卡片。

推荐任务卡片包括：

- 网页读取：研读在线论文，产出论文综述文档。
- 调研分析：调研多个短视频平台，生成汇报 PPT。
- 数据挖掘：挖掘市场增长数据，分析数据发展趋势。
- 文件管理：整理本地文件夹，列出 Excel 清单。

输入区能力：

- 多行自然语言输入。
- 选择当前工作区/项目。
- 附件上传。
- 发送任务。
- 模型选择，例如 `SOLO Auto Model`。

### 5.2 任务对话页

任务页是产品核心页面。

用户消息：

- 以右侧浅紫色气泡展示。
- 支持文本、链接、附件。
- 长提示词可折叠或换行展示。

Agent 消息：

- 显示 Agent 名称，例如 `SOLO MTC`。
- 显示运行状态：思考、执行中、手动终止输出、任务完成。
- 支持查看详情。
- 支持点赞、点踩、复制、重新生成。
- 支持代码块、表格、列表、链接、文件卡片。
- 显示任务耗时。

工具调用记录：

- 以灰色命令块展示。
- 示例：`python3`、`npx @larksuite/cli sheets +update-dimension`
- 需要支持折叠，避免长命令占据页面。

### 5.3 右侧任务栏

右侧分三块：

- 待办：展示任务步骤进度。
- 任务产物：展示任务完成后生成的文件。
- 参考信息：展示网页搜索结果、参考链接、调用技能。

待办状态：

- 未开始：空状态文案 `暂无待办，复杂任务的进展会显示在这里`
- 执行中：按步骤展示当前任务，支持 hover 查看完整内容。
- 完成：绿色勾选。
- 失败：红色或黄色状态，展示错误摘要。

任务产物：

- 空状态：`暂无产物，任务完成后，生成的文件将展示在这里`
- 文件卡片：文件名、类型、大小、打开/下载/预览操作。

参考信息：

- 联网搜索结果列表：图标、标题、来源、简短摘要。
- 技能列表：例如 `lark-doc`、`docx`、`pdf`、`lark-sheets`、`knowledge-base`。

### 5.4 技能页

技能页包含两个 Tab：

- 技能市场
- 已安装

已安装技能列表支持：

- 技能名称
- 作者
- 简介
- 开关启用/禁用
- 查看详情
- 禁用
- 卸载
- 运行技能
- 上传技能

技能详情弹窗字段：

- 技能名称，例如 `lark-approval`
- 作者
- 简介
- Skill 文档内容
- API resources
- 权限表
- 操作按钮：禁用、卸载、运行技能

### 5.5 设置/账户弹窗

设置弹窗左侧导航：

- 账号
- 通用
- MCP
- 模型
- 对话流
- 外部应用授权
- 云端运行环境
- 命令
- 规则
- 关于 TRAE SOLO

云端运行环境页面：

- 展示当前环境列表。
- 空状态：`暂无自定义环境`
- 创建环境按钮。
- 说明默认已准备云端环境，也可创建自定义环境。

### 5.6 人机确认弹窗

当 Agent 需要用户明确选择时，弹出确认卡片。

录屏中的示例为文件夹整理：

标题：`您希望怎样整理这个文件夹？`

选项：

- 按文件类型分类：图片、PPT、PDF、代码等分别归入子文件夹。
- 按主题归类：根目录下零散文件按主题移动。
- 清理冗余文件：删除 node_modules 等可重新生成依赖目录和临时文件。
- 全面整理（推荐）：先清理冗余，再按类型/主题重组。
- 其他：用户自由输入，限制 500 字。

交互要求：

- 支持单选。
- 支持分页或步骤数，例如 `1 of 2`。
- 支持取消、下一步。
- 用户选择后继续任务。

### 5.7 文件预览区

当用户打开产物时，主区域可左右分屏：

- 左侧仍保留任务对话。
- 右侧为文件预览。

预览能力：

- docx 预览：分页、缩放、页码。
- pdf 预览。
- 表格预览。
- 图片预览。
- 代码文件预览。

预览工具栏：

- 切换布局。
- 下载。
- 固定/取消固定。
- 全屏。
- 关闭。

## 6. 核心用户流程

### 6.1 新建任务流程

1. 用户点击 `新建任务`。
2. 系统展示首页和推荐任务卡片。
3. 用户选择工作区，输入任务描述，可附加文件或链接。
4. 用户点击发送。
5. 系统创建任务会话，进入任务执行页。
6. Agent 拆解任务并更新右侧待办。
7. Agent 调用技能、工具、文件系统、搜索或外部 API。
8. 如果存在歧义，系统弹出人机确认。
9. 任务完成后展示结果、耗时、产物、参考信息。

### 6.2 技能安装与使用流程

1. 用户进入 `技能`。
2. 查看技能市场或已安装技能。
3. 启用/禁用技能。
4. 点击技能详情查看能力、API、权限。
5. 在任务中，Agent 根据需求自动调用已启用技能。
6. 调用过的技能展示在右侧参考信息中。

### 6.3 外部应用授权流程

1. Agent 判断当前任务需要外部应用权限。
2. 若未授权，生成授权链接。
3. 用户在浏览器中完成授权。
4. Agent 检查授权结果。
5. 若权限不足，给出处理方案，例如审批应用、给 Bot 授权、换已审批应用。
6. 授权成功后继续任务。

### 6.4 文件整理流程

1. 用户选择工作区，输入“帮我整理一下这个文件夹”。
2. Agent 扫描工作区目录。
3. Agent 发起确认：按类型、按主题、清理冗余、全面整理。
4. 用户选择方案。
5. Agent 生成待办：分析目录、创建文件夹、移动文件、检查结果。
6. 任务完成后展示整理结果摘要。

## 7. 功能需求

### 7.1 任务系统

必须支持：

- 创建任务。
- 编辑任务标题。
- 任务归属工作区。
- 任务状态：未开始、运行中、等待用户、已完成、失败、已终止。
- 任务历史消息。
- 任务耗时统计。
- 手动终止输出。
- 继续执行。
- 重新生成。
- 复制回复。
- 反馈回复质量。

### 7.2 Agent 执行系统

必须支持：

- 模型选择。
- 自动模型路由。
- 长任务异步执行。
- 工具调用。
- 技能调用。
- 文件读写。
- 外部 API 调用。
- 联网检索。
- 人机确认。
- 运行日志。
- 执行进度推送。
- 失败重试。

### 7.3 技能系统

必须支持：

- 技能市场。
- 已安装技能。
- 启用/禁用。
- 上传技能。
- 查看详情。
- 权限声明。
- 运行技能。
- 卸载技能。
- 技能调用日志。

技能实体建议包含：

- id
- name
- display_name
- author
- description
- version
- status
- icon
- permissions
- readme
- created_at
- updated_at

### 7.4 工作区与文件系统

必须支持：

- 工作区列表。
- 项目/任务树。
- 目录扫描。
- 文件上传。
- 文件预览。
- 产物保存。
- 文件移动/复制/删除。
- 文件类型识别。
- 操作前确认。
- 操作结果审计。

### 7.5 参考信息系统

必须支持：

- 展示联网搜索结果。
- 展示任务调用过的技能。
- 展示引用链接。
- 展示参考网页预览。
- 支持点击打开来源。

### 7.6 产物系统

必须支持：

- 文档类：docx、pdf、md。
- 表格类：xlsx、csv。
- 演示类：pptx。
- 图片类：png、jpg。
- 代码类：html、js、py、json。

产物操作：

- 打开预览。
- 下载。
- 定位到工作区。
- 复制链接。
- 删除。

## 8. 非功能需求

性能：

- 首页首屏加载小于 2 秒。
- 普通消息发送响应小于 500ms。
- Agent 状态推送延迟小于 1 秒。
- 产物预览打开小于 3 秒。

可靠性：

- 长任务断线后可恢复。
- 工具调用失败需有错误状态和重试机制。
- 文件操作必须可审计，重要删除需二次确认。

安全：

- 外部应用 token 加密存储。
- 技能权限最小化。
- 文件系统访问限制在工作区范围内。
- 敏感操作记录审计日志。
- 用户授权状态可撤销。

可扩展：

- 技能通过插件化协议接入。
- Agent 工具调用统一抽象。
- 右侧参考信息和产物区支持新增类型。

## 9. 推荐技术架构

### 9.1 前端

建议技术栈：

- React 或 Vue
- TypeScript
- Zustand/Pinia 管理局部状态
- TanStack Query 管理服务端状态
- WebSocket 或 SSE 接收任务进度
- Monaco Editor 展示代码
- PDF.js 预览 PDF
- docx-preview 或后端转 PDF 预览 Word

核心模块：

- AppShell：三栏布局。
- Sidebar：工作区与任务树。
- TaskChat：任务对话流。
- Composer：输入框、附件、模型选择、发送按钮。
- TaskPanel：待办、产物、参考信息。
- SkillCenter：技能市场与已安装技能。
- ArtifactPreview：文件预览分屏。
- ConfirmDialog：人机确认弹窗。
- SettingsModal：设置与授权。

### 9.2 后端

建议技术栈：

- Node.js/NestJS 或 Python/FastAPI
- PostgreSQL 存储用户、任务、消息、技能、权限
- Redis 存储任务队列状态和推送缓存
- 对象存储或本地挂载目录存储文件产物
- Worker 执行 Agent 任务
- WebSocket/SSE 推送执行状态

核心服务：

- Auth Service：用户、登录、权限。
- Workspace Service：工作区、项目、文件。
- Task Service：任务、消息、状态。
- Agent Orchestrator：模型调用、工具调度、步骤拆解。
- Skill Service：技能安装、启用、权限、运行。
- Artifact Service：产物保存、预览、下载。
- Integration Service：飞书等外部系统授权和 API 调用。

## 10. 数据模型建议

### User

```ts
type User = {
  id: string
  name: string
  avatarUrl?: string
  createdAt: string
}
```

### Workspace

```ts
type Workspace = {
  id: string
  name: string
  ownerId: string
  rootPath?: string
  createdAt: string
  updatedAt: string
}
```

### Task

```ts
type Task = {
  id: string
  workspaceId: string
  title: string
  status: 'idle' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'stopped'
  model: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  createdAt: string
  updatedAt: string
}
```

### Message

```ts
type Message = {
  id: string
  taskId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  metadata?: Record<string, unknown>
  createdAt: string
}
```

### TodoStep

```ts
type TodoStep = {
  id: string
  taskId: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  detail?: string
  order: number
}
```

### Artifact

```ts
type Artifact = {
  id: string
  taskId: string
  name: string
  type: 'docx' | 'pdf' | 'pptx' | 'xlsx' | 'csv' | 'image' | 'code' | 'other'
  mimeType: string
  size: number
  storageKey: string
  previewUrl?: string
  createdAt: string
}
```

### Skill

```ts
type Skill = {
  id: string
  name: string
  displayName: string
  author: string
  description: string
  version: string
  enabled: boolean
  permissions: string[]
  readme: string
  createdAt: string
  updatedAt: string
}
```

### IntegrationAuth

```ts
type IntegrationAuth = {
  id: string
  userId: string
  provider: 'lark' | 'google' | 'notion' | 'custom'
  status: 'pending' | 'authorized' | 'expired' | 'rejected'
  scopes: string[]
  tokenRef: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
}
```

## 11. API 设计草案

### 任务

- `POST /api/tasks` 创建任务
- `GET /api/tasks/:id` 获取任务详情
- `GET /api/workspaces/:id/tasks` 获取工作区任务
- `POST /api/tasks/:id/messages` 发送消息
- `POST /api/tasks/:id/stop` 停止任务
- `POST /api/tasks/:id/resume` 继续任务
- `POST /api/tasks/:id/regenerate` 重新生成
- `GET /api/tasks/:id/events` SSE 订阅任务事件

### 工作区与文件

- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/:id/tree`
- `POST /api/workspaces/:id/files/upload`
- `GET /api/files/:id/preview`
- `GET /api/files/:id/download`
- `POST /api/files/operations`

### 技能

- `GET /api/skills/marketplace`
- `GET /api/skills/installed`
- `GET /api/skills/:id`
- `POST /api/skills/:id/enable`
- `POST /api/skills/:id/disable`
- `DELETE /api/skills/:id`
- `POST /api/skills/upload`
- `POST /api/skills/:id/run`

### 产物与参考信息

- `GET /api/tasks/:id/artifacts`
- `GET /api/tasks/:id/references`
- `GET /api/tasks/:id/todos`

### 授权

- `GET /api/integrations`
- `POST /api/integrations/:provider/auth-url`
- `POST /api/integrations/:provider/callback`
- `DELETE /api/integrations/:provider`

## 12. 任务事件协议

前端通过 SSE 或 WebSocket 接收任务状态。

```ts
type TaskEvent =
  | { type: 'message.delta'; taskId: string; messageId: string; text: string }
  | { type: 'message.completed'; taskId: string; messageId: string }
  | { type: 'todo.updated'; taskId: string; todo: TodoStep }
  | { type: 'tool.started'; taskId: string; toolName: string; command?: string }
  | { type: 'tool.completed'; taskId: string; toolName: string; output?: string }
  | { type: 'tool.failed'; taskId: string; toolName: string; error: string }
  | { type: 'artifact.created'; taskId: string; artifact: Artifact }
  | { type: 'confirmation.required'; taskId: string; confirmation: ConfirmationRequest }
  | { type: 'task.completed'; taskId: string; durationMs: number }
  | { type: 'task.failed'; taskId: string; error: string }
```

## 13. MVP 范围

第一阶段建议实现：

- 三栏主界面。
- 新建任务与任务历史。
- 聊天式 Agent 对话。
- Agent 状态流式输出。
- 右侧待办、产物、参考信息。
- 文件上传和产物下载。
- Markdown/表格/代码块渲染。
- 技能列表、启用/禁用、详情弹窗。
- 人机确认弹窗。
- 基础文件预览：pdf、图片、文本、代码。

暂缓到第二阶段：

- 完整技能市场上传审核。
- 云端运行环境创建。
- 多租户权限。
- 复杂外部应用授权管理。
- docx/pptx 高保真在线预览。
- 企业审计后台。

## 14. 验收标准

- 用户可新建任务，并在左侧任务树看到任务。
- 用户发送自然语言任务后，Agent 能流式返回内容。
- 任务执行时，右侧待办能实时更新。
- Agent 生成文件后，右侧产物区出现文件卡片。
- 用户点击文件卡片可打开预览。
- 用户可进入技能页，查看已安装技能并启用/禁用。
- 用户可打开技能详情弹窗查看权限和说明。
- Agent 需要用户选择时，能弹出确认框并在选择后继续执行。
- 长任务失败时，页面能展示失败原因并允许重试。

## 15. 录屏中识别出的重点细节

- 产品名称/工作区标识：MTC / SOLO MTC / More Than Coding。
- 主打场景：论文综述、PPT 编写、Excel 分析、文件管理、网页读取、调研分析、数据挖掘。
- 任务可产生文档产物，例如 `产品成分表翻译_含注解版.docx`。
- 产物支持右侧分屏预览，预览中有页码和缩放。
- 支持飞书相关技能：`lark-doc`、`lark-sheets`、`lark-approval` 等。
- 支持知识库技能：`knowledge-base`。
- 支持模型选择：`SOLO Auto Model`。
- 支持外部应用授权，录屏中出现飞书 OAuth 链接与权限不足处理建议。
- 支持设置中的云端运行环境、MCP、模型、命令、规则等配置。
- Agent 执行中会展示命令调用、思考状态、手动终止、继续执行等交互。
