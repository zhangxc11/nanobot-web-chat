# 后端 API 设计

> 本文件包含 web-chat 后端 API 总览、详细设计、关键交互流程和功能模块 API 设计。

## 本文件索引

| 章节 | 标题 |
|------|------|
| §三 | 后端 API 设计 |
| §四 | 关键交互流程 |
| §十一 | 功能模块 API 设计 (v2.0) |

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

**摘要生成逻辑**：优先使用 `session_names.json` 中的自定义名称，其次读取第一条 `role: user` 消息的 content 前 80 字符（过滤 `[Runtime Context]`），最后回退到 session_id。`session_names.json` 独立于 JSONL 文件，避免 nanobot `session.save()` 覆盖导致的竞态问题。

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
