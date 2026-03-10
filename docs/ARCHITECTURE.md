# nanobot Web Chat — 架构设计文档

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
| 功能模块 | [architecture/features.md](architecture/features.md) | §十二+§十三+§十五~§十八 | ~711 | 执行体验/Token统计/斜杠命令/Provider/Tag/Cache |

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
