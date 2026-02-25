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
| Phase 6: 迭代优化 v1.1 | ✅ 已完成 | merged to main |
| Phase 7: Bug 修复 v1.2 | ✅ 已完成 | main |
| Phase 8: Bug 修复 + 架构拆分 v1.2 | ✅ 已完成 | main |
| Phase 9: 流式输出 (SSE Streaming) | ✅ 已完成 | main |

---

## ⚠️ 重要约束

1. **不破坏现有服务**：`server.py` + `index.html` 是旧版 UI（已弃用）。新架构使用 `gateway.py` (:8081) + `worker.py` (:8082)。
2. **每次 session 只做 1 个小任务**：找到 🔜，做完标 ✅，标下一个 🔜，commit。
3. **Vite proxy 指向 gateway.py (8081)**。

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

- ✅ **T6.1** 工具调用消息紧凑化：合并 assistant+tool_calls 和 tool result 为单行显示
- ✅ **T6.2** Sidebar 折叠后添加展开按钮
- ✅ **T6.3** 集成测试 & merge

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

### 2026-02-25 Phase 6 完成 (v1.1)
- T6.1: 工具调用紧凑化 — 单行显示 `▸ tool_name → 摘要`，可点击展开
- T6.2: Sidebar 折叠后显示 ☰ 展开按钮
- Issue #2 确认为旧 UI bug，无需修复
- 中间有一次从新 UI 发送的修改请求，nanobot 执行了代码修改但因 server 重启导致任务未完整完成（未 commit、session 未记录），已手动补提交

### 2026-02-25 自修改安全架构分析
- 分析了 server_v2.py 在 nanobot 修改前端代码时的"自杀"问题
- 解决方案：server 不需要重启（静态文件每次从磁盘读取）+ subprocess 进程隔离（start_new_session=True）
- 更新了架构文档第八章：自修改安全架构

---

## Phase 7: Bug 修复 v1.2

### 问题清单

| # | 问题 | 根因 | 状态 |
|---|------|------|------|
| 1 | Session JSONL 不记录 assistant 最终回复 | nanobot 核心 `_run_agent_loop` 在最终回复时未将 assistant 消息加入 messages 列表 | ✅ 已修复（nanobot 核心代码） |
| 2 | 新 UI 任务执行超时/中断 | subprocess.run timeout=120s 偏短 → 改为 300s；nanobot max_iterations=40 是核心限制，不在 web-chat 控制范围 | ✅ timeout 已调整 |
| 3 | Markdown 渲染有多余空行 | `.bubble` CSS 设置了 `white-space: pre-wrap`，导致 HTML 元素间的空白也被保留 | ✅ 已修复 |

### 修复任务

- ✅ **T7.1** 修复 nanobot 核心 `loop.py`：`_run_agent_loop` 的 `else` 分支追加 assistant 消息到 messages
  - 修改文件：`/Users/zhangxingcheng/Documents/code/workspace/nanobot/nanobot/agent/loop.py`
  - 验证：`nanobot agent -m "回复数字456" --no-markdown -s "test:save_fix_verify"` → session 中有 `[assistant] 456`
- ✅ **T7.2** 修复 Markdown 渲染多余空行：`.bubble` 移除 `white-space: pre-wrap`，用户消息通过 `.content` class 单独保留 `pre-wrap`
- ✅ **T7.3** subprocess timeout 从 120s 调整为 300s
- ✅ **T7.4** 验证 + build + commit

## Phase 8: Bug 修复 + 架构拆分 v1.2

### 问题清单

| # | 问题 | 根因 | 状态 |
|---|------|------|------|
| 1 | 页面刷新后停留在最上面，而不是最下面 | `MessageList.tsx` 初始加载 30 条消息时 `diff > 3`，跳过了 scrollToBottom 逻辑 | ✅ 已修复 |
| 2 | 后端代码修改影响 nanobot 执行 | `server_v2.py` 单进程同时负责 API + nanobot 执行，修改重启会中断当前请求 | 📋 架构方案已设计，待实施 |

### 修复任务

- ✅ **T8.1** 页面刷新/初始加载后自动滚到底部
  - 添加 `isInitialLoadRef` 区分初始加载和加载更多历史
  - 初始加载完成后用 `requestAnimationFrame` + `scrollIntoView({ behavior: 'instant' })` 立即滚到底部
  - 加载更多历史时保持原有的滚动位置恢复逻辑
- ✅ **T8.2** 架构拆分方案设计 → 更新 `docs/ARCHITECTURE.md` 第九章
  - 方案：拆分为 Gateway (gateway.py :8081) + Worker (worker.py :8082)
  - Worker 只负责调用 nanobot agent，代码极简，几乎不需要修改
  - Gateway 负责静态文件、API、转发聊天请求
- ✅ **T9.1** 创建 `worker.py`（独立 HTTP 服务 :8082）
- ✅ **T9.2** 创建 `gateway.py`（API + 静态文件，聊天请求转发到 worker）
- ✅ **T9.3** 启动脚本 `start.sh` + 端到端测试通过
- ✅ **T9.4** 文档更新 + 确认 gateway.py 完全替代 server_v2.py

### 2026-02-25 架构拆分完成 (T9.1-T9.4)
- worker.py (:8082): 极简 nanobot agent 执行器，~80 行代码
- gateway.py (:8081): API 网关 + 静态文件服务，聊天请求转发到 worker
- start.sh: 同时启动 gateway + worker，Ctrl+C 统一清理
- 端到端测试通过：health, sessions, messages, chat forwarding
- 启动方式：`cd web-chat && bash start.sh` 或 `open http://127.0.0.1:8081`
- server_v2.py 保留作为历史参考，gateway.py 是其拆分后的替代品

### 2026-02-25 Phase 9: 流式输出 (SSE Streaming) ✅
- **需求**: Web UI 提交命令后实时看到每一步进展（像 CLI 的 `↳` 步骤），而非等待全部完成
- **方案**: Server-Sent Events (SSE) 流式输出
- **改动文件**:
  - `worker.py`: 新增 `/execute-stream` SSE 端点，`subprocess.Popen` 逐行读取 nanobot stdout
  - `gateway.py`: SSE 流转发 + `ThreadingMixIn` 支持并发请求（解决 SSE 阻塞问题）
  - `api.ts`: `sendMessageStream()` 使用 fetch ReadableStream 解析 SSE events
  - `messageStore.ts`: `progressSteps` 状态 + 任务完成后从 JSONL 重新加载消息
  - `MessageList.tsx`: `ProgressIndicator` 组件替代 `TypingIndicator`，实时显示 `↳ step`
  - `MessageList.module.css`: progress 步骤样式 + fadeIn 动画
- **SSE 事件类型**: `progress`（步骤文本）、`done`（完成）、`error`（错误）
- **关键设计**: 任务完成后从 JSONL 重新加载消息（而非解析 stdout），确保 tool calls 等完整显示

---

*每次 session 更新此文件后 commit。*
