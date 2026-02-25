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

*本文档将随开发进展持续更新。*
