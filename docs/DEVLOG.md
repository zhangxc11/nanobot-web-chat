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
| Phase 10: 工具调用折叠优化 v1.4 | ✅ 已完成 | main |
| Phase 11: 自修改事故修复 + 日志 + Session 重命名 | ✅ 已完成 | main |
| Phase 12: 优雅降级 — Gateway 重启不中断任务 | ✅ 已完成 | main |
| Phase 13.1: Bug 修复 — Session 重命名后发消息被恢复 | ✅ 已完成 | main |
| Phase 14: 功能模块 v2.0 — 配置/记忆/Skill | 🔜 进行中 | main |
| Phase 15: Bug 修复 — SSE 断开后前端误判任务完成 | ✅ 已完成 | main |

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

## Phase 10: 工具调用折叠优化 v1.4

### 需求
- 最终显示的工具调用与流式输出时风格统一（`↳` 风格）
- 整个工具调用过程默认折叠，只显示最终助手文本
- 折叠摘要：`⚙ 使用了 N 个工具 ▸`
- 展开后每步 `↳ tool_name → 摘要`，可再展开详情

### 任务
- ✅ **T10.1** 重构 `MessageItem.tsx` — AssistantTurnGroup 组件改造
  - 将工具调用部分抽取为 `ToolCallsCollapsible` 组件
  - 默认折叠，显示 `⚙ 使用了 N 个工具 ▸`
  - 展开后用 `↳ tool_name → 摘要` 格式（复用 ToolCallLine，改用 ↳ 箭头）
  - 每步可点击展开详情
- ✅ **T10.2** 更新 CSS 样式 — 折叠摘要行、展开动画
- ✅ **T10.3** 构建 + 测试 + commit

### 2026-02-25 Phase 10 完成 (v1.4)
- 工具调用折叠优化：默认折叠为 `⚙ 使用了 N 个工具` 摘要行
- 展开后 `↳ tool_name → 摘要`，与流式输出 ProgressIndicator 风格一致
- 每步可再展开查看完整输出
- Git: `704cc6c`

---

## Phase 11: 自修改事故修复 + 日志 + Session 重命名

### 事故分析 (2026-02-25 23:50)
- **现象**：Web UI 发送 "新增功能，左侧的session需要可以支持编辑名称"，执行到一半中断
- **根因**：nanobot 修改了 `gateway.py`（添加 PATCH 路由）后重启了 gateway（kill 旧进程 + 启动新进程），导致正在进行的 SSE 连接断开，前端报 "TypeError: Failed to fetch"
- **影响**：代码修改已完成但未 build/commit，处于中间状态
- **教训**：gateway 重启会断开 SSE 连接，即使 worker 不变，gateway 重启也会中断任务

### 任务
- ✅ **T11.1** 根因分析 — 确认 gateway 被 nanobot 重启导致 SSE 断开
- ✅ **T11.2** 更新架构文档 §8.4 — Gateway 修改安全规则
- ✅ **T11.3** 创建开发准则文档 `docs/GUIDELINES.md`
- ✅ **T11.4** 添加日志模块 — gateway.py + worker.py 使用 Python logging
  - 日志文件：`/tmp/nanobot-gateway.log` + `/tmp/nanobot-worker.log`
  - 关键操作均有日志：请求处理、SSE 流、错误、session 操作
- ✅ **T11.5** Session 重命名功能（代码已由之前的 nanobot 完成，本次 review + build + commit）
  - 前端：SessionList 双击编辑、sessionStore.renameSession、api.renameSession
  - 后端：gateway.py PATCH /api/sessions/:id + custom_name 存储在 JSONL metadata
  - CSS：sessionEditInput 样式
- ✅ **T11.6** 构建 + 测试 + commit

---

## Phase 12: 优雅降级 — Gateway 重启不中断任务

### 设计思路
SSE 断开 ≠ 任务失败。当 gateway 重启导致 SSE 断开时：
1. Worker 不杀 nanobot 子进程，让它继续后台执行
2. Worker 维护 task registry，跟踪任务状态
3. 前端 SSE 断开后进入轮询恢复模式
4. 任务完成后从 JSONL 重载消息

### 任务
- ✅ **T12.1** Worker: 重构为后台线程执行 + task registry + BrokenPipe 不杀子进程
- ✅ **T12.2** Worker: 新增 `GET /tasks/:session_key` 查询接口
- ✅ **T12.3** Gateway: 新增 `GET /api/sessions/:id/task-status` 转发
- ✅ **T12.4** 前端: SSE 断开后轮询恢复 + 状态展示
- ✅ **T12.5** 更新开发准则: 允许修改 gateway.py（降级保护）
- ✅ **T12.6** 构建 + 测试 + commit

---

## Phase 13: 工具调用折叠优化 — 前置文本一起折叠

### 问题
- Assistant 调用工具前的"思考/意图"文本（如 "让我查看一下..."）作为独立文本段显示
- 折叠 tool calls 后仍能看到这些中间文本，折叠效果不完整

### 解决方案
- 重新定义"最终回复"：最后一条不含 `tool_calls` 的 assistant 消息的 `content`
- 所有带 `tool_calls` 的 assistant 消息的 `content`（前置文本）归入折叠区域
- 折叠区域按消息顺序交替显示：前置文本（斜体缩进）→ tool calls → 前置文本 → tool calls
- 新增 `PrecedingText` 组件 + `precedingText` CSS 样式
- `ToolCallsCollapsible` 重构为 `ToolProcessCollapsible`，接受 `ProcessItem[]`（text | tool）

### 改动文件
- `frontend/src/pages/chat/MessageItem.tsx` — 核心逻辑重构
- `frontend/src/pages/chat/MessageList.module.css` — 新增 `.precedingText` 样式
- `docs/REQUIREMENTS.md` — Issue #6
- `docs/ARCHITECTURE.md` — §2.4 更新

---

## Phase 13.1: Bug 修复 — Session 重命名发消息后被恢复

### 问题
- 用户重命名 session 后，发送新消息，session 标题被恢复成原始标题（第一条用户消息内容）

### 根因分析
1. Gateway rename 将 `custom_name` 写在 JSONL metadata 行的**顶层**：`obj['custom_name'] = '新名称'`
2. nanobot agent 执行后调用 `session.save()` 重写整个 JSONL 文件
3. nanobot 的 `Session.load()` 只读取嵌套的 `data.get('metadata', {})` 字段，**不保留顶层的 `custom_name`**
4. `Session.save()` 重写时 metadata 行只包含 `session.metadata`（嵌套字段），顶层 `custom_name` 丢失
5. 下次 `fetchSessions` 时 `metadata.get('custom_name')` 返回 None，回退到 `first_user_content`

### 修复
- **gateway.py rename**: 同时将 `custom_name` 写入顶层和嵌套 `metadata` 字段
- **gateway.py _handle_get_sessions**: 读取时同时检查顶层和嵌套 `metadata` 字段的 `custom_name`
- **手动修复**: 已修复 `cli_webchat.jsonl` 的现有数据

### 改动文件
- `gateway.py` — rename 和 get_sessions 逻辑

---

## Phase 15: Bug 修复 — SSE 断开后前端误判任务完成

### 问题
- 从 Web UI 发送"请重启 gateway"，nanobot 执行 `kill` 杀掉旧 gateway 并启动新 gateway
- 任务实际在 worker 后台继续运行并成功完成（worker 日志 01:34:33 Task done），JSONL 也有完整记录
- 但前端**没有显示**任务结果，看起来像"没有记录"

### 根因分析
1. 旧 gateway (PID 84006) 在 01:30:43 收到消息，转发给 worker 建立 SSE 连接
2. nanobot agent (PID 86972) 在 ~01:30:58 执行 `kill 84006`，旧 gateway 死亡
3. SSE 连接断开，前端 `reader.read()` 返回 `{ done: true }`
4. **Bug**: `api.ts` 的 `sendMessageStream` 在 stream 结束时有兜底逻辑 `callbacks.onDone()`
5. 这导致 `messageStore` 认为任务"正常完成"，立即调用 `_reloadMessages` 从 JSONL 加载
6. 但此时 nanobot 还在运行中（01:30→01:34），JSONL 尚未写入最终结果
7. 前端加载到不完整的消息列表，看起来像"没有记录"
8. 由于 `onDone` 被调用而非 `onError`，前端**不会进入 polling recovery 模式**

### 修复
- `api.ts`: 添加 `receivedDoneOrError` 标志位跟踪是否收到了显式的 `done`/`error` SSE 事件
- 当 stream 结束但未收到显式事件时，调用 `callbacks.onError('SSE connection reset — task may still be running')` 而非 `callbacks.onDone()`
- 错误消息包含 `reset` 关键词，匹配 `messageStore` 的 `isConnectionError` 正则，触发 polling recovery
- 这样前端会通过 `GET /api/sessions/:id/task-status` 轮询 worker 直到任务真正完成

### 改动文件
- `frontend/src/services/api.ts` — sendMessageStream 的 stream 结束处理逻辑
- `frontend/src/pages/chat/MessageItem.tsx` — 修复 unused import (TS6133)

---

## Phase 14: 功能模块 v2.0 — 配置/记忆/Skill

### 开发计划

三个新功能模块，按以下顺序实现：

#### 功能 1：配置模块 (⚙️ 配置)
- 🔜 **T14.1** 后端 API: `GET /api/config` + `PUT /api/config`（gateway.py）
- **T14.2** 前端 ConfigPage：分区展示 + JSON 编辑器 + 保存
- **T14.3** 测试 + 提交

#### 功能 2：记忆模块 (🧠 记忆)
- **T14.4** 后端 API: `GET /api/memory/files` + `GET /api/memory/files/:name`
- **T14.5** 前端 MemoryPage：左侧文件列表 + 右侧 Markdown 内容
- **T14.6** 测试 + 提交

#### 功能 3：Skill 管理模块 (🔧 Skill)
- **T14.7** 后端 API: Skills 列表、详情、目录树、文件查看
- **T14.8** 前端 SkillsPage：左侧 Skill 列表 + 右侧详情 + 目录树 + 文件查看
- **T14.9** 测试 + 提交

---

*每次 session 更新此文件后 commit。*
