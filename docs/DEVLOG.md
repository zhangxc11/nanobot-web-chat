# nanobot Web Chat — 开发工作日志

> 本文件是开发过程的唯一真相源。每次新 session 从这里恢复上下文。
> 找到 🔜 标记的任务，直接继续执行。

---

## 项目状态总览

| 阶段 | 状态 | 分支 |
|------|------|------|
| Phase 1: 脚手架 & 基础布局 | ✅ 已完成 | merged to develop |
| Phase 2: 后端 API + Session 管理 | ✅ 已完成 | merged to develop |
| Phase 3: 交互完善 | ✅ 已完成 | merged to develop |
| Phase 4: Markdown & 代码高亮 | ✅ 已完成 | merged to develop |
| Phase 5: 完善 & 部署 | ✅ 已完成 | merged to main |
| Phase 6: 迭代优化 v1.1 | 🔄 进行中 | feat/v1.1-polish |

---

## ⚠️ 重要约束

1. **不破坏现有服务**：`server.py` + `index.html` 是正在用的，不要修改。新后端写 `server_v2.py`，端口 8081。
2. **每次 session 只做 1 个小任务**：找到 🔜，做完标 ✅，标下一个 🔜，commit。
3. **Vite proxy 指向 server_v2.py (8081)**，不影响现有 server.py (8080)。

---

## Phase 2: 后端 API + 前端 Session 管理（全部完成 ✅）

### 后端
- ✅ T2.1 `server_v2.py` 基础框架
- ✅ T2.2 `GET /api/sessions`
- ✅ T2.3 `GET /api/sessions/:id/messages`
- ✅ T2.4 `POST /api/sessions/:id/messages`
- ✅ T2.5 `POST /api/sessions`

### 前端
- ✅ T2.6 `services/api.ts`
- ✅ T2.7 Zustand stores
- ✅ T2.8 SessionList + SessionItem
- ✅ T2.9 ChatInput（自动增高, Enter 发送）
- ✅ T2.10 MessageList + MessageItem（气泡样式, tool 折叠）
- ✅ T2.11 ChatPage 集成
- ✅ T2.12 Vite build 通过

---

## Phase 3: 交互完善

- ✅ **T3.1** "正在思考..." loading 动画（bouncing dots）
- ✅ **T3.2** 发送后自动刷新 session 列表排序
- ✅ **T3.3** 新建 Session 后自动选中 + 光标聚焦到输入框
- ✅ **T3.4** 向上滚动加载更多历史消息（IntersectionObserver）
- ✅ **T3.5** Phase 3 集成测试 & merge

---

## Phase 4: Markdown 渲染 & 代码高亮

- ✅ **T4.1** MarkdownRenderer + CodeBlock（react-markdown + remark-gfm + rehype-highlight）
- ✅ **T4.2** CodeBlock: 语言标签 + 复制按钮 + github-dark 主题
- ✅ **T4.3** 集成到 MessageItem（助手消息 Markdown, 用户消息纯文本）
- ✅ **T4.4** 优化 bundle splitting + 集成测试通过

---

## Phase 5: 完善 & 部署

- ✅ **T5.1** 生产构建：server_v2.py serve 前端 dist/（SPA fallback + 静态资源缓存）
- ✅ **T5.2** 错误处理 & 边界情况（网络错误提示、重试按钮、空状态优化）
- ✅ **T5.3** 端到端测试通过（health, sessions, create, static, SPA fallback）
- 🔜 **T5.4** merge to develop → main，发布

---

## Phase 6: 迭代优化 v1.1（用户反馈修复）

- 🔜 **T6.1** 工具调用消息紧凑化：合并 assistant+tool_calls 和 tool result 为单行显示
- ⏳ **T6.2** Sidebar 折叠后添加展开按钮
- ⏳ **T6.3** 集成测试 & merge

### Issue 说明
- **Issue #1**: 工具调用占据过多篇幅 → T6.1
- **Issue #2**: 旧 UI session 缺少助手回复 → 已知旧 UI bug，无需修复
- **Issue #3**: Sidebar 折叠后无法展开 → T6.2

---

## 完成记录

### 2026-02-25 Phase 1 完成
- Git: `66aa6a7` feat: Phase 1 layout

### 2026-02-25 Phase 2 完成
- 后端: server_v2.py 完整 REST API（5 个端点）
- 前端: SessionList, ChatInput, MessageList/Item, ChatPage 集成
- Vite build 通过，tsc 通过

### 2026-02-25 Phase 3 完成
- T3.1: Typing indicator（bouncing dots 动画）
- T3.2: 发送消息后自动刷新 session 列表
- T3.3: 新建 Session 后自动选中 + 光标聚焦
- T3.4: IntersectionObserver 无限滚动加载历史消息
- T3.5: tsc + vite build 通过

### 2026-02-25 Phase 4 完成
- T4.1: MarkdownRenderer（react-markdown + remark-gfm + rehype-highlight）
- T4.2: CodeBlock（语言标签 + 复制按钮 + github-dark）
- T4.3: 集成到 MessageItem（助手=Markdown, 用户=纯文本）
- T4.4: Bundle splitting 优化（3 chunks, 无 500KB 警告）

### 2026-02-25 Phase 5 完成 🎉
- T5.1: server_v2.py 静态文件服务（SPA fallback + 目录遍历防护 + 资源缓存）
- T5.2: 错误处理（MessageList/SessionList 错误状态 + 重试按钮）
- T5.3: 端到端测试全部通过
- T5.4: merge to main

---

*每次 session 更新此文件后 commit。*
