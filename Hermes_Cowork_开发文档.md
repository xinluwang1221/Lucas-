# Hermes Cowork 文档入口

文档状态：

- 这是 Cowork 的文档总入口，不再作为长篇开发文档使用。
- 给用户看的产品说明和给 Codex 后续开发用的工程手册已经分开。
- 本轮文档整理日期：2026-05-04。

当前阶段结论：

- Cowork 已进入“Hermes 能力释放规划阶段”。
- 前端框架基本成型，下一阶段重点是按 Hermes 当前固定内核的真实能力做系统产品化。
- Hermes 当前本机版本会作为 Cowork 固定 Agent 内核管理；后续不默认追随 upstream 主线更新。
- Cowork 不重写 Hermes Agent loop，只把 Hermes 的任务、上下文、模型、工具、MCP、Skill、Cron、审批、回滚和产物能力变成可理解、可确认、可复测的本机客户端体验。

## 1. 两份核心文档

| 读者 | 文档 | 用途 |
| --- | --- | --- |
| 用户 / 产品判断 | [`Hermes_Cowork_产品说明.md`](Hermes_Cowork_产品说明.md) | 说明 Cowork 是什么、现在开发到哪里、接下来为什么这么做。 |
| Codex / 开发执行 | [`docs/codex-development-handbook.md`](docs/codex-development-handbook.md) | 后续开发先读它，里面是架构边界、执行流程、当前优先级和验证命令。 |

这两个文档的边界：

- 产品说明负责“你是否认可这个产品方向”。
- 开发手册负责“下一轮 Codex 如何不重复踩坑地继续开发”。
- 细节附录只在需要查证时打开，避免每轮任务都加载过多上下文。

## 2. 细节附录

| 文档 | 什么时候打开 |
| --- | --- |
| [`docs/hermes-capability-baseline.md`](docs/hermes-capability-baseline.md) | 需要核对 Hermes 官网能力、本机固定内核基线、能力覆盖矩阵和长期路线时打开。 |
| [`docs/product-decisions.md`](docs/product-decisions.md) | 需要判断工作区、对话、文件预览、批注、主题、三栏布局等交互原则时打开。 |
| [`docs/engineering-reference.md`](docs/engineering-reference.md) | 需要查目录结构、关键文件、数据结构、API、实现细节、命令和已知限制时打开。 |

## 3. 本地运行入口

项目目录：

```bash
/Users/lucas/.hermes/hermes-agent/cowork
```

启动：

```bash
cd /Users/lucas/.hermes/hermes-agent/cowork
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

## 4. 后续开发规则

后续任何 Hermes 能力开发按这个顺序执行：

1. 查 [`docs/codex-development-handbook.md`](docs/codex-development-handbook.md)。
2. 必要时查 [`docs/hermes-capability-baseline.md`](docs/hermes-capability-baseline.md)。
3. 查本机固定 Hermes 代码、CLI help、Dashboard/API、测试或 release note。
4. 更新 Cowork 覆盖矩阵，明确用户入口、后端接口和验证方式。
5. 再做 UI/后端实现。
6. 验证真实后端链路，不用假数据证明功能完成。

核心约束：

- 不重做 Hermes Agent loop。
- 不把工具日志伪装成任务计划。
- 不用临时前端状态冒充后端能力。
- 工具、MCP、Skill 统一归入技能页 / 能力中心。
- 多入口必须复用同一套状态和 API。
