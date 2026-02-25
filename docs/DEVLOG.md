# nanobot Web Chat — 开发工作日志

> 本文件是开发过程的唯一真相源。每次新 session 从这里恢复上下文。
> 找到 🔜 标记的任务，直接继续执行。

---

## 项目状态总览

| 阶段 | 状态 | 分支 |
|------|------|------|
| Phase 1: 脚手架 & 基础布局 | ✅ 已完成 | merged to develop |
| Phase 2: 后端 API + Session 管理 | 🔄 进行中 | feat/phase2-session-api |
| Phase 3: 消息发送与渲染 | ⏳ 待开始 | |
| Phase 4: Markdown & 代码高亮 | ⏳ 待开始 | |
| Phase 5: 完善 & 部署 | ⏳ 待开始 | |

---

## ⚠️ 重要约束

1. **不破坏现有服务**：`server.py` + `index.html` 是正在用的，不要修改。新后端写 `server_v2.py`，端口 8081。
2. **每次 session 只做 1 个小任务**：找到 🔜，做完标 ✅，标下一个 🔜，commit。
3. **Vite proxy 指向 server_v2.py (8081)**，不影响现有 server.py (8080)。

---

## Phase 2: 后端 API + Session 管理（细粒度任务）

### 后端任务

- ✅ **T2.1** 创建 `server_v2.py` 基础框架 (2026-02-25)
  - Python http.server，端口 8081
  - 路由分发：`/api/sessions`, `/api/sessions/:id/messages`
  - CORS 支持（允许 Vite dev server 5173 访问）
  - 健康检查 `/api/health`
  - 所有 handler 为 stub（返回空数据/501）
  - Vite proxy 已更新指向 8081

- 🔜 **T2.2** 实现 `GET /api/sessions` — Session 列表
  - 扫描 `~/.nanobot/workspace/sessions/*.jsonl`
  - 读取每个文件的 metadata（created_at, updated_at）
  - 生成摘要：第一条 user 消息的 content，去掉 `[Runtime Context]`，截取前 50 字符
  - 统计消息数量
  - 按 updated_at 倒序返回

- ⏳ **T2.3** 实现 `GET /api/sessions/:id/messages` — 分页消息
  - 参数：`limit`（默认 30）、`before`（时间戳，用于向前翻页）
  - 读取 jsonl 文件，跳过 `_type: metadata` 行
  - 返回 messages 数组 + hasMore 标记
  - 为每条消息生成 id（行号或 hash）

- ⏳ **T2.4** 实现 `POST /api/sessions/:id/messages` — 发送消息
  - 接收 `{ "message": "..." }`
  - 调用 `nanobot agent -m "<msg>" --no-markdown -s "webchat:<session_id>"`
  - 返回 `{ "reply": "..." }`

- ⏳ **T2.5** 实现 `POST /api/sessions` — 创建新 Session
  - 生成 session id：`webchat_<timestamp>`
  - 返回新 session 信息

### 前端任务

- ⏳ **T2.6** 完善 `services/api.ts` — 对接真实 API
  - fetchSessions()
  - fetchMessages(sessionId, limit, before)
  - sendMessage(sessionId, message)
  - createSession()

- ⏳ **T2.7** 完善 `store/sessionStore.ts` — 接入 API
  - fetchSessions → 调 API → 更新 sessions 列表
  - setActiveSession → 触发消息加载
  - createSession → 调 API → 添加到列表

- ⏳ **T2.8** 实现 `Sidebar/SessionList.tsx` + `SessionItem.tsx`
  - 渲染 session 列表
  - 显示摘要、时间
  - 点击切换 activeSession
  - 当前选中高亮

- ⏳ **T2.9** 完善 `store/messageStore.ts` — 接入 API
  - loadMessages → 调 API → 设置 messages
  - loadMoreMessages → 分页加载
  - clearMessages → 切换 session 时清空

- ⏳ **T2.10** 实现 `ChatInput.tsx` — 消息输入发送
  - textarea 自动增高
  - Enter 发送（Shift+Enter 换行）
  - 发送中禁用
  - 调用 sendMessage

- ⏳ **T2.11** 实现 `MessageList.tsx` + `MessageItem.tsx` — 基础消息渲染
  - 纯文本渲染（Markdown 在 Phase 4）
  - user / assistant 消息样式区分
  - tool 消息暂时折叠隐藏
  - 自动滚动到底部

- ⏳ **T2.12** Phase 2 集成测试 & merge
  - 启动 server_v2.py + Vite dev server
  - 验证：session 列表加载、切换、消息展示、发送消息
  - merge feat/phase2-session-api → develop

---

## Phase 3: 消息发送与实时交互（细粒度任务）

- ⏳ **T3.1** 消息发送的乐观更新（先显示用户消息，再等回复）
- ⏳ **T3.2** "正在思考..." loading 动画
- ⏳ **T3.3** 发送后自动刷新 session 列表排序
- ⏳ **T3.4** 新建 Session 按钮功能
- ⏳ **T3.5** 向上滚动加载更多历史消息（IntersectionObserver）
- ⏳ **T3.6** Phase 3 集成测试 & merge

---

## Phase 4: Markdown 渲染 & 代码高亮（细粒度任务）

- ⏳ **T4.1** MarkdownRenderer 组件（react-markdown + remark-gfm）
- ⏳ **T4.2** CodeBlock 组件（highlight.js + 复制按钮）
- ⏳ **T4.3** ToolCallMessage 折叠/展开组件
- ⏳ **T4.4** 消息中的 tool_calls 关联渲染
- ⏳ **T4.5** Phase 4 集成测试 & merge

---

## Phase 5: 完善 & 部署（细粒度任务）

- ⏳ **T5.1** 生产构建：server_v2.py serve 前端 dist/
- ⏳ **T5.2** 替换 server.py（确认新版完全可用后）
- ⏳ **T5.3** 错误处理 & 边界情况
- ⏳ **T5.4** 响应式适配
- ⏳ **T5.5** merge to main，发布

---

## 完成记录

### 2026-02-25 Phase 1 完成
- Git: `66aa6a7` feat: Phase 1 layout
- 内容：App.tsx, TabBar, ChatPage骨架, Sidebar骨架, 占位页面, 暗色主题, Vite proxy, TS alias

---

*每次 session 更新此文件后 commit。*
