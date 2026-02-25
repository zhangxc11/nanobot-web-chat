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

## Phase 2: 后端 API + 前端 Session 管理

### 后端任务（全部完成 ✅）

- ✅ **T2.1** `server_v2.py` 基础框架 — 端口 8081, 路由分发, CORS
- ✅ **T2.2** `GET /api/sessions` — Session 列表（摘要、时间、消息数）
- ✅ **T2.3** `GET /api/sessions/:id/messages` — 分页消息（limit, before）
- ✅ **T2.4** `POST /api/sessions/:id/messages` — 发送消息（代理 nanobot CLI）
- ✅ **T2.5** `POST /api/sessions` — 创建新 Session

### 前端任务

- ✅ **T2.6** `services/api.ts` — 完整类型标注，4 个 API 函数
- ✅ **T2.7** Zustand stores — sessionStore + messageStore 已实现
- 🔜 **T2.8** `Sidebar/SessionList.tsx` + `SessionItem.tsx` — Session 列表 UI
  - 渲染 session 列表，显示摘要、时间
  - 点击切换 activeSession，当前选中高亮
  - Sidebar 接入 sessionStore
- ⏳ **T2.9** `ChatInput.tsx` — 消息输入发送
  - textarea 自动增高，Enter 发送，Shift+Enter 换行
- ⏳ **T2.10** `MessageList.tsx` + `MessageItem.tsx` — 基础消息渲染
  - user/assistant 消息样式区分，纯文本先行
  - tool 消息暂时折叠隐藏
  - 自动滚动到底部
- ⏳ **T2.11** ChatPage 集成 — 组装所有组件
- ⏳ **T2.12** Phase 2 集成测试 & merge to develop

---

## Phase 3: 交互完善

- ⏳ **T3.1** "正在思考..." loading 动画
- ⏳ **T3.2** 发送后自动刷新 session 列表排序
- ⏳ **T3.3** 新建 Session 按钮功能
- ⏳ **T3.4** 向上滚动加载更多历史消息（IntersectionObserver）
- ⏳ **T3.5** Phase 3 集成测试 & merge

---

## Phase 4: Markdown 渲染 & 代码高亮

- ⏳ **T4.1** MarkdownRenderer 组件（react-markdown + remark-gfm）
- ⏳ **T4.2** CodeBlock 组件（highlight.js + 复制按钮）
- ⏳ **T4.3** ToolCallMessage 折叠/展开组件
- ⏳ **T4.4** Phase 4 集成测试 & merge

---

## Phase 5: 完善 & 部署

- ⏳ **T5.1** 生产构建：server_v2.py serve 前端 dist/
- ⏳ **T5.2** 替换 server.py（确认新版完全可用后）
- ⏳ **T5.3** 错误处理 & 边界情况
- ⏳ **T5.4** merge to main，发布

---

## 完成记录

### 2026-02-25 Phase 1 完成
- Git: `66aa6a7` feat: Phase 1 layout

### 2026-02-25 Phase 2 后端完成
- Git: `9fc8f54` feat(T2.4+T2.5): backend API complete

---

*每次 session 更新此文件后 commit。*
