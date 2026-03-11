# nanobot Web Chat — 架构设计文档

<!-- 📖 文档组织说明
本架构文档采用"主文件 + 模块子文件"结构：
- **本文件（主文件）**：架构总览 + 模块索引 + 章节完整索引
- **architecture/ 子目录**：按功能模块分组的完整架构设计

🔍 如何查找设计：
1. 在"模块索引"表中按功能领域找到对应模块文件
2. 或在"章节完整索引"表中按 §编号精确定位

📝 如何添加新设计：
1. 确定新设计属于哪个模块文件（或需要新建模块文件）
2. 在对应模块文件末尾追加新章节
3. 更新模块文件头部的索引表
4. 更新本文件的"章节完整索引"表

⚠️ 维护规则：
- 主文件不包含设计正文，只做导航
- 模块文件按功能内聚分组，不按时间顺序
- 新增模块文件需同步更新"模块索引"表
-->

> 架构按功能模块拆分，详见 `architecture/` 目录。
> 本文件提供架构全景和模块导航。

---

## 系统架构总览

nanobot Web Chat 是一个 React + TypeScript 的 Web 聊天界面，通过 Webserver（API Gateway）+ Worker（任务执行）两层架构与 nanobot Agent 交互。

### 技术栈
- **前端**: React 18 + TypeScript + Vite + Zustand + Ant Design 5
- **后端**: Python aiohttp (Webserver) + nanobot SDK (Worker)
- **通信**: SSE (Server-Sent Events) 实时流式输出
- **存储**: SQLite (Token 用量) + JSON (Session 数据/名称/Tag)

### 核心架构
- **Webserver** (:8081): HTTP API Gateway，serve 前端静态文件，转发任务到 Worker
- **Worker** (:8082): 独立进程，运行 nanobot AgentRunner，支持并发任务
- **前端**: SPA 单页应用，Zustand 状态管理，模块化组件（对话/配置/记忆/Skill）

### 关键设计原则
- Gateway/Worker 分离：Webserver 重启不中断任务执行
- 实时持久化：nanobot 核心层每条消息即时写入 JSONL
- SSE 优雅降级：连接断开后前端自动轮询恢复
- 静态文件无需重启：`vite build` 后刷新浏览器即可

---

## 模块索引

| 模块 | 文件 | 包含章节 | 行数 | 概要 |
|------|------|---------|------|------|
| 概览 | [architecture/overview.md](architecture/overview.md) | §一+§五~§七 | ~243 | 系统定位/架构图/技术选型/开发部署/工作策略 |
| 前端 | [architecture/frontend.md](architecture/frontend.md) | §二 | ~215 | 目录结构/组件层级/状态管理/工具调用渲染 |
| 后端API | [architecture/backend-api.md](architecture/backend-api.md) | §三+§四+§十一 | ~290 | API设计/交互流程/功能模块API |
| 基础设施 | [architecture/infra.md](architecture/infra.md) | §八~§十+§十四 | ~331 | 安全架构/Gateway+Worker拆分/优雅降级/SDK演进 |
| 功能模块 | [architecture/features.md](architecture/features.md) | §十二+§十三+§十五~§十九 | ~800 | 执行体验/Token统计/斜杠命令/Provider/Tag/Cache/Subagent可见性 |

---

## 章节完整索引

| 原始编号 | 标题 | 所在模块文件 |
|---------|------|-------------|
| §一 | 架构概览 | overview.md |
| §二 | 前端架构 | frontend.md |
| §三 | 后端 API 设计 | backend-api.md |
| §四 | 关键交互流程 | backend-api.md |
| §五 | 开发与部署 | overview.md |
| §六 | 开发里程碑 | overview.md |
| §七 | 工作策略与断点恢复 | overview.md |
| §八 | 自修改安全架构 | infra.md |
| §九 | 架构拆分 Gateway+Worker | infra.md |
| §十 | 优雅降级 Gateway 重启 | infra.md |
| §十一 | 功能模块 API 设计 | backend-api.md |
| §十二 | 任务执行体验优化 | features.md |
| §十三 | Token 用量统计 SQLite | features.md |
| §十四 | 架构演进规划 | infra.md |
| §十五 | 斜杠命令系统 | features.md |
| §十六 | Provider 动态切换 | features.md |
| §十七 | Session Tag | features.md |
| §十八 | Cache Usage + SQLite Migration | features.md |
| §十九 | Subagent 可见性 — 实时运行状态 | features.md |
