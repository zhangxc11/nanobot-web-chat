# 架构概览与开发部署

> 本文件包含 web-chat 系统定位、架构图、布局说明、技术选型、开发部署、里程碑和工作策略。

## 本文件索引

| 章节 | 标题 |
|------|------|
| §一 | 架构概览 |
| §五 | 开发与部署 |
| §六 | 开发里程碑 |
| §七 | 工作策略与断点恢复 |

---

## 一、架构概览

### 1.1 系统定位

nanobot Web Chat 是 nanobot 个人 AI 助手的 Web 端交互界面，提供对话管理、消息渲染、以及未来的配置/记忆/Skill 管理等功能模块。

### 1.2 整体架构图

```
┌─────────────────────────────────────────────────────┐
│                    浏览器 (Frontend)                  │
│                                                     │
│  React + TypeScript + Vite                          │
│  ┌─────────────────────────────────────────────┐    │
│  │  [💬 对话] [⚙️ 配置] [🧠 记忆] [🔧 Skill]  │    │
│  ├─────────────────────────────────────────────┤    │
│  │                                             │    │
│  │  各模块独立页面（由 Tab 切换）                 │    │
│  │                                             │    │
│  │  💬 对话模块 = Sidebar(Session) + 聊天区      │    │
│  │  ⚙️ 配置模块 = 配置页面（无 Sidebar）         │    │
│  │  🧠 记忆模块 = 记忆管理页面（无 Sidebar）      │    │
│  │  🔧 Skill模块 = Skill管理页面（无 Sidebar）   │    │
│  │                                             │    │
│  └─────────────────────────────────────────────┘    │
│                         │                           │
│                    HTTP REST API                     │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────┐
│                  Python Backend (server.py)           │
│                                                      │
│  FastAPI / http.server                               │
│  ┌────────────┬──────────────┬──────────────┐       │
│  │ Session API│ Chat API     │ History API   │       │
│  │ (CRUD)     │ (proxy CLI)  │ (分页查询)    │       │
│  └─────┬──────┴──────┬───────┴──────┬────────┘       │
│        │             │              │                │
│   .jsonl files   nanobot CLI    .jsonl files         │
│   (sessions/)                   (sessions/)          │
└──────────────────────────────────────────────────────┘
```

### 1.3 布局说明

**关键设计决策：Session 导航栏是对话模块的内部组件，不是全局组件。**

- **顶部 Tab 栏**：全局，用于切换模块
- **内容区**：每个模块独立管理自己的布局
  - 💬 对话模块：内部包含左侧 Session Sidebar + 右侧聊天区
  - ⚙️ 配置模块：独立全宽页面，无 Sidebar
  - 🧠 记忆模块：独立全宽页面，无 Sidebar
  - 🔧 Skill 模块：独立全宽页面，无 Sidebar

```
💬 对话模块布局：
┌─────────────────────────────────────────────┐
│  [💬 对话] [⚙️ 配置] [🧠 记忆] [🔧 Skill]  │
├────────┬────────────────────────────────────┤
│ [+新建] │                                    │
│ ────── │        聊天消息区域                  │
│ Sess 1 │   (Markdown渲染 + 代码高亮)         │
│ Sess 2 │   (Tool调用结果折叠显示)             │
│ Sess 3 │                                    │
│  ...   │────────────────────────────────────│
│        │     [消息输入框]  [发送]             │
│ [◀折叠] │                                    │
└────────┴────────────────────────────────────┘

⚙️ 配置/🧠 记忆/🔧 Skill 模块布局：
┌─────────────────────────────────────────────┐
│  [💬 对话] [⚙️ 配置] [🧠 记忆] [🔧 Skill]  │
├─────────────────────────────────────────────┤
│                                             │
│            模块独立页面内容                   │
│           （全宽，无 Sidebar）                │
│                                             │
└─────────────────────────────────────────────┘
```

### 1.4 技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| **前端框架** | React 18 + TypeScript | 组件化、生态成熟、与 Cherry Studio 同栈便于参考 |
| **构建工具** | Vite | 快速 HMR、开箱即用的 TS 支持 |
| **UI 组件库** | Ant Design 5 | 丰富的组件、暗色主题支持、Cherry Studio 同用 |
| **状态管理** | Zustand | 轻量、简洁，适合中小项目（Cherry Studio 同用） |
| **Markdown 渲染** | react-markdown + remark-gfm | 支持 GFM 表格/任务列表 |
| **代码高亮** | highlight.js (via rehype-highlight) | 主流语言支持 |
| **CSS 方案** | CSS Modules + Ant Design 主题 | 模块化隔离，避免样式冲突 |
| **HTTP 请求** | fetch (原生) | 无需额外依赖，接口简单 |
| **后端** | Python（现有 server.py 增强） | 保持现有架构，增加分页/Session 管理 API |
| **测试** | Vitest + React Testing Library | Vite 生态、快速 |
| **版本管理** | Git | 标准工程实践 |

---

## 五、开发与部署

### 5.1 开发模式

```bash
# 终端 1: 前端开发服务器
cd frontend && npm run dev          # Vite dev server (port 5173)

# 终端 2: 后端 API 服务器
python3 server.py --port 8080       # Python API server

# Vite 配置 proxy: /api/* → http://localhost:8080
```

### 5.2 生产构建

```bash
cd frontend && npm run build        # 输出到 frontend/dist/
# server.py 同时 serve frontend/dist/ 中的静态文件 + API
```

### 5.3 Git 工作流

```
main          ← 稳定版本
└── develop   ← 开发分支
    ├── feat/project-init     # 项目脚手架
    ├── feat/layout-tabbar    # 布局 + TabBar
    ├── feat/chat-sidebar     # 对话模块 + Session Sidebar
    ├── feat/markdown         # Markdown 渲染
    ├── feat/pagination       # 消息分页
    ├── feat/backend-api      # 后端 API 改造
    └── ...
```

### 5.4 环境依赖

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 20.19 或 >= 22.12 | 前端构建（Vite 7 要求） |
| npm/pnpm | latest | 包管理 |
| Python | >= 3.11 | ✅ 已有 3.11.14 |
| Git | any | 版本管理 |

---

## 六、开发里程碑

### Phase 1：项目脚手架 & 基础布局
- [ ] 确认 Node.js 环境
- [ ] 初始化 Vite + React + TypeScript 项目
- [ ] Git 仓库初始化
- [ ] 基础布局：TabBar + 模块切换
- [ ] 暗色主题
- [ ] 占位模块页面（配置/记忆/Skill）

### Phase 2：对话模块 — Session 管理
- [ ] 后端 API 改造（Session 列表、分页消息）
- [ ] ChatPage 布局：内部 Sidebar + ChatArea
- [ ] Sidebar Session 列表（排序、摘要、折叠）
- [ ] 新建 Session
- [ ] Session 切换

### Phase 3：对话模块 — 消息渲染
- [ ] Markdown 渲染（react-markdown + remark-gfm）
- [ ] 代码块语法高亮 + 复制按钮
- [ ] 工具调用消息折叠/展开
- [ ] 消息增量加载（向上滚动加载更早消息）

### Phase 4：完善 & 测试
- [ ] 单元测试（Vitest）
- [ ] 生产构建 & server.py 静态文件服务
- [ ] 错误处理 & 边界情况
- [ ] 响应式适配

---

## 七、工作策略与断点恢复

### 7.1 开发连续性保障

由于当前 Web UI session 不稳定，可能丢失历史记录，采用以下策略确保开发过程不中断：

1. **开发工作日志** (`docs/DEVLOG.md`)
   - 记录每一步的开发操作、完成状态、遇到的问题
   - 新的 AI session 可以通过阅读此文件恢复上下文

2. **频繁 Git 提交**
   - 每完成一个小功能点就 commit
   - 使用 feature 分支开发，阶段完成后 merge 到 develop/main

3. **架构文档实时更新**
   - 本文件记录当前进展、下一步计划
   - 任何设计变更同步更新

### 7.2 工具调用轮次约束

由于 AI 工具调用轮次有限，每次 session 只聚焦完成 **1 个小任务**（约 10-15 次工具调用）。

**每次 session 的标准流程：**
1. 读取 `DEVLOG.md` → 找到当前待做任务（标记 `🔜`）
2. 执行该任务（编码 + 测试）
3. `git commit`
4. 更新 `DEVLOG.md`（标记完成 ✅，标记下一个 🔜）
5. 如果是阶段最后一个任务，merge 到 develop

### 7.3 不破坏现有服务原则

⚠️ **现有 `server.py` + `index.html` 是正在使用的 Web 服务，在新前端完全可用之前不得修改。**

**策略：**
- 新后端代码写在 `server_v2.py`，独立运行在不同端口（如 8081）
- 新前端 Vite dev server 通过 proxy 指向 `server_v2.py`
- 全部功能验证通过后，最终合并替换

### 7.4 当前进展 & 下一步

**当前状态**：Phase 1 ✅ 已完成，Phase 2 进行中

**当前分支**：`feat/phase2-session-api`（从 develop 切出）

**下一步任务**：见 `DEVLOG.md` 中标记 🔜 的任务

### 7.5 断点恢复指南

如果 session 丢失，新 session 应：
1. 阅读 `docs/DEVLOG.md` → 找到 🔜 标记的任务，直接继续
2. 如需更多上下文，阅读 `docs/ARCHITECTURE.md`
3. `git log --oneline -10` 查看最近提交
4. `git branch` 确认当前分支
