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

### 2.4 工具调用消息的渲染策略 (v1.4 更新)

nanobot 的消息流中，工具调用产生多条 JSONL 记录：
1. `assistant` 消息（含 `tool_calls` 数组，`content` 通常为空）
2. `tool` 消息（工具执行结果，含 `tool_call_id` 和 `name`）
3. 可能有多轮连续的 1→2
4. 最后一条 `assistant` 消息（含 `content`，是最终回复）

**渲染策略**：
- **无内容的 assistant+tool_calls**：不单独渲染，而是与后续 tool result 合并
- **有内容的 assistant 消息**：正常渲染为 Markdown 气泡
- **工具调用整体折叠**：一个 assistant turn 中的所有工具调用步骤默认折叠为一行摘要
  - 折叠摘要：`⚙ 使用了 N 个工具 ▸`（可点击展开）
  - 展开后：每步用 `↳ tool_name → 结果摘要` 格式（与流式输出 ProgressIndicator 风格一致）
  - 每步可再点击展开查看完整输出
- **风格统一**：最终显示的工具调用与流式输出期间的 `↳` 步骤风格一致

```
// 渲染示例（默认折叠）：
┌─────────────────────────────────────────────┐
│ 🤖                                          │
│  [⚙ 使用了 3 个工具 ▸]                       │
│                                             │
│ 好的，代码已经在 main 分支上，状态正常。        │
└─────────────────────────────────────────────┘

// 渲染示例（展开）：
┌─────────────────────────────────────────────┐
│ 🤖                                          │
│  [⚙ 使用了 3 个工具 ▾]                       │
│   ↳ exec → On branch main, nothing to...   │
│   ↳ read_file → Successfully read 2050...   │
│   ↳ write_file → File written successfully  │
│                                             │
│ 好的，代码已经在 main 分支上，状态正常。        │
└─────────────────────────────────────────────┘
```

---

## 三、后端 API 设计

### 3.1 API 总览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions` | Session 列表（含摘要、活跃时间），按时间倒序 |
| POST | `/api/sessions` | 创建新 Session |
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
      "lastActiveAt": "2026-02-25T18:21:00",
      "messageCount": 67
    }
  ]
}
```

**摘要生成逻辑**：读取 Session 文件中第一条 `role: user` 消息的 content，截取前 50 个字符，过滤掉 `[Runtime Context]` 部分。

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
  "lastActiveAt": "2026-02-25T18:30:00"
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

### 8.4 Gateway 修改的安全规则 (v1.5 更新)

> **背景**：2026-02-25 发生过一次事故 — nanobot 在 Web UI 任务中修改了 `gateway.py` 并重启 gateway，导致 SSE 断开。

> **v1.5 改进**：引入优雅降级机制（见第十章），SSE 断开后 Worker 继续执行任务，前端自动轮询恢复。

**当前规则**：
1. **nanobot 不应主动重启 gateway/worker** — 告知用户手动重启
2. **即使 gateway 意外重启**，Worker 中的 nanobot 子进程会继续执行
3. **前端自动恢复**：SSE 断开后轮询 `/api/sessions/:id/task-status`
4. **前端代码修改 + vite build 不需要重启任何服务** — gateway 从磁盘读取 dist/

**总结**：
| 修改内容 | 需要重启？ | 谁来重启？ | 降级保护？ |
|----------|-----------|-----------|-----------|
| 前端 .tsx/.css + vite build | ❌ 不需要 | — | — |
| gateway.py | ✅ 需要 | **用户手动** | ✅ Worker 继续执行 |
| worker.py | ✅ 需要 | **用户手动** | ❌ 会中断任务 |

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

*本文档将随开发进展持续更新。*
