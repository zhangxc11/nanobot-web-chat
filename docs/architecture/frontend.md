# 前端架构

> 本文件包含 web-chat 前端目录结构、组件层级关系、状态管理设计和工具调用渲染策略。

## 本文件索引

| 章节 | 标题 |
|------|------|
| §二 | 前端架构 |

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
