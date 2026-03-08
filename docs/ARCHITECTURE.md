# nanobot Web Chat — 架构设计文档

> 版本：V1.1 | 最后更新：2026-02-25

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

## 二、前端架构

### 2.1 目录结构

```
web-chat/
├── docs/                        # 文档
│   ├── REQUIREMENTS.md
│   └── ARCHITECTURE.md          # 本文件
├── server.py                    # Python 后端（增强版）
├── reference/                   # 参考项目（不参与构建）
│   └── cherry-studio/
├── frontend/                    # 前端项目根目录
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html               # Vite 入口 HTML
│   ├── public/                  # 静态资源
│   ├── src/
│   │   ├── main.tsx             # 入口
│   │   ├── App.tsx              # 根组件：TabBar + 模块路由
│   │   ├── components/          # 通用组件（跨模块共享）
│   │   │   ├── TabBar/          # 顶部模块 Tab 栏
│   │   │   │   ├── TabBar.tsx
│   │   │   │   └── TabBar.module.css
│   │   │   ├── MarkdownRenderer/ # Markdown 渲染
│   │   │   │   ├── MarkdownRenderer.tsx
│   │   │   │   └── CodeBlock.tsx
│   │   │   └── PlaceholderPage/ # 占位页面通用组件
│   │   │       └── PlaceholderPage.tsx
│   │   ├── pages/               # 页面/模块
│   │   │   ├── chat/            # 💬 对话模块（含 Sidebar）
│   │   │   │   ├── ChatPage.tsx           # 对话模块主页：Sidebar + ChatArea
│   │   │   │   ├── ChatPage.module.css
│   │   │   │   ├── Sidebar/               # Session 导航栏（对话模块内部组件）
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   ├── SessionList.tsx
│   │   │   │   │   ├── SessionItem.tsx
│   │   │   │   │   └── Sidebar.module.css
│   │   │   │   ├── MessageList/           # 消息列表
│   │   │   │   │   ├── MessageList.tsx
│   │   │   │   │   ├── MessageItem.tsx
│   │   │   │   │   ├── ToolCallMessage.tsx
│   │   │   │   │   └── MessageList.module.css
│   │   │   │   └── ChatInput/             # 消息输入框
│   │   │   │       ├── ChatInput.tsx
│   │   │   │       └── ChatInput.module.css
│   │   │   ├── config/          # ⚙️ 配置模块（占位）
│   │   │   │   └── ConfigPage.tsx
│   │   │   ├── memory/          # 🧠 记忆管理模块（占位）
│   │   │   │   └── MemoryPage.tsx
│   │   │   └── skills/          # 🔧 Skill 管理模块（占位）
│   │   │       └── SkillsPage.tsx
│   │   ├── store/               # 状态管理 (Zustand)
│   │   │   ├── sessionStore.ts  # Session 列表 & 当前选中
│   │   │   ├── messageStore.ts  # 消息列表 & 分页状态
│   │   │   └── uiStore.ts       # UI 状态（sidebar折叠、当前Tab）
│   │   ├── services/            # API 调用封装
│   │   │   └── api.ts
│   │   ├── types/               # TypeScript 类型定义
│   │   │   └── index.ts
│   │   ├── hooks/               # 自定义 Hooks
│   │   │   ├── useMessages.ts
│   │   │   └── useSessions.ts
│   │   ├── utils/               # 工具函数
│   │   │   └── format.ts
│   │   └── styles/              # 全局样式
│   │       ├── global.css
│   │       └── theme.ts
│   └── tests/                   # 测试
│       ├── components/
│       └── setup.ts
└── .gitignore
```

### 2.2 组件层级关系

```
App
├── TabBar                            # 顶部模块切换（全局）
│   ├── Tab: 💬 对话 (active)
│   ├── Tab: ⚙️ 配置
│   ├── Tab: 🧠 记忆
│   └── Tab: 🔧 Skill
│
└── ContentArea                       # 由 activeTab 决定渲染哪个模块
    │
    ├── [activeTab === 'chat']
    │   └── ChatPage                  # 💬 对话模块
    │       ├── Sidebar               # Session 导航栏（对话模块内部）
    │       │   ├── NewSessionButton
    │       │   ├── SessionList
    │       │   │   └── SessionItem × N
    │       │   └── CollapseToggle
    │       └── ChatArea              # 右侧聊天区
    │           ├── MessageList
    │           │   ├── LoadMoreTrigger  # 向上滚动触发加载
    │           │   └── MessageItem × N
    │           │       ├── UserMessage
    │           │       ├── AssistantMessage
    │           │       │   └── MarkdownRenderer
    │           │       │       └── CodeBlock
    │           │       └── ToolCallMessage (折叠)
    │           └── ChatInput
    │
    ├── [activeTab === 'config']
    │   └── ConfigPage                # ⚙️ 占位 — "Coming Soon"
    │
    ├── [activeTab === 'memory']
    │   └── MemoryPage                # 🧠 占位 — "Coming Soon"
    │
    └── [activeTab === 'skills']
        └── SkillsPage                # 🔧 占位 — "Coming Soon"
```

### 2.3 状态管理设计 (Zustand)

```typescript
// sessionStore.ts
interface Session {
  id: string;
  summary: string;
  lastActiveAt: string;
  messageCount: number;
}

interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  loading: boolean;
  fetchSessions: () => Promise<void>;
  setActiveSession: (id: string) => void;
  createSession: () => Promise<Session>;
}

// messageStore.ts
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];     // assistant 消息可能包含工具调用
  toolCallId?: string;        // tool 消息关联的调用 ID
  name?: string;              // tool 消息的工具名称
}

interface MessageStore {
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
  sending: boolean;
  loadMessages: (sessionId: string, before?: string) => Promise<void>;
  loadMoreMessages: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string) => Promise<void>;
  clearMessages: () => void;
}

// uiStore.ts
interface UIStore {
  sidebarCollapsed: boolean;
  activeTab: 'chat' | 'config' | 'memory' | 'skills';
  toggleSidebar: () => void;
  setActiveTab: (tab: UIStore['activeTab']) => void;
}
```

### 2.4 工具调用消息的渲染策略 (v1.6 更新)

nanobot 的消息流中，工具调用产生多条 JSONL 记录：
1. `assistant` 消息（含 `tool_calls` 数组，`content` 可能包含前置文本如"让我查看一下..."）
2. `tool` 消息（工具执行结果，含 `tool_call_id` 和 `name`）
3. 可能有多轮连续的 1→2
4. 最后一条 `assistant` 消息（含 `content`，是最终回复，不含 `tool_calls`）

**渲染策略**：
- **"最终回复"定义**：最后一条不含 `tool_calls` 的 assistant 消息的 `content`
- **"工具调用过程"定义**：所有 tool_calls + 对应 tool results + 带 tool_calls 的 assistant 消息的 content（前置文本）
- **整体折叠**：工具调用过程（含前置文本）默认折叠为一行摘要
  - 折叠摘要：`⚙ 使用了 N 个工具 ▸`（可点击展开）
  - 展开后：前置文本缩进显示 + 每步 `↳ tool_name → 结果摘要`
  - 每步可再点击展开查看完整输出
- **前置文本**：带 `tool_calls` 的 assistant 消息的 `content` 在折叠区域内缩进显示，不作为独立文本段
- **风格统一**：最终显示的工具调用与流式输出期间的 `↳` 步骤风格一致

```
// 渲染示例（默认折叠）：
┌─────────────────────────────────────────────┐
│  [⚙ 使用了 2 个工具 ▸]                       │  ← 前置文本 + tool calls 全部折叠
│                                             │
│ 明天日程安排如下：...                         │  ← 只显示最终回复
└─────────────────────────────────────────────┘

// 渲染示例（展开）：
┌─────────────────────────────────────────────┐
│  [⚙ 使用了 2 个工具 ▾]                       │
│  │ 让我查看一下你明天的日程。                  │  ← 前置文本（缩进）
│  │ ↳ read_file → Successfully read...       │
│  │ 好的，现在来执行查询脚本。                  │  ← 第二轮前置文本
│  │ ↳ exec → 查询到 5 条日程...               │
│                                             │
│ 明天日程安排如下：...                         │  ← 最终回复
└─────────────────────────────────────────────┘
```

---

## 三、后端 API 设计

### 3.1 API 总览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions` | Session 列表（含摘要、文件名、活跃时间），按时间倒序 |
| POST | `/api/sessions` | 创建新 Session |
| PATCH | `/api/sessions/:id` | 重命名 Session |
| DELETE | `/api/sessions/:id` | 删除 Session（删除 JSONL 文件） |
| GET | `/api/sessions/:id` | 获取单个 Session 详情 |
| GET | `/api/sessions/:id/messages` | 分页加载消息（支持 `limit` & `before`） |
| POST | `/api/sessions/:id/messages` | 发送消息并获取回复 |

### 3.2 API 详细设计

#### GET `/api/sessions`

返回所有 Session，按最后活跃时间倒序。

```json
{
  "sessions": [
    {
      "id": "cli_webchat",
      "summary": "你好，查询日程...",
      "filename": "cli_webchat.jsonl",
      "sessionKey": "cli:webchat",
      "lastActiveAt": "2026-02-25T18:21:00",
      "messageCount": 67
    }
  ]
}
```

**摘要生成逻辑**：优先使用 `custom_name`，其次读取第一条 `role: user` 消息的 content 前 80 字符（过滤 `[Runtime Context]`），最后回退到 session_id。

#### GET `/api/sessions/:id/messages?limit=30&before=<timestamp>`

分页加载消息。

```json
{
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "你好",
      "timestamp": "2026-02-25T17:05:59"
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "content": "你好！有什么可以帮你的？",
      "timestamp": "2026-02-25T17:06:02"
    }
  ],
  "hasMore": true
}
```

#### POST `/api/sessions/:id/messages`

```json
// Request
{ "message": "你好" }

// Response
{ "reply": "你好！有什么可以帮你的？" }
```

内部调用：`nanobot agent -m "<message>" --no-markdown -s "webchat:<session_id>"`

#### POST `/api/sessions`

```json
// Response
{
  "id": "webchat_1740480000",
  "summary": "新对话",
  "filename": "webchat_1740480000.jsonl",
  "sessionKey": "webchat:1740480000",
  "lastActiveAt": "2026-02-25T18:30:00"
}
```

#### DELETE `/api/sessions/:id`

删除指定 Session 的 JSONL 文件。SQLite 中的 usage 数据不受影响。

```json
// Response
{
  "id": "webchat_1740480000",
  "deleted": true
}
```

---

## 四、关键交互流程

### 4.1 首次加载

```
1. 浏览器加载前端 SPA
2. 默认激活 💬 对话 Tab
3. ChatPage 加载 → 调用 GET /api/sessions → 获取 Session 列表
4. 自动选中第一个（最近活跃的）Session
5. 调用 GET /api/sessions/:id/messages?limit=30 → 加载最新 30 条消息
6. 渲染消息列表，滚动到底部
```

### 4.2 发送消息

```
1. 用户输入消息，点击发送
2. 前端立即追加用户消息（乐观更新）
3. 显示 "正在思考..." loading 状态
4. POST /api/sessions/:id/messages → 等待回复
5. 收到回复后渲染助手消息（Markdown）
6. 更新 Session 列表中该 Session 的排序和摘要
```

### 4.3 增量加载历史

```
1. 用户向上滚动到消息列表顶部
2. 触发 IntersectionObserver
3. 调用 GET /api/sessions/:id/messages?limit=30&before=<earliest_timestamp>
4. 将新消息插入列表顶部
5. 保持滚动位置不跳动（scrollTop 补偿）
6. 如果 hasMore=false，不再触发加载
```

### 4.4 切换 Session

```
1. 用户点击左侧 Session 项
2. 清空当前消息列表
3. 更新 activeSessionId
4. 加载新 Session 的最新消息
5. 滚动到底部
```

### 4.5 切换 Tab 模块

```
1. 用户点击顶部 Tab（如 ⚙️ 配置）
2. 更新 activeTab
3. ContentArea 渲染对应模块页面
4. 对话模块状态保持（切回时恢复）
```

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
| Node.js | >= 18 | 前端构建 |
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

---

## 八、自修改安全架构 (v1.1 新增)

### 8.1 问题描述

nanobot 通过 Web Chat UI 接收指令时，可能被要求修改前端代码本身。这产生了一个特殊的架构问题：

```
用户通过 Web UI 发送 "修改前端代码" 
  → server_v2.py 调用 nanobot agent
  → nanobot 修改 .tsx/.css 文件
  → nanobot 执行 vite build（更新 dist/）
  → nanobot 可能重启 server_v2.py ← 💥 这里出问题
  → server_v2.py 被杀 → HTTP 连接断开 → nanobot 子进程可能被终止
  → session JSONL 未完整写入 → 助手回复丢失
```

### 8.2 解决方案

**原则：server_v2.py 不需要重启就能 serve 新的前端构建产物。**

因为 `_serve_static()` 方法每次请求都从磁盘读取文件，所以 `vite build` 产生新的 `dist/` 文件后，用户只需刷新浏览器即可看到新 UI，无需重启 server。

**防护措施：**

1. **进程隔离**：`subprocess.run(..., start_new_session=True)` 让 nanobot agent 子进程脱离 server 的进程组。即使 server 意外被杀，nanobot 仍能完成任务并写入 session。

2. **操作规范**：nanobot 在修改前端代码时，应该：
   - ✅ 修改源码 → `vite build` → 通知用户刷新浏览器
   - ❌ 不要重启 server_v2.py（没有必要）
   - ❌ 不要杀掉 server_v2.py 进程

3. **前后端分离**：
   - 前端静态文件通过 `dist/` 目录 serve，文件名含 hash，不会缓存冲突
   - API 端点 (`/api/*`) 与静态文件服务互不影响
   - `vite build` 是纯文件操作，不影响运行中的 server

### 8.3 操作指南（给 nanobot 自己看）

当通过 Web Chat UI 收到修改前端代码的请求时：
1. 修改前端源码（`.tsx`, `.css` 等）
2. 执行 `cd frontend && npx vite build`
3. `git add -A && git commit -m "..."`
4. 回复用户："已更新，请刷新浏览器查看"
5. **不要重启 gateway.py 或 worker.py**

### 8.4 Gateway 修改的安全规则 (v2.5 更新)

> **背景**：2026-02-25 发生过一次事故 — nanobot 在 Web UI 任务中修改了 `gateway.py` 并重启 gateway，导致 SSE 断开。

> **v1.5 改进**：引入优雅降级机制（见第十章），SSE 断开后 Worker 继续执行任务，前端自动轮询恢复。

> **v2.5 改进**：引入 `--daemonize` 标志 + `restart.sh` 脚本，exec 工具可安全调用脚本重启服务。同时 exec 工具拒绝含 `&` 后台操作符的命令。

**当前规则**：
1. **nanobot 不应主动重启 gateway/worker** — 告知用户手动重启
2. **即使 gateway 意外重启**，Worker 中的 nanobot 子进程会继续执行
3. **前端自动恢复**：SSE 断开后轮询 `/api/sessions/:id/task-status`
4. **前端代码修改 + vite build 不需要重启任何服务** — gateway 从磁盘读取 dist/
5. **exec 工具禁止 `&` 后台操作符** — 避免 PIPE fd 继承导致 `communicate()` 卡死
6. **安全重启方式**：`restart.sh` 脚本（内部使用 `--daemonize` double-fork + 进程年龄验证）

**总结**：
| 修改内容 | 需要重启？ | 谁来重启？ | 降级保护？ |
|----------|-----------|-----------|-----------|
| 前端 .tsx/.css + vite build | ❌ 不需要 | — | — |
| gateway.py | ✅ 需要 | **用户手动** 或 `restart.sh` | ✅ Worker 继续执行 |
| worker.py | ✅ 需要 | **用户手动** 或 `restart.sh` | ❌ 会中断任务 |

### 8.5 exec 工具后台命令防护 (v2.5 新增)

**问题**：Shell 中 `&` 优先级低于 `&&`，导致 `cmd1 && cmd2 &` 整个复合命令后台执行。子进程继承 PIPE fd，`communicate()` 永远阻塞。

**防护机制**（nanobot 核心 `shell.py`）：
```python
@staticmethod
def _has_background_process(command: str) -> bool:
    # 1. 去除引号内字符串（避免误判）
    stripped = re.sub(r"'[^']*'|\"[^\"]*\"", "", command)
    # 2. 去除合法的 & 模式：&&, >&, &>, 2>&1
    stripped = re.sub(r"&&|[0-9]*>&[0-9]*|&>", "", stripped)
    # 3. 剩余的 & 即为后台操作符
    return "&" in stripped
```

检测到后返回错误信息，建议：
1. 使用 `restart.sh` 管理脚本
2. 使用程序的 `--daemonize` 标志
3. 重构命令避免 `&`

### 8.6 Daemonize 机制 (v2.5 新增)

gateway.py 和 worker.py 支持 `--daemonize` 标志，使用 UNIX double-fork 完全脱离父进程：

```
Parent (exec tool)
  └─ fork() → Child
       └─ os.setsid()  # 新 session leader
       └─ fork() → Grandchild (daemon)
            └─ redirect stdin/stdout/stderr → /dev/null
            └─ os.dup2(devnull, 0/1/2)  # 低级 fd 也重定向
            └─ 启动 HTTP server
```

**关键点**：
- 第一次 fork：父进程立即退出，exec 工具的 `communicate()` 正常返回
- `os.setsid()`：脱离父进程的 session 和进程组
- 第二次 fork：确保 daemon 不是 session leader（无法获取控制终端）
- fd 重定向：不继承任何 PIPE fd

**restart.sh 脚本**（原 `restart-gateway.sh`，Phase 31 重命名）：
```bash
# 用法
./restart.sh [all|webserver|worker|stop|status]

# 环境变量
WEBSERVER_PORT=8081  WORKER_PORT=8082  # 可覆盖端口
```

脚本流程（v4.10 增强）：
1. **进程发现**（三层）：pgrep 脚本路径 → pgrep 进程名 → lsof 端口占用，合并去重
2. 发送 SIGTERM 停止旧进程，SIGKILL 兜底，**验证端口已释放**
3. 使用 `--daemonize` 启动新进程
4. **健康检查 + 进程年龄验证**：curl 端口 + lsof 找 PID + `ps etime` 确认进程年龄 ≤ 10s
   - 如果端口响应但进程是老的（age > 10s），报错而非假装成功

---

## 九、架构拆分：API Gateway + Worker 分离 (v1.2 规划)

### 9.1 问题描述

当前 `server_v2.py` 是单进程 `HTTPServer`，同时承担三个职责：
1. **静态文件服务**：serve `frontend/dist/`
2. **API 网关**：处理 `/api/sessions`、`/api/sessions/:id/messages` 等
3. **任务执行**：调用 `nanobot agent` 子进程，等待完成后返回

如果 nanobot 被要求修改 `server_v2.py` 本身：
- 修改文件不影响运行中的 Python 进程（不热加载）
- 但修改后需要重启才能生效 → 当前 HTTP 连接断开 → 前端收到错误
- `start_new_session=True` 保证 nanobot 子进程存活，但 server 死了无法返回 response
- session JSONL 由 nanobot 核心写入，不受 server 影响 → **数据不会丢失**
- 但用户看到的是一个失败的请求，需要刷新页面

### 9.2 拆分方案

将 server 拆分为两个独立进程：

```
┌─────────────────────────────────────────────────────────┐
│                     浏览器 (Frontend)                    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP
┌────────────────────────┴────────────────────────────────┐
│              API Gateway (gateway.py) :8081              │
│                                                         │
│  职责：                                                  │
│  - 静态文件服务 (frontend/dist/)                         │
│  - Session 列表/详情 API (读 JSONL 文件)                  │
│  - 消息历史 API (读 JSONL 文件)                           │
│  - 转发聊天请求到 Worker                                  │
│                                                         │
│  特点：轻量、无状态、可随时重启                             │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP (localhost:8082)
┌────────────────────────┴────────────────────────────────┐
│              Worker Service (worker.py) :8082            │
│                                                         │
│  职责：                                                  │
│  - 接收聊天请求                                          │
│  - 调用 nanobot agent 子进程                              │
│  - 返回回复                                              │
│                                                         │
│  特点：                                                  │
│  - 代码极少，几乎不需要修改                                │
│  - 只依赖 nanobot CLI，不依赖前端代码                      │
│  - 即使 gateway 重启，worker 不受影响                      │
└─────────────────────────────────────────────────────────┘
```

### 9.3 拆分后的安全性分析

| 场景 | 影响 |
|------|------|
| nanobot 修改前端代码 + `vite build` | ✅ 无影响，gateway 从磁盘读 dist/ |
| nanobot 修改 `gateway.py` + 重启 | ⚠️ gateway 短暂不可用，但 worker 继续执行任务，session 正常记录。用户刷新后恢复 |
| nanobot 修改 `worker.py` + 重启 | 🔴 当前正在执行的任务会丢失 response（但 nanobot 子进程仍存活，session 正常写入）|
| nanobot 修改 `worker.py`（不重启）| ✅ 无影响，修改不生效直到手动重启 |

**关键收益**：大多数代码修改（前端、gateway API 逻辑、样式等）都不需要碰 `worker.py`。Worker 的代码极其简单稳定（~30 行），几乎不需要修改。

### 9.4 Worker API 设计

```
POST /execute
{
  "session_key": "webchat:1234",
  "message": "你好"
}
→
{
  "reply": "你好！有什么可以帮你的？",
  "success": true
}
```

### 9.5 实施计划

- **T9.1**: 创建 `worker.py`（独立 HTTP 服务 :8082，仅处理 nanobot agent 调用）
- **T9.2**: 修改 `gateway.py`（从 `server_v2.py` 重命名，聊天请求转发到 worker）
- **T9.3**: 启动脚本（同时启动 gateway + worker）
- **T9.4**: 测试 + 文档更新

---

## 十、优雅降级：Gateway 重启不中断任务 (v1.5 新增)

### 10.1 问题描述

当 nanobot 修改 `gateway.py` 并重启 gateway 时：
- SSE 连接断开 → 前端收到 "Failed to fetch"
- Worker 收到 BrokenPipeError → 之前会 `proc.kill()` 杀掉 nanobot 子进程
- 结果：**任务完全中断**

### 10.2 优雅降级方案

**核心原则：SSE 断开 ≠ 任务失败。nanobot 子进程应该继续执行。**

```
正常流程：
  Frontend ──SSE──→ Gateway ──HTTP──→ Worker ──stdout──→ nanobot
  Frontend ←─SSE──── Gateway ←─SSE──── Worker ←─stdout── nanobot

Gateway 重启时的降级流程：
  Frontend ──SSE──→ Gateway 💥 (重启中)
                     Worker ──stdout──→ nanobot (继续执行)
  
  Gateway 恢复后：
  Frontend ──poll──→ Gateway ──HTTP──→ Worker /tasks/:key → { running / done }
  
  任务完成后：
  Frontend ──GET──→ Gateway /messages → 从 JSONL 重载完整消息
```

### 10.3 Worker 改动

1. **BrokenPipe 不杀子进程**：`except BrokenPipeError` 中移除 `proc.kill()`
2. **Task Registry**：内存字典 `_active_tasks = { session_key: { pid, status, started_at } }`
3. **后台线程**：子进程的 stdout 读取移到后台线程，不依赖 HTTP 连接
4. **查询接口**：`GET /tasks/<session_key>` 返回 `{ status: "running" | "done" | "error" | "unknown" }`

### 10.4 Gateway 改动

1. **转发查询**：`GET /api/sessions/:id/task-status` → Worker `/tasks/<session_key>`

### 10.5 前端改动

1. **SSE 错误不立即报错**：`onError` 回调中先检查是否是连接断开（非业务错误）
2. **轮询恢复**：连接断开后每 3 秒轮询 `/api/sessions/:id/task-status`
3. **状态展示**：
   - `running` → 显示 "⏳ 任务后台执行中..."
   - `done` → 从 JSONL 重载消息，恢复正常
   - `error` → 显示错误信息

---

## 十一、功能模块 API 设计 (v2.0)

### 11.1 配置模块 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 读取 config.json，返回完整 JSON |
| PUT | `/api/config` | 接收完整 JSON，写入 config.json |

**安全性**：API Key 等敏感字段由前端负责 mask 显示，后端原样返回/保存。

### 11.2 记忆模块 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/memory/files` | 列出 memory 目录下所有文件 |
| GET | `/api/memory/files/:filename` | 读取指定文件内容（纯文本） |

**响应格式**：
```json
// GET /api/memory/files
{
  "files": [
    { "name": "MEMORY.md", "size": 6924, "modifiedAt": "2026-02-26T00:43:00" },
    { "name": "HISTORY.md", "size": 7667, "modifiedAt": "2026-02-26T00:10:00" }
  ]
}

// GET /api/memory/files/MEMORY.md
{
  "name": "MEMORY.md",
  "content": "# Long-term Memory\n\n...",
  "size": 6924,
  "modifiedAt": "2026-02-26T00:43:00"
}
```

### 11.3 Skill 管理模块 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills` | 列出所有 Skills（用户自定义 + 内置） |
| GET | `/api/skills/:name` | 获取 Skill 详情（SKILL.md 内容） |
| GET | `/api/skills/:name/tree` | 获取 Skill 目录树 |
| GET | `/api/skills/:name/files/*path` | 读取 Skill 下指定文件内容 |

**Skill 来源**：
1. 用户自定义：`~/.nanobot/workspace/skills/`
2. 内置：`nanobot` Python 包中的 `nanobot/skills/`（通过 `importlib` 定位）

**响应格式**：
```json
// GET /api/skills
{
  "skills": [
    {
      "name": "calendar-reader",
      "description": "Read-only query of macOS Calendar events...",
      "location": "/Users/.../skills/calendar-reader/",
      "source": "user",
      "available": true
    },
    {
      "name": "memory",
      "description": "Two-layer memory system...",
      "location": "/Users/.../nanobot/skills/memory/",
      "source": "builtin",
      "available": true
    }
  ]
}

// GET /api/skills/calendar-reader/tree
{
  "name": "calendar-reader",
  "tree": [
    { "path": "SKILL.md", "type": "file", "size": 1234 },
    { "path": "scripts", "type": "dir" },
    { "path": "scripts/query_events.sh", "type": "file", "size": 456 },
    { "path": "scripts/query_events.swift", "type": "file", "size": 789 }
  ]
}

// GET /api/skills/calendar-reader/files/SKILL.md
{
  "path": "SKILL.md",
  "content": "---\nname: calendar-reader\n...",
  "size": 1234
}
```

### 11.4 前端组件架构

```
App
├── TabBar
└── ContentArea
    ├── [chat]    → ChatPage (已有)
    ├── [config]  → ConfigPage (新)
    │   └── ConfigEditor
    │       ├── ConfigSection (agents)
    │       ├── ConfigSection (providers) — 可折叠
    │       ├── ConfigSection (channels) — 可折叠
    │       ├── ConfigSection (gateway)
    │       ├── ConfigSection (tools)
    │       └── SaveButton
    ├── [memory]  → MemoryPage (新)
    │   ├── MemorySidebar
    │   │   └── FileItem × N
    │   └── MemoryContent
    │       └── MarkdownRenderer
    └── [skills]  → SkillsPage (新)
        ├── SkillSidebar
        │   └── SkillItem × N
        └── SkillContent
            ├── SkillDescription (SKILL.md)
            ├── FileTree
            │   └── TreeNode × N
            └── FileViewer
```

---

## 十二、任务执行体验优化 (v2.1)

### 12.1 问题总结

| # | 问题 | 根因 |
|---|------|------|
| 7 | 切换 session 时执行进度跟着切换 | `sending`/`progressSteps` 是全局状态，不绑定 session |
| 8 | 无法强制停止执行中的任务 | 前端未保存 AbortController，后端无 kill 接口 |
| 9 | 刷新页面后任务状态丢失 | 页面加载时不检查是否有正在运行的任务 |

### 12.2 设计方案

#### 12.2.1 任务状态绑定 Session (Issue #7)

**messageStore 改动**：
- 新增 `sendingSessionId: string | null` — 记录正在执行任务的 session
- `sending` 状态保留，但 ProgressIndicator 只在 `activeSessionId === sendingSessionId` 时显示
- 切换 session 时不清除 `sending`/`progressSteps`/`sendingSessionId`（任务仍在后台运行）
- ChatInput 在 `sending && activeSessionId !== sendingSessionId` 时也禁用发送（全局单任务锁）

**MessageList 改动**：
- ProgressIndicator 的渲染条件从 `sending` 改为 `sending && activeSessionId === sendingSessionId`
- 其他 session 显示 "有任务正在执行中" 的提示（在 ChatInput 区域）

#### 12.2.2 强制停止功能 (Issue #8)

**前端改动**：
- messageStore 新增 `abortController: AbortController | null` 和 `cancelTask()` 方法
- `sendMessage` 中保存 `sendMessageStream` 返回的 AbortController
- `cancelTask()` 调用 `abortController.abort()` + 调用后端 kill API + 重置状态
- ChatInput: 发送中时显示停止按钮（■ 图标），点击调用 `cancelTask()`

**后端改动**：
- Worker 新增 `POST /tasks/:session_key/kill` — 杀掉正在运行的 nanobot 子进程
- Gateway 新增 `POST /api/sessions/:id/task-kill` — 转发到 Worker

#### 12.2.3 页面刷新后恢复任务状态 (Issue #9)

**前端改动**：
- messageStore 新增 `checkRunningTask(sessionId)` 方法
- 页面加载时（`MessageList` 的 `useEffect`），调用 `GET /api/sessions/:id/task-status`
- 如果返回 `status: 'running'`：
  1. 设置 `sending=true`, `sendingSessionId=sessionId`
  2. 调用 Worker 的 `/execute-stream` 附加到已有任务的 SSE（Worker 已支持 attach）
  3. 通过 Gateway 新增的 `POST /api/sessions/:id/task-attach` 端点实现
  4. 恢复 ProgressIndicator 显示

**Worker 改动**：
- 新增 `POST /tasks/:session_key/attach` — 附加 SSE 客户端到已有运行任务
  - 返回已有 progress + 实时后续进度
  - 如果任务已完成，直接返回 done/error

**Gateway 改动**：
- 新增 `POST /api/sessions/:id/task-attach` — SSE 转发到 Worker `/tasks/:key/attach`

### 12.3 API 新增

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/tasks/:key/kill` (Worker) | 杀掉正在运行的 nanobot 子进程 |
| POST | `/tasks/:key/attach` (Worker) | 附加 SSE 到已有任务 |
| POST | `/api/sessions/:id/task-kill` (Gateway) | 转发 kill 请求 |
| POST | `/api/sessions/:id/task-attach` (Gateway) | SSE 转发 attach 请求 |

### 12.4 ChatInput 状态矩阵

| 场景 | 输入框 | 按钮 |
|------|--------|------|
| 空闲 | 可输入 | 发送（灰色） |
| 有文字 | 可输入 | 发送（高亮） |
| 当前 session 执行中 | 禁用 | ■ 停止（红色） |
| 其他 session 执行中 | 禁用 | 发送（灰色）+ 提示 |

---

## 十三、Token 用量统计 — SQLite 独立存储 (v2.2)

### 13.1 问题描述与设计演进

nanobot 的 LLM Provider 层返回 `usage` 数据（prompt_tokens, completion_tokens, total_tokens）。

**v2.2 初版**（已废弃）：在 nanobot 核心 `agent/loop.py` 中累计 usage，保存为 session JSONL 中的 `_type: "usage"` 记录，Gateway 遍历所有 JSONL 文件聚合查询。

**v2.2 初版的问题**：
1. **与 nanobot 上游不兼容** — `local` 分支的 `_save_usage` 改动增加了与 `main` 分支 merge 的难度
2. **查询效率差** — 统计"今天总用量"需遍历所有 JSONL 文件的每一行
3. **职责混乱** — session JSONL 是对话记录，usage 是运营数据，不应耦合
4. **扩展性弱** — 后续的"按天统计"、"费用计算"、"模型对比"等需求无法高效支持

**v2.2 新方案**：引入 SQLite 独立数据库，usage 数据由 Gateway 层写入。nanobot 核心仅累计 usage 并输出到 stderr，不写入 JSONL。

### 13.2 数据流设计（新方案）

```
LiteLLM Provider
  └─ LLMResponse.usage = { prompt_tokens, completion_tokens, total_tokens }
       │
Agent Loop (_run_agent_loop)
  └─ 每次 provider.chat() 后累计 usage（local 分支）
  └─ 循环结束后，将 usage JSON 输出到 stderr（标记 __usage__: true）
  └─ 不写入 session JSONL
       │
Worker (worker.py)
  └─ 在独立线程中读取 nanobot 子进程的 stderr
  └─ 解析包含 __usage__: true 的 JSON 行，提取 usage 数据
  └─ 通过 /execute-stream SSE done 事件返回 usage
       │
Gateway (gateway.py)
  └─ 收到 Worker 返回的 usage 数据后，写入 SQLite
  └─ GET /api/usage — 从 SQLite 查询，毫秒级响应
       │
Frontend
  └─ Sidebar 底部 UsageIndicator（全局用量）
  └─ 未来：当前 session 用量 + 独立的 Usage 分析页面
```

### 13.3 SQLite 数据库设计

**文件位置**：`~/.nanobot/workspace/analytics.db`（生产）
**测试数据库**：`~/.nanobot/workspace/web-chat/tests/test_analytics.db`（测试，自动创建/销毁）

#### Schema

```sql
-- Token 用量表
-- 每条记录对应一次用户消息的完整处理（一次 _process_message 调用）
-- 一次处理中可能有多轮 LLM 调用（因工具调用循环），llm_calls 记录总次数
CREATE TABLE token_usage (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,

    -- 归属
    session_key       TEXT NOT NULL,          -- "cli:direct", "webchat:1772030778"

    -- 用量数据
    model             TEXT NOT NULL,          -- "claude-opus-4-6"
    prompt_tokens     INTEGER DEFAULT 0,      -- 输入 tokens（累计）
    completion_tokens INTEGER DEFAULT 0,      -- 输出 tokens（累计）
    total_tokens      INTEGER DEFAULT 0,      -- 总 tokens（累计）
    llm_calls         INTEGER DEFAULT 0,      -- 本次交互的 LLM 调用次数

    -- 时间区间（用于与 JSONL 消息按时间匹配）
    started_at        TEXT NOT NULL,          -- agent loop 开始时间 (ISO 8601)
    finished_at       TEXT NOT NULL           -- agent loop 结束时间 (ISO 8601)
);

-- 索引
CREATE INDEX idx_usage_session    ON token_usage(session_key);
CREATE INDEX idx_usage_started    ON token_usage(started_at);
CREATE INDEX idx_usage_finished   ON token_usage(finished_at);
CREATE INDEX idx_usage_model      ON token_usage(model);
```

#### 数据来源

Usage 数据**不再**存储在 session JSONL 中。数据流：

```
nanobot stderr JSON → Worker 解析 → SSE done 事件 → Gateway → SQLite
```

Worker 从 nanobot 子进程的 stderr 中解析 `__usage__: true` JSON 行，字段映射：

```
stderr JSON 字段                    SQLite 列            说明
─────────────────────────────────   ──────────────────   ──────────────
(Worker 补充 session_key)            session_key          Worker 传入
"model": "claude-opus-4-6"         model                直接映射
"prompt_tokens": 334191            prompt_tokens        直接映射
"completion_tokens": 4075          completion_tokens    直接映射
"total_tokens": 338266             total_tokens         直接映射
"llm_calls": 18                    llm_calls            直接映射
"started_at": "2026-02-26T..."     started_at           agent loop 开始时间
"finished_at": "2026-02-26T..."    finished_at          agent loop 结束时间
(自增)                              id                   自增主键
```

### 13.4 nanobot 核心改动

**目标**：在 `_run_agent_loop` 中累计 usage，循环结束后输出到 stderr（JSON 行，标记 `__usage__: true`）。不写入 session JSONL。

**agent/loop.py 改动（local 分支）**：
```python
# _run_agent_loop: 累计 usage，循环结束后输出到 stderr
async def _run_agent_loop(self, ...):
    from datetime import datetime
    loop_started_at = datetime.now().isoformat()
    accumulated_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "llm_calls": 0}
    # ... 每次 provider.chat() 后累计 usage ...
    
    # 循环结束后，输出 usage JSON 到 stderr（供 worker 解析）
    if accumulated_usage["llm_calls"] > 0:
        usage_record = {"__usage__": True, "model": self.model, ...}
        print(json.dumps(usage_record), file=sys.stderr)
    
    return final_content, tools_used, messages  # 不再返回 usage

# _save_usage 已移除 — 不再写入 session JSONL
```

**关键设计**：
- usage 通过 stderr JSON 行传递（标记 `__usage__: true`），不污染 session JSONL
- Worker 在独立线程中读取 stderr，解析 usage JSON
- `add_assistant_message` bug fix 保留（确保最终回复写入 JSONL）

### 13.5 Gateway 层 — analytics 模块

新增 `analytics.py` 模块，封装 SQLite 操作：

```python
# analytics.py — Token 用量数据库管理

import sqlite3
import os

DEFAULT_DB_PATH = os.path.expanduser("~/.nanobot/workspace/analytics.db")

class AnalyticsDB:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        self._ensure_schema()

    def _ensure_schema(self):
        """创建表和索引（如果不存在）。"""
        ...

    def record_usage(self, session_key, model, prompt_tokens,
                     completion_tokens, total_tokens, llm_calls,
                     started_at, finished_at):
        """写入一条 usage 记录。"""
        ...

    def get_global_usage(self) -> dict:
        """全局汇总：总计 + 按模型 + 按 session。"""
        ...

    def get_session_usage(self, session_key: str) -> dict:
        """单个 session 的 usage 汇总。"""
        ...

    def get_daily_usage(self, days: int = 30) -> list:
        """按天统计最近 N 天的用量。"""
        ...

    def migrate_from_jsonl(self, sessions_dir: str):
        """从现有 JSONL 文件迁移 _type: "usage" 记录到 SQLite。"""
        ...
```

### 13.6 Gateway API

| 方法 | 路径 | 说明 | 数据源 |
|------|------|------|--------|
| GET | `/api/usage` | 全局 usage 汇总 | SQLite |
| GET | `/api/usage?session=<key>` | 单 session usage | SQLite |
| GET | `/api/usage/daily?days=30` | 按天统计 | SQLite |
| POST | `/api/usage/migrate` | 从 JSONL 迁移数据到 SQLite | JSONL → SQLite |

**GET /api/usage 响应格式**（与前端现有 `UsageStats` 类型兼容）：
```json
{
  "total_prompt_tokens": 1234567,
  "total_completion_tokens": 234567,
  "total_tokens": 1469134,
  "total_llm_calls": 456,
  "by_model": {
    "claude-opus-4-6": {
      "prompt_tokens": 800000,
      "completion_tokens": 150000,
      "total_tokens": 950000,
      "llm_calls": 300
    }
  },
  "by_session": [
    {
      "session_id": "webchat_xxx",
      "summary": "对话名称",
      "total_tokens": 50000,
      "prompt_tokens": 30000,
      "completion_tokens": 20000,
      "llm_calls": 10,
      "last_used": "2026-02-26T14:30:00"
    }
  ]
}
```

### 13.7 数据写入时机

Gateway 在以下时机将 usage 写入 SQLite：

1. **实时写入**（推荐）：Worker 的 `/execute-stream` SSE `done` 事件中携带 usage 数据，Gateway 收到后立即写入
2. **补偿写入**：Gateway 启动时，扫描 JSONL 中的 `_type: "usage"` 记录，将 SQLite 中缺失的记录补入

**Worker SSE done 事件扩展**：
```
event: done
data: {"usage": {"model": "claude-opus-4-6", "prompt_tokens": 1234, "completion_tokens": 567, "total_tokens": 1801, "llm_calls": 3, "started_at": "...", "finished_at": "..."}}
```

### 13.8 数据迁移

一次性迁移脚本，将现有 JSONL 中的 `_type: "usage"` 记录导入 SQLite：

```python
def migrate_from_jsonl(self, sessions_dir):
    """遍历所有 session JSONL，提取 _type: usage 记录，写入 SQLite。"""
    for filepath in glob.glob(os.path.join(sessions_dir, '*.jsonl')):
        session_filename = os.path.basename(filepath).replace('.jsonl', '')
        # 文件名转 session_key: cli_direct → cli:direct, webchat_xxx → webchat:xxx
        session_key = session_filename.replace('_', ':', 1)
        with open(filepath) as f:
            for line in f:
                obj = json.loads(line)
                if obj.get('_type') == 'usage':
                    self.record_usage(
                        session_key=session_key,
                        model=obj['model'],
                        prompt_tokens=obj.get('prompt_tokens', 0),
                        completion_tokens=obj.get('completion_tokens', 0),
                        total_tokens=obj.get('total_tokens', 0),
                        llm_calls=obj.get('llm_calls', 0),
                        # 旧记录只有 timestamp，没有 started_at
                        started_at=obj.get('started_at', obj['timestamp']),
                        finished_at=obj.get('finished_at', obj['timestamp']),
                    )
```

### 13.9 前端展示

**当前实现**：Sidebar 底部 `UsageIndicator` 组件，调用 `GET /api/usage`，显示**全局**用量。

**改进计划**：
- Sidebar 底部显示**当前 session** 的用量（`GET /api/usage?session=<key>`）
- 点击展开后显示全局汇总 + 按模型分布
- 未来：独立的 Usage 分析页面（按天趋势图、费用估算等）

### 13.10 测试策略

**测试文件**：`tests/test_analytics.py`

**测试数据库隔离**：
- 测试使用独立的 SQLite 文件（`tests/test_analytics.db`），每个测试用例前创建、后销毁
- 也可使用 `:memory:` 内存数据库加速测试
- 生产数据库路径通过 `AnalyticsDB(db_path=...)` 参数注入，测试时传入测试路径

**测试用例**：
1. **Schema 创建**：验证表和索引正确创建
2. **record_usage**：写入记录，验证字段完整性
3. **get_global_usage**：多条记录聚合，验证总计、按模型、按 session 分组
4. **get_session_usage**：单 session 过滤
5. **get_daily_usage**：按天聚合，验证日期分组和排序
6. **migrate_from_jsonl**：从测试 JSONL 文件迁移，验证记录数和字段映射
7. **幂等迁移**：重复迁移不产生重复记录
8. **空数据库查询**：无记录时返回零值，不报错
9. **并发写入**：模拟多线程写入，验证 SQLite WAL 模式下无锁冲突

**测试文档**：`tests/README.md` 记录测试结构、运行方式、注意事项

### 13.11 实施计划

| 步骤 | 任务 | 说明 |
|------|------|------|
| T13.1 | 创建 `analytics.py` + Schema | AnalyticsDB 类，表创建，基本 CRUD |
| T13.2 | 编写 `tests/test_analytics.py` | 完整测试用例，验证所有查询方法 |
| T13.3 | nanobot 核心：`_save_usage` 增加 `started_at` | `_run_agent_loop` 记录开始时间 |
| T13.4 | 数据迁移：`migrate_from_jsonl` | 从现有 JSONL 导入历史 usage 数据 |
| T13.5 | Gateway 集成：`_handle_get_usage` 改用 SQLite | 替换原有的 JSONL 遍历逻辑 |
| T13.6 | Worker SSE done 事件携带 usage | Gateway 收到后实时写入 SQLite |
| T13.7 | 前端：UsageIndicator 支持当前 session 用量 | 可选，后续迭代 |
| T13.8 | 测试文档 `tests/README.md` | 记录测试结构和运行方式 |

---

## 十四、架构演进规划 — SDK 化 + 实时持久化 + 统一 Token (v3.0)

> 详细技术设计见 nanobot 核心仓库 `docs/ARCHITECTURE.md` §二。
> 对应需求: REQUIREMENTS.md §十五(#20)、§十六(#21)、§十七(#22)

### 14.1 演进方向

当前 Worker 通过 CLI 子进程调用 nanobot，存在信息传递不便、解析脆弱、资源浪费等问题。计划分三阶段改造：

```
Phase 1 (nanobot 核心):
  Session 实时持久化 — 每条消息立即追加到 JSONL
  → web-chat 无需改动，自动受益

Phase 2 (nanobot 核心 + web-chat gateway):
  统一 Token 记录 — 核心层直接写入 SQLite
  → gateway.py 移除 usage 写入逻辑
  → analytics.py schema 迁移到 nanobot 核心

Phase 3 (nanobot 核心 + web-chat worker):
  SDK 化 — Worker 进程内调用 AgentRunner
  → worker.py 从 subprocess 改为 SDK 调用
  → 结构化回调替代 stdout/stderr 解析
```

### 14.2 对 web-chat 的影响

| 组件 | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|
| gateway.py | 无变化 | 移除 usage 写入 | 无变化 |
| worker.py | 无变化 | stderr 解析可简化 | **重写**（SDK 调用） |
| analytics.py | 无变化 | 可能移除（迁移到核心） | — |
| 前端 | 无变化 | 无变化 | SSE 数据源变更 |

### 14.3 Worker 改造后的架构

```
改造前:
  Gateway ──HTTP──→ Worker ──subprocess──→ nanobot CLI
                     │                        │
                     ├─ stdout 解析 progress   ├─ stderr JSON → usage
                     └─ SSE 推送               └─ JSONL 写入

改造后:
  Gateway ──HTTP──→ Worker ──SDK──→ AgentRunner (进程内)
                     │                  │
                     ├─ callbacks        ├─ on_progress → SSE
                     │  (结构化)         ├─ on_message → 实时 JSONL
                     │                  ├─ on_usage → SQLite
                     └─ SSE 推送        └─ on_done → SSE done
```

---

## 十五、斜杠命令系统 (v4.1)

### 15.1 命令架构

Web UI 的斜杠命令分为两层处理：

```
用户输入 /xxx
  │
  ├─ 前端本地命令（不消耗 token）
  │   ├─ /help  → 显示命令列表（system-local 消息）
  │   ├─ /stop  → 中断运行中的任务（调用 cancelTask）
  │   └─ /xxx   → 未知命令提示
  │
  └─ 后端命令（发送到 agent loop）
      └─ /new   → 归档 session 历史，清空对话
```

### 15.2 前端实现

**命令拦截位置**：`messageStore.sendMessage()` 中，在 `task.sending` 检查之前。

**关键设计**：
- 斜杠命令在 `task.sending` 检查之前拦截，确保 `/help` 和 `/stop` 在任务执行中也能使用
- `/stop` 在 ChatInput 层也有拦截（处理 inject 模式下的 `/stop`）
- `/new` 在任务执行中会提示先停止任务
- 系统消息使用 `system-local` role，不持久化到 JSONL

**系统消息类型**：`Message.role = 'system-local'`
- 居中显示，灰色背景圆角
- 不参与 assistant turn 分组
- 不参与工具调用折叠

---

## 十六、Provider 动态切换 (v4.3)

> 依赖：nanobot 核心 ProviderPool（nanobot 核心仓库 `docs/ARCHITECTURE.md §七`）

### 16.1 架构概览

```
前端 Provider 选择器 / /provider 命令
  │
  ▼
webserver.py (:8081)
  GET/PUT /api/provider → 转发
  │
  ▼
worker.py (:8082)
  GET/PUT /provider → 操作 ProviderPool 单例
  │
  ▼
ProviderPool (模块级单例)
  ├── active_provider / active_model → 运行时状态
  └── providers: { name → (LLMProvider, default_model) }
```

### 16.2 Worker ProviderPool 单例

Worker 维护模块级 ProviderPool 单例，所有任务共享同一个 Pool 的 active 状态：

```python
_provider_pool = None  # 模块级单例
_pool_lock = threading.Lock()

def _get_pool():
    """获取或创建 ProviderPool 单例。"""
    # 使用 nanobot 核心的 _make_provider(config) 构建
    ...

def _create_runner():
    """创建 AgentRunner，将 Pool 作为 provider 传入。"""
    pool = _get_pool()
    # AgentLoop 接收 pool 作为 provider，无感知切换
    agent_loop = AgentLoop(provider=pool, model=pool.active_model, ...)
    return AgentRunner(agent_loop)
```

### 16.3 Worker API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/provider` | 返回 `{ active: {provider, model}, available: [{name, model}] }` |
| PUT | `/provider` | 切换 `{ provider, model? }`。任务执行中返回 409 |

PUT 的保护逻辑：
```python
def _handle_set_provider(self):
    if _has_running_tasks():
        return 409, {"error": "Task running, cannot switch provider"}
    pool.switch(provider_name, model)
    return 200, {"active": {"provider": ..., "model": ...}}
```

### 16.4 Webserver 转发

| 前端路径 | Worker 路径 | 方法 |
|---------|------------|------|
| `/api/provider` | `/provider` | GET |
| `/api/provider` | `/provider` | PUT |

### 16.5 前端组件架构

```
ChatInput
  ├── ProviderSelector (新增)
  │   ├── ProviderButton (显示当前 active)
  │   └── ProviderDropdown (展开可选列表)
  └── InputWrapper (现有)
      ├── TextArea
      └── SendButton

store/providerStore.ts (新增)
  ├── active: { provider, model }
  ├── available: [{ name, model }]
  ├── fetchProvider()
  └── switchProvider(name, model?)
```

### 16.6 /provider 斜杠命令

前端本地拦截（不发送到后端），通过 API 调用 Worker：

```
/provider        → GET /api/provider → 显示 system-local 消息
/provider <name> → PUT /api/provider → 切换 + 显示结果
```

任务执行中：本地提示 "⚠️ 任务执行中，无法切换 provider"。

---

## 十七、Session Tag 功能

### 17.1 数据存储

```
~/.nanobot/workspace/sessions/
├── session_parents.json    # 已有：父子关系映射
├── session_tags.json       # 新增：tag 映射
│   格式: { "session_key": ["done"], ... }
└── *.jsonl                 # session 对话数据（不修改）
```

设计理由：Tag 是 UI 管理概念，不属于对话内容，使用独立文件与 `session_parents.json` 模式一致。

### 17.2 后端 API

#### GET /api/sessions/tags
- 读取 `session_tags.json`，返回完整映射
- 文件不存在时返回 `{}`

#### PATCH /api/sessions/:id/tags
- `:id` 为 URL-encoded 的 session filename（与现有 rename/delete 一致）
- 请求体：`{ "add": ["done"] }` 和/或 `{ "remove": ["done"] }`
- 从文件名解析 session_key，更新 `session_tags.json` 中对应条目
- 返回：`{ "tags": ["done"] }`
- tags 为空数组时从 JSON 中删除该 key

### 17.3 前端状态管理

```
store/sessionStore.ts 扩展:
  tagsMap: Record<string, string[]>   // session_key → tags
  fetchTags()                         // GET /api/sessions/tags
  toggleDone(session)                 // PATCH → 本地更新 tagsMap
  hideDone: boolean                   // 过滤开关，默认 true
  setHideDone(v)
```

`fetchTags()` 在 `fetchSessions()` 中一并调用。

### 17.4 前端组件变更

```
SessionList.tsx:
  ├── 过滤逻辑：hideDone=true 时排除 tagsMap[key] 含 "done" 的根 session
  ├── SessionItem hover → 显示 ✓ 按钮（done toggle）
  ├── 已 done session：✅ 图标 + opacity 降低
  └── Channel 分组计数：过滤后重新计数

Sidebar 顶部:
  └── "隐藏已完成" toggle 按钮（搜索框附近）
```

### 17.5 交互规则

| 场景 | 行为 |
|------|------|
| 父 session 标记 done | 子 session 不受影响（独立） |
| 子 session 标记 done | 父 session 不受影响 |
| 搜索模式 | 忽略 hideDone 过滤，显示所有匹配结果 |
| 子 session 展开列表 | 已 done 子 session 仍显示（带 ✅） |
| 过滤 toggle 切换 | 即时生效，无需刷新 |

---

*本文档将随开发进展持续更新。*
