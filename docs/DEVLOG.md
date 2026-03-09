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
| Phase 16: Bug 修复 — 消息 timestamp 不准确 | ✅ 已完成 | main (nanobot core) |
| Phase 17: 任务执行体验优化 (Issue #7/#8/#9) | ✅ 已完成 | main |
| Phase 18: Token 用量统计 (Issue #10) | ✅ 已完成 | nanobot: local 分支, web-chat: main |
| Phase 19: Token 用量 SQLite 独立存储 | 🔜 进行中 | web-chat: main, nanobot: local |
| Phase 22: Backlog 1-5 修复 | ✅ 已完成 | web-chat: main, nanobot: local |
| Phase 23: exec PIPE 卡死修复 + Usage 刷新 | ✅ 已完成 | web-chat: main, nanobot: local |
| Phase 24: SDK 化 + 实时持久化 + 统一 Token | ✅ 已完成 | nanobot: local, web-chat: main |
| Phase 25: 执行过程展示完整性优化 (Issue #24) | ✅ 已完成 | web-chat: main |
| Phase 26: 工具调用间隙用户消息注入 (Issue #25) | ✅ 已完成 | nanobot: local, web-chat: main |
| Phase 27: Worker 并发任务支持 (Issue #26) | ✅ 已完成 | web-chat: main |
| Phase 28: 用量统计增强 + 工具调用用量展示 (Issue #27/#28) | ✅ 已完成 | web-chat: main |
| Phase 29: Web UI 自修改安全实践 (Issue #32 / Backlog #14) | ✅ 已完成 | web-chat: main |
| Phase 30: 配置增强+搜索+回收站 (Issue #33/#34/#35) | ✅ 已完成 | web-chat: main |
| Phase 31: 改名 + URL 编码修复 (Issue #36/#37) | ✅ 已完成 | web-chat: main |
| Phase 32: 图片输入功能 (Issue #38) | ✅ 已完成 | web-chat: main, nanobot: local |
| Phase 33: 斜杠命令系统 (Issue #40) | ✅ 已完成 | web-chat: main |
| Phase 34: Runtime Context 过滤统一收拢 (Issue #41) | ✅ 已完成 | web-chat: main |
| Phase 35: Session 列表按来源分组 (Issue #42) | ✅ 已完成 | web-chat: main |
| Phase 36: ProviderPool — Web Chat Provider 切换 (Issue #43) | 🔜 进行中 | fix/sse-freeze |
| Phase 37: Bug 修复 — SSE 流中断导致前端卡死 | ✅ 已完成 | fix/sse-freeze |
| Phase 38: LLM 错误响应前端展示 | ✅ 已完成 | main |
| Phase 39: Message 工具 fallback 显示 + 项目清理 | ✅ 已完成 | main |
| Phase 40: Provider 配置热加载 + 默认模型配置 (Issue #44/#45/#46) | 🔜 进行中 | main |
| Phase 41: API Session 前端辨识 (Issue #47 / Backlog #15 → B5) | ✅ 已完成 | main |
| Phase 42: Session 树形结构 (§三十四 Issue #48) | ✅ 已完成 | main |
| Phase 43: 三级树状父子关系 (§三十五 Issue #49) | ✅ 已完成 | main |
| Phase 44: 斜杠命令失败后输入回填 (§三十六 Issue #50) | ✅ 已完成 | main |
| Phase 45: restart.sh 进程发现与健康检查修复 (§三十七 Issue #51) | ✅ 已完成 | main |
| Phase 46: Session Tag — done 标记与过滤 (§三十八 Issue #52) | ✅ 已完成 | main |
| Phase 47: Bug 修复 — 后端不可达时消息静默丢失 | ✅ 已完成 | main |
| Phase 48: 全链路统一用 session.id 替代 sessionKey (§三十九 Issue #53) | ✅ 已完成 | main |

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
  - 修改文件：nanobot 核心仓库 `nanobot/agent/loop.py`
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

> ⚠️ **此方案已被 Phase 46.0 替代**：Phase 46.0 将 custom_name 从 JSONL 完全剥离到独立的 `session_names.json`，彻底解决竞态问题。

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

## Phase 16: Bug 修复 — 消息 timestamp 不准确

### 问题
- cli_webchat.jsonl 第 969 行，user 消息的 `timestamp: 2026-02-26T01:34:33` 但消息内嵌的 `Current Time: 01:30`
- 差了约 4 分钟，因为任务执行了 4 分钟

### 根因分析
- `context.py` 的 `build_messages`、`add_assistant_message`、`add_tool_result` 创建消息时**都不设 timestamp**
- `loop.py` 的 `_save_turn` 在任务完成后批量保存时，用 `entry.setdefault("timestamp", datetime.now().isoformat())` 统一设置
- 导致**所有消息（user/assistant/tool）的 timestamp 都是任务完成时间**，而非各自实际发生的时间
- 对于长时间运行的任务（如重启 gateway 花了 4 分钟），偏差显著

### 修复 (nanobot 核心, commit `81d4947`)
- `context.py` 的三个消息创建函数中，在 `messages.append(...)` 时立即记录 `timestamp: datetime.now().isoformat()`
  - `build_messages` — user 消息
  - `add_assistant_message` — assistant 消息
  - `add_tool_result` — tool 结果
- `_save_turn` 的 `setdefault` 作为兜底保留，不会覆盖已有值

### 改动文件
- `nanobot/agent/context.py` (nanobot 核心仓库)

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

## Phase 17: 任务执行体验优化 (Issue #7/#8/#9) ✅

### 需求
1. **Issue #7**: 切换 session 时执行进度不应跟着切换，其他 session 禁止发送
2. **Issue #8**: 添加强制停止按钮
3. **Issue #9**: 刷新页面后恢复任务执行状态
4. **Bug**: 后台执行超时后，前端 `sending` 状态卡住导致无法发送新消息

### 实施记录

#### T17.1 前端 messageStore: 任务绑定 session + 全局锁 ✅
- 新增 `sendingSessionId: string | null` — 记录哪个 session 正在执行任务
- `sendMessage` 时设置 `sendingSessionId`
- MessageList ProgressIndicator 只在 `sendingSessionId === activeSessionId` 时显示
- `clearMessages` 不清除 sending 状态（任务可能在其他 session 执行中）

#### T17.2 后端 Worker: kill 接口 ✅
- 新增 `POST /tasks/<key>/kill` — 用 `os.killpg` 杀掉 nanobot 进程组
- 更新 task status 为 error + 'Killed by user'
- 通知 SSE 客户端任务已终止

#### T17.3 后端 Gateway: kill 转发 ✅
- 新增 `POST /api/sessions/:id/task-kill` — 转发到 Worker

#### T17.4 前端: 停止按钮 + api.ts ✅
- api.ts 新增 `killTask(sessionId)` 和 `attachTask(sessionId, callbacks)`
- `attachTask` 使用轮询 task-status 实现（避免新增 SSE 端点）
- ChatInput 改造：
  - 当前 session 执行中 → 显示红色 "■ 停止" 按钮
  - 其他 session 执行中 → 显示 "其他对话正在执行任务" placeholder，禁用输入
  - `cancelTask()` → abort SSE + kill 后端任务 + 重载消息

#### T17.5-T17.7 页面刷新恢复任务状态 ✅
- `checkRunningTask(sessionId)` 在每次切换 session 时调用
- 检查 task-status API，如果 running 则 attach 并恢复 sending 状态
- 如果 `sending` 卡在另一个 session，自动验证并清除过期状态
- 解决了"后台超时后发送按钮不能点"的 bug

### Bug 修复: sending 状态卡住
- **根因**: 后台任务超时/完成后，前端 `sending` 未正确重置
- **修复**: `checkRunningTask` 在检测到 `sendingSessionId` 不匹配时，主动向 Worker 验证旧任务状态，如果非 running 则清除 sending 锁
- **兜底**: Worker 不可达时也清除 sending 状态，避免永久卡死

### 改动文件
- `frontend/src/store/messageStore.ts` — 全面重写，sendingSessionId + cancelTask + checkRunningTask
- `frontend/src/pages/chat/MessageList.tsx` — isCurrentSessionSending 条件渲染
- `frontend/src/pages/chat/ChatInput.tsx` — 停止按钮 + 多状态 placeholder
- `frontend/src/pages/chat/ChatInput.module.css` — stopButton 样式
- `frontend/src/services/api.ts` — killTask + attachTask
- `worker.py` — POST /tasks/<key>/kill 端点
- `gateway.py` — POST /api/sessions/:id/task-kill 转发

---

## Phase 18: Token 用量统计 (Issue #10)

### 需求
- nanobot provider 已返回 usage 数据，但 agent loop 未累计保存
- 需要在 agent loop 中累计 token usage，保存到 session JSONL
- 前端增加用量展示模块

### 实施计划

#### T18.1 nanobot 核心: agent loop 累计 usage 并保存到 session ✅ (local 分支, commit 18f39a7)
- `_run_agent_loop` 返回值增加 `accumulated_usage` (prompt/completion/total tokens + llm_calls)
- 新增 `_save_usage` 方法写入 `_type: "usage"` JSONL 记录
- `Session.get_history` 过滤 `_type` 记录，避免发送到 LLM
- Usage 通过 loguru 记录日志

#### T18.2 后端 Gateway: usage API ✅ (web-chat main, commit a9a4a0d)
- `GET /api/usage` — 聚合所有 session 的 usage 记录
- 返回 totals, by_model, by_session

#### T18.3 前端: 用量展示模块 ✅ (web-chat main, commit a9a4a0d)
- `UsageIndicator` 组件在 Sidebar 底部
- 紧凑摘要：总 tokens + LLM 调用次数
- 可展开：输入/输出分项 + 按模型统计
- 每 60 秒自动刷新

#### T18.4 构建 + 测试 + 提交 ✅

---

## Phase 19: Token 用量 — SQLite 独立存储 (Issue #10 续)

### 背景
Phase 18 将 usage 数据存储在 session JSONL 中（`_type: "usage"` 记录），存在以下问题：
1. 与 nanobot 上游主分支不兼容（local 分支改动）
2. 查询效率差（需遍历所有 JSONL）
3. 职责混乱（对话记录 vs 运营数据）
4. 扩展性弱（无法支持按天统计、费用计算等）

### 方案
引入 SQLite (`analytics.db`) 独立存储 usage 数据。详见架构文档 §13。

### 任务拆解

- ✅ **T19.1** 创建 `analytics.py` — AnalyticsDB 类 + Schema + 基本 CRUD
  - 文件：`web-chat/analytics.py`
  - SQLite 路径：`~/.nanobot/workspace/analytics.db`（生产）
  - 方法：`record_usage`, `get_global_usage`, `get_session_usage`, `get_daily_usage`

- ✅ **T19.2** 创建 `tests/test_analytics.py` + `tests/README.md`
  - 测试数据库隔离：使用 `:memory:` 或临时文件
  - 测试用例：schema 创建、写入、全局聚合、session 过滤、按天统计、空数据、幂等迁移
  - 运行：`cd web-chat && python3 -m pytest tests/`
  - 26 个测试全部通过

- ✅ **T19.3** nanobot 核心：`_save_usage` 增加 `started_at` 字段
  - `_run_agent_loop` 入口记录 `loop_started_at`
  - `_save_usage` 写入 `started_at` + `finished_at`（替代原有的 `timestamp`）
  - nanobot local 分支 commit: 9a10747

- ✅ **T19.4** 数据迁移：`migrate_from_jsonl` 方法 + 执行迁移
  - 从现有 JSONL 提取 `_type: "usage"` 记录导入 SQLite
  - 旧记录只有 `timestamp`，迁移时 `started_at = finished_at = timestamp`
  - 幂等：重复执行不产生重复记录
  - 迁移结果：4 条记录，cli:webchat session

- ✅ **T19.5** Gateway 集成：`_handle_get_usage` 改用 SQLite 查询
  - 替换原有的 JSONL 遍历逻辑
  - 保持 API 响应格式不变（前端无需改动）
  - Session summary 从 JSONL metadata 读取补充

- ✅ **T19.6** Worker SSE done 事件携带 usage → Gateway 实时写入 SQLite
  - Worker: `_extract_usage_from_jsonl` 从 JSONL 末尾提取最新 usage
  - Worker: done 事件 payload 包含 usage 数据
  - Gateway: 解析 SSE done 事件，调用 `analytics_db.record_usage`

- ✅ **T19.7** 测试文档 `tests/README.md`
  - 记录测试结构、运行方式、环境隔离策略

- ✅ **T19.8** 构建 + 全量测试 + git commit
  - web-chat commit: 415ea10
  - nanobot core commit: 9a10747

### Phase 20: Usage 数据流重构 — 移除 JSONL 依赖 (2026-02-26)

**目标**：Usage 数据不再写入 session JSONL，改为通过 nanobot stderr JSON 行传递给 Worker。

- ✅ **T20.1** nanobot 核心重构
  - 移除 `_save_usage` 方法（不再写入 JSONL）
  - 移除 `session/manager.py` 的 `_type` 过滤（不再需要）
  - `_run_agent_loop` 返回值从 5 元组改回 3 元组
  - 循环结束后将 usage JSON 输出到 stderr（标记 `__usage__: true`）
  - nanobot local 分支 commit: 8f0cc2d

- ✅ **T20.2** 清理 JSONL 中的 `_type: "usage"` 历史记录
  - 已从 cli_webchat.jsonl 中删除 6 条 usage 记录
  - 其他 JSONL 文件无 usage 记录

- ✅ **T20.3** Worker 重构：从 stderr 解析 usage
  - 移除 `_extract_usage_from_jsonl` 函数和 `SESSIONS_DIR` 常量
  - 新增 stderr 读取线程，解析 `__usage__: true` JSON 行
  - usage 数据通过 SSE done 事件传递给 Gateway（逻辑不变）

- ✅ **T20.4** 架构文档更新
  - 更新 13.2 数据流设计图
  - 更新 13.4 nanobot 核心改动描述
  - 更新 JSONL-SQLite 映射关系说明

---

### Phase 21: 用量统计增强 — Session 用量 + 全局看板 (2026-02-26)

**目标**：Sidebar 底部显示当前 session 用量；新增 📊 用量 Tab 显示全局统计 + 趋势曲线。

- ✅ **T21.1** Gateway 路由扩展
  - 添加 `GET /api/usage?session=<key>` 路由（调用 analytics.get_session_usage）
  - 添加 `GET /api/usage/daily?days=30` 路由（调用 analytics.get_daily_usage）
  - 提取 `_enrich_session_summaries` 为独立方法

- ✅ **T21.2** 前端 API 层扩展
  - 新增 `fetchSessionUsage(sessionKey)` + `SessionUsage` 类型
  - 新增 `fetchDailyUsage(days)` + `DailyUsage` 类型

- ✅ **T21.3** UsageIndicator 改为 Session 用量
  - 读取 activeSessionId，转换为 session_key 查询
  - 切换 session 时自动刷新
  - 展开显示输入/输出/按模型明细

- ✅ **T21.4** 新增 📊 用量 Tab + UsagePage 组件
  - TabKey 增加 'usage'，TabBar 增加用量 Tab
  - App.tsx 路由增加 UsagePage

- ✅ **T21.5** UsagePage 实现 — 总计卡片 + 按模型 + 按 Session
  - 4 个总计卡片（总 tokens、输入、输出、调用次数）
  - 按模型分布表格
  - 按 Session 分布表格（带名称）

- ✅ **T21.6** UsagePage 实现 — 每日趋势图
  - 纯 CSS 柱状图（输入/输出双色）
  - Hover 显示 tooltip
  - 图例说明

- ✅ **T21.7** 构建 + 测试 + Git 提交
  - 前端构建成功
  - API 测试通过（session usage + daily usage）
  - commit: c4c10f5

---

## Phase 22: Backlog 1-5 修复 (2026-02-26)

### 需求来源
REQUIREMENTS.md 手动维护的 backlog 项 1-5。

### 任务清单

- ✅ **T22.1** Issue #12: 切换 session 后 streaming 内容保留
  - Worker task-status API 返回完整 `progress` 列表
  - 前端 `checkRunningTask` 从 task-status 恢复完整 progress 历史
  - 改动文件: `worker.py`, `frontend/src/store/messageStore.ts`, `frontend/src/services/api.ts`

- ✅ **T22.2** Issue #13/#14: 输入框内容与 session 绑定 + 跨模块保持
  - messageStore 新增 `draftBySession: Record<string, string>`
  - ChatInput 从 store 读写草稿，不再使用 `useState`
  - 切换 session/模块时草稿自动保持
  - 改动文件: `frontend/src/store/messageStore.ts`, `frontend/src/pages/chat/ChatInput.tsx`

- ✅ **T22.3** Issue #15: Max tool iterations 后 Web 无显示
  - nanobot 核心 bug: `_run_agent_loop` 在 max_iterations 达到时未将 final_content 加入 messages 列表
  - 修复: 在设置 final_content 后调用 `context.add_assistant_message` 追加到 messages
  - 改动文件: `nanobot/agent/loop.py` (nanobot 核心仓库, local 分支)

- ✅ **T22.4** Issue #16: CLI 模式下 Token 用量确认
  - 验证结论: CLI 模式不经过 worker，usage stderr JSON 输出到终端后被丢弃，不记入 SQLite
  - 已知限制，记录在需求文档中

---

## Phase 23: exec 工具 PIPE 卡死修复 + Usage 刷新 (2026-02-26)

### 需求来源
- Issue #18: exec 工具执行含 `&` 后台操作符的命令时 `communicate()` 永远阻塞
- Issue #19: 消息发送完成后 UsageIndicator 不立即刷新

### 任务清单

- ✅ **T23.1** nanobot 核心: exec 工具拒绝含 `&` 的命令
  - 新增 `_has_background_process()` 静态方法
  - 去除引号内字符串，排除 `&&`、`>&`、`&>`、`2>&1` 后检测 `&`
  - 检测到后返回错误信息 + 安全替代方案建议
  - 改动文件: `nanobot/agent/tools/shell.py`
  - nanobot local 分支 commit: d2a5769

- ✅ **T23.2** web-chat: gateway.py + worker.py 添加 `--daemonize` 标志
  - 使用 UNIX double-fork 完全脱离父进程
  - 重定向 stdin/stdout/stderr 到 /dev/null
  - 不继承任何 PIPE fd
  - 改动文件: `gateway.py`, `worker.py`

- ✅ **T23.3** web-chat: 创建 `restart-gateway.sh` 统一管理脚本
  - 支持 `all|gateway|worker|stop|status` 子命令
  - PID 文件管理 + 健康检查
  - 环境变量 `GATEWAY_PORT`/`WORKER_PORT` 可覆盖端口
  - 改动文件: `restart-gateway.sh` (新建)
  - web-chat commit: 4090bb8

- ✅ **T23.4** web-chat: UsageIndicator 消息完成后立即刷新
  - messageStore dispatch `usage-updated` CustomEvent
  - UsageIndicator 监听事件立即刷新
  - 改动文件: `messageStore.ts`, `UsageIndicator.tsx`
  - web-chat commit: 102a077

- ✅ **T23.5** web-chat: gateway.py usage 记录去重 + 补偿写入
  - `_try_record_usage()` 方法统一 usage 写入逻辑
  - 内存 dedup set + lock 防止重复记录（SSE done + task-status 可能重复触发）
  - task-status API 也触发 opportunistic usage 写入
  - 改动文件: `gateway.py`

- ✅ **T23.6** 文档更新
  - REQUIREMENTS.md: 新增 §十四 (Issue #18, #19)
  - ARCHITECTURE.md: 更新 §8.4, 新增 §8.5 exec 防护, §8.6 daemonize 机制
  - DEVLOG.md: 本记录
  - nanobot 核心: 创建 docs/LOCAL_CHANGES.md

---

## Phase 24: nanobot SDK 化 + 实时持久化 + 统一 Token 记录 ✅

> 此 Phase 涉及 nanobot 核心仓库的重大改造，web-chat 侧主要是 Worker 适配。
> 详细设计见 nanobot 核心仓库 `docs/ARCHITECTURE.md` + `docs/LOCAL_CHANGES.md`。
> 对应 web-chat 需求: §十五(Issue #20)、§十六(Issue #21)、§十七(Issue #22)

### 实施顺序

1. ✅ **Phase 1 (nanobot)**: 实时 Session 持久化 — `session/manager.py` + `agent/loop.py`
   - `append_message()` 每条消息立即写入 JSONL，不再等 `_save_turn` 批量保存
   - `_save_turn` 改为只保存 metadata 更新
   - web-chat 无需改动，自动受益（SSE 断开后 JSONL 已有完整记录）
   - nanobot commit: `5528969`

2. ✅ **Phase 2 (nanobot)**: 统一 Token 记录 — 新增 `usage/recorder.py`
   - `UsageRecorder` 直接写入 SQLite（`analytics.db`），替代 stderr JSON 输出
   - 所有调用模式（CLI、Web、IM）统一记录，不再依赖 Worker 解析 stderr
   - web-chat gateway.py: 移除 `_try_record_usage` 等 usage 写入逻辑（由 nanobot 核心负责）
   - nanobot commit: `863b9f0`

3. ✅ **Phase 3 (nanobot + web-chat)**: SDK 化 — 新增 `sdk/runner.py`
   - nanobot 核心:
     - `agent/callbacks.py`: AgentCallbacks Protocol + DefaultCallbacks + AgentResult
     - `agent/loop.py`: `_run_agent_loop` 接受 `callbacks` 参数
     - `sdk/runner.py`: `AgentRunner.from_config()` + `run()` + `close()`
   - web-chat worker.py: 完全重写
     - 从 `subprocess.Popen` 改为 `AgentRunner.run()` in-process 调用
     - asyncio event loop 在专用线程中运行
     - AgentRunner 单例：复用 MCP 连接，无进程启动开销
     - `WorkerCallbacks` 桥接 agent 事件到 SSE 客户端
     - Kill 机制从 `os.kill(pid)` 改为 `future.cancel()`
     - Health 端点返回 `mode: "sdk"`
   - nanobot commits: `2315216`, `beb6a80`
   - web-chat commit: `65a56ab`

### 关键改进总结
- **性能**: AgentRunner 单例复用 MCP 连接，不再每次请求启动新进程
- **可靠性**: 消息实时持久化 + Usage 直写 SQLite，不再依赖 stderr 解析
- **可维护性**: SDK callbacks 类型安全，Worker 代码大幅简化
- **向后兼容**: CLI、gateway、IM 等现有调用方完全不受影响

---

## Bug Fix: Session 数据写入错误路径 (2026-02-26 21:24)

> 对应需求 §十八 Issue #23

### 问题
- **现象**: Web UI 消息执行成功但 session 不记录，刷新/切换后消息消失
- **根因**: `AgentRunner.from_config()` 传入 `config.workspace_path / "sessions"` 给 `SessionManager`，但 `SessionManager.__init__` 内部又追加 `/sessions`，导致写入路径变成 `sessions/sessions/`（双重嵌套）
- **发现时间**: Phase 24 SDK 化后首次在 web UI 中实际使用时发现

### 修复
- nanobot `sdk/runner.py`: `SessionManager(config.workspace_path)` — 传入 workspace root 而非 sessions_dir
- 恢复 `sessions/sessions/` 下的误写数据到正确位置
- 清理错误的嵌套目录
- 重启 Worker 使修复生效

### 验证
- Worker 重启后发送测试消息，确认 JSONL 写入 `~/.nanobot/workspace/sessions/`（正确）
- `sessions/sessions/` 不再被创建

### Commits
- nanobot 核心: `aaaf81d` (fix), `4a4f158` (docs) on local 分支

---

## Phase 25: 执行过程展示完整性优化 (Issue #24) ✅

> 对应需求 §十九 Issue #24

### 问题
- Web UI 执行任务过程中，ProgressIndicator 只显示思考文本和工具调用提示（如 `exec("ls -la")`）
- **不显示工具执行结果**，用户无法在执行过程中看到工具返回了什么
- 执行完成后从 JSONL 重载时才能看到完整的工具调用结果

### 解决方案

#### Worker 改动
- `WorkerCallbacks.on_message()` 不再为空
- 收到 `tool` 角色消息时，生成 `↳ tool_name → result_summary` 格式的 progress 事件
- SSE progress 事件增加结构化字段：`type: 'tool_result'`, `name`, `content`（完整输出）
- 新增 `_truncate_tool_output()` 辅助函数，提取工具输出的第一行作为摘要

#### 前端改动
- 新增 `ProgressStep` 类型（替代 `string`），包含 `text`, `type?`, `name?`, `content?`
- `messageStore.progressSteps` 从 `string[]` 改为 `ProgressStep[]`
- `api.ts` 的 `StreamCallbacks.onProgress` 改为传递 `ProgressStep` 对象
- `MessageList.tsx` 新增 `ProgressStepItem` 组件：
  - 普通进度步骤：`↳ text`（原有行为）
  - 工具结果：`↳ tool_name → summary ▸`，可点击展开查看完整输出
- 新增 CSS 样式：`.progressToolResult`, `.progressToolResultHeader`, `.progressToolDetail` 等

#### 执行过程渲染示例
```
┌─────────────────────────────────────────────────────┐
│ ↳ 让我查看一下你明天的日程。                           │  ← 思考文本
│ ↳ read_file("/path/to/SKILL.md")                    │  ← 工具调用提示
│ ↳ read_file → # Calendar Reader Skill...         ▸  │  ← 工具结果（可展开）
│ ↳ exec("./query_events.sh 2026-02-27 1")            │  ← 工具调用提示
│ ↳ exec → 查询到 5 条日程: 09:00 团队周会...        ▸  │  ← 工具结果（可展开）
│ ● ● ●                                              │  ← 等待中
└─────────────────────────────────────────────────────┘
```

### 改动文件
- `worker.py` — on_message 回调 + _truncate_tool_output
- `frontend/src/types/index.ts` — ProgressStep 类型
- `frontend/src/services/api.ts` — StreamCallbacks 传递 ProgressStep
- `frontend/src/store/messageStore.ts` — progressSteps 类型变更 + 兼容转换
- `frontend/src/pages/chat/MessageList.tsx` — ProgressStepItem 组件
- `frontend/src/pages/chat/MessageList.module.css` — 工具结果展开样式
- `docs/REQUIREMENTS.md` — Issue #24 需求描述

### Git
- web-chat commit: `6a9621a`, `f8f5428`

---

## Phase 26: 工具调用间隙用户消息注入 (Issue #25) ✅

> 对应需求 §二十 Issue #25 (Backlog #10)
> 在 agent 执行工具调用循环过程中，用户可在工具调用间隙输入补充信息，影响后续 LLM 决策。

### 实施记录

#### T26.1 nanobot 核心: callbacks + agent loop 集成 ✅
- `callbacks.py`: 新增 `check_user_input() -> str | None` 方法（Protocol + DefaultCallbacks）
- `loop.py`: 在工具调用完成后、下一轮 LLM 调用前，调用 `callbacks.check_user_input()`
  - 有注入文本时构造 `[User interjection during execution]` user 消息
  - 消息实时持久化到 JSONL + callbacks.on_message 通知 + progress 通知
- nanobot commit: `94598cb` (feat/user-inject → merged to local)

#### T26.2 Worker: inject 队列 + 端点 ✅
- Task 字典新增 `_inject_queue: queue.Queue()` — 线程安全消息队列
- `WorkerCallbacks.check_user_input()`: 非阻塞从队列获取，发送 `user_inject` SSE 事件
- 新增 `POST /tasks/<session_key>/inject` 端点
  - 验证任务存在且正在运行 → 消息入队 → 返回 `{"status": "injected"}`

#### T26.3 Gateway: inject 转发路由 ✅
- 新增 `POST /api/sessions/:id/task-inject` → 转发到 Worker

#### T26.4 前端: API + 输入框双模式 ✅
- `api.ts`: 新增 `injectMessage(sessionId, message)`
- `messageStore.ts`: 新增 `injectMessage(content)` action（乐观更新 progressSteps）
- `ChatInput.tsx`: 重写为双模式
  - **正常模式**: 发送按钮 → `sendMessage()`
  - **注入模式** (当前 session 执行中): 📝注入 + ■停止 双按钮
  - Placeholder: "输入补充信息... (Shift+Enter 注入)"
- `types/index.ts`: ProgressStep.type 增加 `'user_inject'`
- `MessageList.tsx` + CSS: `user_inject` 类型渲染（蓝色背景高亮）

### 验证
- Worker inject 端点: 无任务时返回 `{"status": "unknown"}`，有任务时 `{"status": "injected"}`
- Gateway → Worker 转发正常
- 前端 TypeScript + Vite 构建通过
- 端到端: inject 消息成功入队，在工具调用间隙被 agent loop 消费

### 改动文件
- nanobot: `agent/callbacks.py`, `agent/loop.py`
- web-chat: `worker.py`, `gateway.py`
- 前端: `api.ts`, `messageStore.ts`, `ChatInput.tsx`, `ChatInput.module.css`, `MessageList.tsx`, `MessageList.module.css`, `types/index.ts`

### Git
- nanobot: `94598cb` (feat/user-inject → local)
- web-chat: `6fc7c1a` (feat/user-inject → main)

---

## Phase 27: Worker 并发任务支持 (Issue #26) ✅

> 对应需求 §二十一 Issue #26 (Backlog #11)
> Worker 支持多 session 并发执行任务，前端每个 session 独立管理任务状态。

### 问题分析

**Worker 层**：
- 旧版使用 AgentRunner 单例，所有任务共享一个 AgentLoop 实例
- AgentLoop 内部的工具实例（MessageTool、SpawnTool、CronTool）通过 `_set_tool_context()` 设置 per-request 上下文
- 在 asyncio 单线程 event loop 中，并发任务交替执行时，工具上下文会在 `await` 点被覆盖

**前端层**：
- 全局 `sending` + `sendingSessionId` 作为单任务锁
- 任何 session 执行任务时其他 session 全部禁用

### 解决方案

#### Worker 改动
- 放弃 AgentRunner 单例，改为**每个任务创建独立的 AgentRunner 实例**
- 每个 AgentRunner 有独立的 AgentLoop → 独立的 ToolRegistry → 独立的工具上下文
- 任务完成后调用 `runner.close()` 释放 MCP 连接
- 启动时验证 config 可加载（fail fast），但不保留全局 runner
- Health 端点新增 `running_tasks` 计数，mode 改为 `sdk-concurrent`

#### 前端改动
- **types/index.ts**: 新增 `SessionTask` 接口（sending, progressSteps, recovering, abortController）
- **messageStore.ts** (v20): 
  - 移除全局 `sending`, `sendingSessionId`, `progressSteps`, `recovering`, `abortController`
  - 新增 `taskBySession: Record<string, SessionTask>`，每个 session 独立跟踪
  - 新增 `getTask(sessionId)` 方法
  - `injectMessage` 和 `cancelTask` 改为接受 `sessionId` 参数
  - `_updateTask` 辅助函数实现不可变更新
- **ChatInput.tsx**: 
  - 移除 `isOtherSessionSending` 逻辑
  - 只检查当前 session 的 task 状态
  - 其他 session 执行时当前 session 输入框正常可用
- **MessageList.tsx**: 
  - 从 `getTask(activeSessionId)` 读取 per-session 状态
  - ProgressIndicator 渲染逻辑不变，数据来源改为 per-session

### 并发安全分析
- 每个 AgentRunner 独立的 SessionManager 实例，但都读写同一 sessions 目录
- 不同 session key 写不同 JSONL 文件，天然无冲突
- 同一 session key 的并发由 Worker task registry 保证串行（已有逻辑）
- POSIX `open("a")` + `fsync()` 保证 append 写入原子性

### 改动文件
- `worker.py` — 每任务独立 runner + runner.close() + health 增强
- `frontend/src/types/index.ts` — SessionTask 接口
- `frontend/src/store/messageStore.ts` — per-session task state (v20)
- `frontend/src/pages/chat/ChatInput.tsx` — 移除全局锁
- `frontend/src/pages/chat/MessageList.tsx` — per-session task 读取
- `docs/REQUIREMENTS.md` — Issue #26 需求描述

### Git
- web-chat: `667419a` (feat/concurrent-tasks → main)

### 端到端验证 (2026-02-26 23:39)
- **顺序执行基线**: 9.2s (A:5.4s + B:3.8s)
- **并发执行**: 3.3s (A:2.9s + B:3.3s) → **2.8x 加速** ✅
- **running_tasks 计数**: SSE 流模式下正确显示 2 个并发任务 ✅
- **Health 端点**: `mode: sdk-concurrent`, `running_tasks` 实时更新 ✅
- **同 session 冲突处理**: 第二个任务等待第一个完成后执行 ✅

---

## Phase 28: 用量统计增强 + 工具调用用量展示 (Issue #27/#28) ✅

> 对应需求 §二十二 Issue #27 + Issue #28 (Backlog #12/#13)

### Issue #27: 已删除 Session 的用量统计显示

**问题**: 用量统计"按对话"表格中，已删除 JSONL 的 session 仍显示但名称无法读取。

**解决方案**:
- 后端 `_enrich_session_summaries`: 检测 JSONL 文件是否存在，不存在标记 `deleted: true`
- 前端 `api.ts`: `UsageBySession` 接口增加 `deleted?: boolean` 字段
- 前端 `UsagePage.tsx`: 活跃 session 正常显示，已删除 session 聚合为一行 `🗑️ 已删除对话 (N)`
- 前端 `UsagePage.module.css`: `.deletedRow` 灰色斜体样式

### Issue #28: 折叠工具调用展开后显示 Token 用量

**问题**: 工具调用折叠展开后只能看到调用详情，不知道消耗了多少 token。

**解决方案**:
- `MessageList.tsx`: 获取 session usage records，传递给 `AssistantTurnGroup`
- `MessageItem.tsx`: 
  - 新增 `UsageRecord` 类型
  - `AssistantTurnGroup` 接受 `usageRecords` 参数
  - 通过消息时间戳与 usage record 的 `[started_at, finished_at]` 匹配
  - `ToolProcessCollapsible` 展开后底部显示 `📊 XX tokens (XX 输入 / XX 输出) · N 次调用`
- `MessageList.module.css`: `.toolUsageSummary` 蓝色背景摘要样式

### 改动文件
- `gateway.py` — `_enrich_session_summaries` 增加 deleted 标记
- `frontend/src/services/api.ts` — `UsageBySession.deleted` 字段
- `frontend/src/pages/usage/UsagePage.tsx` — 已删除 session 聚合显示
- `frontend/src/pages/usage/UsagePage.module.css` — `.deletedRow` 样式
- `frontend/src/pages/chat/MessageList.tsx` — 获取 session usage + 传递给 turn group
- `frontend/src/pages/chat/MessageItem.tsx` — UsageRecord 类型 + 时间匹配 + 用量展示
- `frontend/src/pages/chat/MessageList.module.css` — `.toolUsageSummary` 样式
- `docs/REQUIREMENTS.md` — §二十二 Issue #27/#28 + backlog 更新
- `docs/DEVLOG.md` — Phase 28 记录

### Git
- web-chat commit: (pending)

---

## Phase 29: Session 管理增强 — 文件名显示 + 删除 + 标题优化 (Issue #29/#30/#31) ✅

> 日期：2026-02-27
> 需求：REQUIREMENTS.md §二十三

### 需求概述

1. **Issue #29**：Session 列表显示文件名（小字）
2. **Issue #30**：支持删除 Session
3. **Issue #31**：Session 标题显示优化

### 实现步骤

#### T1: 后端改动

- `gateway.py`:
  - `_handle_get_sessions` 返回新增 `filename`（如 `webchat_1772030778.jsonl`）和 `sessionKey`（如 `webchat:1772030778`）字段
  - `_handle_create_session` 返回同样包含 `filename` 和 `sessionKey`
  - 新增 `do_DELETE` 路由 + `_handle_delete_session` 方法（删除 JSONL 文件）
  - CORS 头增加 `DELETE` 方法支持

#### T2: 前端改动

- `types/index.ts`: `Session` 类型新增 `filename` 和 `sessionKey` 字段
- `services/api.ts`: 新增 `deleteSession(sessionId)` API 函数
- `store/sessionStore.ts`: 新增 `deleteSession` action（删除后自动切换到下一个 session）
- `Sidebar/SessionList.tsx`:
  - `SessionItem` 增加 `filename`、`sessionKey` props
  - 新增 `getDisplayTitle()` 函数：summary 等于 session_id 时显示友好名称（`webchat_` → "新对话"，`cli_` → "CLI 对话"）
  - 标题行改为 flex 布局（`.sessionTopRow`），右侧放删除按钮
  - 删除按钮 `×` 默认隐藏，hover 时显示；点击后弹出行内确认面板
  - 底部 meta 行显示 monospace 小字文件名 + 时间
- `Sidebar/Sidebar.module.css`:
  - 新增 `.sessionTopRow`、`.sessionDeleteBtn`、`.deleteConfirm*`、`.sessionFilename` 样式
  - 删除按钮 hover 变红色，确认面板内嵌 session item

### 改动文件
- `gateway.py` — DELETE API + filename/sessionKey 字段 + CORS DELETE
- `frontend/src/types/index.ts` — Session 类型扩展
- `frontend/src/services/api.ts` — deleteSession API
- `frontend/src/store/sessionStore.ts` — deleteSession action
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — 文件名显示 + 删除 + 标题优化
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css` — 新增样式
- `docs/REQUIREMENTS.md` — §二十三 Issue #29/#30/#31
- `docs/ARCHITECTURE.md` — API 总览 + DELETE API + Session 响应格式
- `docs/DEVLOG.md` — Phase 29 记录

### Git
- web-chat commit: e108530

---

## Phase 29: Web UI 自修改安全实践 (Issue #32 / Backlog #14) ✅

> 对应需求 §二十四 Issue #32 (Backlog #14)
> 建立完整的自修改安全规则体系，避免 Web UI 执行任务时 kill worker 导致自杀。

### 问题背景

Phase 24 SDK 化后，nanobot agent 运行在 worker 进程内。Phase 26 和 Phase 27 开发过程中，
两次从 Web UI 发起涉及 worker.py 修改的任务，nanobot 尝试 kill worker 重启时杀死了自己，
不得不切换到 CLI 恢复工作。

### 解决方案

不引入新的架构改造，通过**明确的分级操作规范**避免问题：

1. **任务风险评估**：发起任务前根据涉及文件判断风险级别（🟢安全/🟡低风险/🔴高风险）
2. **高风险任务走 CLI**：涉及 worker.py 或 nanobot 核心代码的修改必须通过 CLI 执行
3. **AI 自觉遵守**：nanobot 识别到高风险任务时主动提醒用户切换 CLI
4. **任务拆分**：复杂跨组件任务按风险级别拆分步骤

### 改动文件
- `docs/REQUIREMENTS.md` — §二十四 Issue #32 需求描述 + backlog #14 移除
- `docs/GUIDELINES.md` — 自修改安全规则体系升级（§1.1-1.8）
- `docs/DEVLOG.md` — Phase 29 记录

### Git
- web-chat commit: `221c2d0`

---

## Phase 30: 配置页面增强 + Session 搜索 + 删除回收站 (Issue #33/#34/#35) ✅

> 对应需求 §二十五 Issue #33 (配置页面对象数组)、Issue #34 (Session 搜索)、Issue #35 (删除回收站)

### T30.1 配置页面支持对象数组展示 (Issue #33) ✅

**问题**：飞书配置改为多租户数组后，配置页面无法正常展示和编辑。

**改动**：
- `ConfigPage.tsx`:
  - 新增 `isObjectArray()` 函数区分简单数组和对象数组
  - `ConfigValue` 对象数组返回 null（交由 ConfigObject 处理）
  - `ConfigObject` 新增对象数组渲染逻辑：每个元素展开为可折叠子面板，标题取 `name` 字段
  - `handleChange` 支持数组索引路径（`Number.isInteger(idx)` 判断）
- `ConfigPage.module.css`: 新增 `.arrayBadge` 样式

### T30.2 Session 搜索功能 (Issue #34) ✅

**改动**：
- `gateway.py`:
  - 新增 `GET /api/sessions/search?q=keyword` 路由
  - `_handle_search_sessions()`: 遍历所有 JSONL 文件，搜索标题和用户消息内容
  - 标题匹配优先排序，每 session 最多 3 条匹配摘要，最多返回 20 条结果
- `frontend/src/services/api.ts`:
  - 新增 `SearchResult` 接口和 `searchSessions()` API
- `frontend/src/pages/chat/Sidebar/Sidebar.tsx`:
  - 新增搜索状态管理（searchQuery, searchResults, searching）
  - 300ms debounce 搜索
  - 搜索结果替代 session 列表展示，点击跳转
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css`:
  - 新增 `.searchBox`, `.searchInput`, `.searchClear`, `.searchResults`, `.searchResultItem` 等样式

### T30.3 删除 Session 改为移入回收站 (Issue #35) ✅

**改动**：
- `gateway.py`:
  - `_handle_delete_session()`: `os.remove()` → `os.rename()` 移入 `sessions/.trash/`
  - 自动创建 `.trash` 目录，同名文件加时间戳后缀

### 改动文件
- `gateway.py` — 搜索 API + 删除回收站
- `frontend/src/services/api.ts` — 搜索 API
- `frontend/src/pages/config/ConfigPage.tsx` — 对象数组支持
- `frontend/src/pages/config/ConfigPage.module.css` — arrayBadge 样式
- `frontend/src/pages/chat/Sidebar/Sidebar.tsx` — 搜索 UI
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css` — 搜索样式
- `docs/REQUIREMENTS.md` — §二十五 Issue #33/#34/#35 + backlog 更新
- `docs/DEVLOG.md` — Phase 30 记录

### Git
- web-chat commit: `53f268b`

---

## Phase 32: 图片输入功能 (Issue #38) ✅

> 对应需求 §二十七 Issue #38
> 支持用户在 Web Chat 中发送图片，利用 Claude 多模态能力理解图片内容

### 任务拆解

由于涉及 worker.py 和 nanobot 核心修改（🔴高风险），在 CLI 中执行全部改动。

#### Step 1: nanobot 核心 — media 参数透传
- ✅ **T32.1** `process_direct()` 增加 `media` 参数，透传给 `_build_user_content()`
- ✅ **T32.2** `AgentRunner.run()` 增加 `media` 参数，透传给 `process_direct()`
- ✅ **T32.3** 测试：CLI 模式下发送图片消息验证

#### Step 2: Worker — 接收并传递 media
- ✅ **T32.4** `worker.py` execute-stream 端点接收 `images` 字段
- ✅ **T32.5** 传递给 `runner.run(media=images)`

#### Step 3: Webserver — 图片上传 + 静态服务
- ✅ **T32.6** `webserver.py` 新增 `POST /api/upload` — multipart 图片上传 API
- ✅ **T32.7** `webserver.py` 新增 `GET /api/uploads/<date>/<filename>` — 图片静态服务
- ✅ **T32.8** `webserver.py` 转发 images 给 worker + 处理多模态 content

#### Step 4: 前端 — 图片交互
- ✅ **T32.9** ChatInput 增加图片选择(📎)/拖拽/粘贴功能
- ✅ **T32.10** 图片预览缩略图 + 上传进度 + 移除按钮
- ✅ **T32.11** 发送时上传图片 + 附带路径
- ✅ **T32.12** MessageItem 中显示用户消息里的图片 (multimodal content 解析)

#### Step 5: 重启 + 验证
- ✅ **T32.13** `restart.sh all` 重启服务
- ✅ **T32.14** 端到端测试：上传蓝色 PNG → 发送 "什么颜色" → Claude 回复 "蓝色" ✅
- ✅ **T32.15** Git commit: `9fc2544`

### 技术细节

#### 多模态消息格式
用户发送带图片的消息时，JSONL 中 user message 的 `content` 为数组：
```json
[
  {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}},
  {"type": "text", "text": "用户的文本消息"},
  {"type": "text", "text": "[Runtime Context]\n..."}
]
```

#### 前端兼容处理
- `Message.content` 类型从 `string` 扩展为 `string | ContentBlock[]`
- `getTextContent()` / `getImageUrls()` 辅助函数统一处理两种格式
- AssistantTurnGroup、ToolProcessCollapsible 等组件全部适配

#### 图片存储
- 上传目录: `~/.nanobot/workspace/uploads/<date>/<uuid>.<ext>`
- URL: `/api/uploads/<date>/<filename>`
- JSONL 中存储 base64 data URL（由 nanobot 核心 `_build_user_content` 编码）

### 改动文件
- nanobot 核心: `agent/loop.py`, `sdk/runner.py` — media 参数透传
- `worker.py` — images 参数接收 + 传递
- `webserver.py` — upload API + image serving + multimodal content 处理
- `frontend/src/types/index.ts` — ContentBlock 类型
- `frontend/src/services/api.ts` — uploadImage + sendMessageStream images
- `frontend/src/store/messageStore.ts` — sendMessage images 参数
- `frontend/src/pages/chat/ChatInput.tsx` — 图片交互全套
- `frontend/src/pages/chat/ChatInput.module.css` — 图片预览/拖拽样式
- `frontend/src/pages/chat/MessageItem.tsx` — multimodal content 渲染
- `frontend/src/pages/chat/MessageList.module.css` — 消息图片样式

---

---

## Phase 33: 斜杠命令系统 (Issue #40) ✅

> 日期：2026-02-27
> 需求：REQUIREMENTS.md §二十九 Issue #40
> Web UI 支持斜杠命令（/help, /new, /stop），与 CLI/Telegram 行为一致

### 需求概述

1. `/help` — 前端本地处理，显示命令帮助（不消耗 token）
2. `/stop` — 前端本地处理，等价于停止按钮
3. `/new` — 发送到后端 agent loop 处理，归档并清空 session

### 实现记录

#### T33.1 前端 messageStore: 斜杠命令拦截逻辑 ✅
- `sendMessage()` 在 `task.sending` 检查之前拦截斜杠命令
- `/help`: 插入 `system-local` 消息显示命令列表
- `/stop`: 有任务时调用 `cancelTask()`，无任务时显示提示
- `/new`: 检查任务状态，发送到后端 agent loop 处理
- 未知命令: 显示提示信息
- ChatInput `handleSend()` 也拦截 `/stop`（处理 inject 模式）

#### T33.2 前端 types: 新增系统消息类型 ✅
- `Message.role` 扩展支持 `'system-local'`
- 新增 `SystemMessage` 接口
- `MessageGroup.type` 扩展支持 `'system'`

#### T33.3 前端 MessageItem: 系统消息渲染样式 ✅
- `groupMessages()` 识别 `system-local` role，创建 `system` 类型分组
- `MessageItem` 新增 `system-local` 渲染分支（居中、灰色背景、圆角）
- CSS: `.systemMessage` + `.systemBubble` 样式

#### T33.4 前端 ChatInput: placeholder 更新 ✅
- 正常模式: "输入消息或 /help 查看命令 (Shift+Enter 发送)"
- 执行中: "输入补充信息或 /stop 停止 (Shift+Enter 注入)"

#### T33.5 构建 + 测试 + Git 提交 ✅
- TypeScript 编译通过
- Vite 构建通过

### 改动文件
- `frontend/src/types/index.ts` — Message.role 扩展 + SystemMessage 类型
- `frontend/src/store/messageStore.ts` — v21 斜杠命令拦截 + _makeSystemMsg
- `frontend/src/pages/chat/ChatInput.tsx` — /stop 拦截 + placeholder 更新
- `frontend/src/pages/chat/MessageItem.tsx` — system-local 渲染 + MessageGroup 扩展
- `frontend/src/pages/chat/MessageList.tsx` — system 分组渲染
- `frontend/src/pages/chat/MessageList.module.css` — .systemMessage + .systemBubble
- `docs/REQUIREMENTS.md` — §二十九 Issue #40
- `docs/ARCHITECTURE.md` — §十五 斜杠命令系统
- `docs/DEVLOG.md` — Phase 33 记录

---

## Phase 44: 斜杠命令失败后输入回填 (Issue #50)

> 日期：2026-03-07
> 需求：REQUIREMENTS.md §三十六 Issue #50
> 纯前端改动（🟢 安全），不涉及后端

### 需求概述

用户输入以 `/` 开头的非命令内容（如文件路径），被 slash 命令系统识别为未知命令后，输入框已被清空。需要在未知命令时回填原始输入，方便用户修改后重新发送。

### 任务清单

- ✅ **T44.1** `messageStore.ts` — unknown command 分支回填 draft
  - 在 `default` (unknown slash command) 分支中，显示错误提示后调用 `get().setDraft(sessionId, content)` 回填原始输入
- ✅ **T44.2** `ChatInput.tsx` — draft 变化时重新计算 textarea 高度
  - `adjustHeight` useEffect 依赖数组增加 `text`，确保 draft 回填后 textarea 高度正确调整
- ✅ **T44.3** 前端构建 + 验证 + Git 提交

### 改动文件
- `frontend/src/store/messageStore.ts` — unknown command 分支 `setDraft()` 回填
- `frontend/src/pages/chat/ChatInput.tsx` — adjustHeight useEffect 增加 `text` 依赖

---

## Phase 47: Bug 修复 — 后端不可达时消息静默丢失 (2026-03-08)

> 分支：`main`

### 问题

用户发送消息时后端正好在重启（webserver 宕机），fetch POST 直接失败。前端 `sendMessage` 的 catch 块中 `isConnectionError` 正则匹配到 `"Failed to fetch"` 后误入 poll recovery 分支（`_pollTaskStatus`），但消息从未到达后端，poll 毫无意义。poll 多次后超时放弃，显示"请刷新页面查看结果"。用户刷新后消息消失——**消息静默丢失**。

### 根因

`isConnectionError` 正则无差别匹配了两种不同性质的错误：
1. **fetch 失败**（`"Failed to fetch"` / `"网络错误"`）— 消息未送达后端
2. **SSE 中途断开**（`"SSE connection reset — task may still be running"`）— 消息已送达，任务可能仍在运行

修改前两种错误都走 poll recovery 分支，但 fetch 失败时 poll 完全无意义。

### 修复

在 `sendMessage` 的 catch 块中，新增 `isSseDisconnect` 和 `isFetchFailure` 两个判断：

- **`isSseDisconnect`**：错误消息匹配 `"SSE connection reset"` 或 `"task may still be running"` → 保持现有 poll recovery 行为不变
- **`isFetchFailure`**：`isConnectionError && !isSseDisconnect` → 新行为：
  - 回滚 optimistic update（移除前端临时添加的 `userMsg`）
  - 重置 sending 状态，允许用户重新发送
  - 显示明确的错误提示："消息发送失败（服务暂不可用），请稍后重试"

### 副作用评估

| 错误类型 | 修改前行为 | 修改后行为 | 影响 |
|----------|-----------|-----------|------|
| fetch 失败 | 静默丢失 + 无意义 poll | 提示重试 + 回滚 | ✅ 改善 |
| SSE 断开 | poll recovery | poll recovery（不变） | ✅ 无影响 |
| HTTP 错误 | 直接显示错误 | 直接显示错误（不变） | ✅ 无影响 |
| 业务错误 | 直接显示错误 | 直接显示错误（不变） | ✅ 无影响 |

### 改动文件
- `frontend/src/store/messageStore.ts` — sendMessage catch 块区分 fetch 失败 vs SSE 断开
- `docs/DEVLOG.md` — Phase 47 记录

---

*每次 session 更新此文件后 commit。*

---

## Phase 48: 全链路统一用 session.id 替代 sessionKey (§三十九 Issue #53)

> 日期：2026-03-09
> 需求：REQUIREMENTS.md §三十九 Issue #53
> 方案详情：docs/ISSUE_SESSION_KEY_DEDUP.md

### 任务清单

#### Phase 1: 前端改动（修复核心 bug）

- [x] **T48.1** `SessionList.tsx` — `buildSessionTree()` 全部改用 `id`
  - `nodeByKey` key 改为 `s.id`
  - `allSessionKeys` → `allSessionIds`，收集 `s.id`
  - `childSessionKeys` → `childSessionIds`，收集 `s.id`
  - `sessionByKey` 只写 `s.id`

- [x] **T48.2** `SessionList.tsx` — `resolveParent()` 改为基于 id 格式
  - 参数从 `allSessionKeys` 改为 `allSessionIds: Set<string>`
  - 查找 parentMap 用 id
  - subagent 启发式：从 id 提取（`subagent_` 前缀，`_` 分隔）
  - webchat 启发式：从 id 提取（`webchat_` 前缀，`_` 分隔）
  - 精确匹配 `endsWith('_' + ts)` 替代 `endsWith(':' + ts)`

- [x] **T48.3** `SessionList.tsx` — `getChannel()` 改为从 id 提取
  - 取第一个 `_` 或 `.` 之前的部分作为 channel

- [x] **T48.4** `SessionList.tsx` — 所有 React key、expandedKeys、tagsMap 查找改用 id

- [x] **T48.5** `sessionStore.ts` — `toggleDone()` 中 key 改用 `session.id`

#### Phase 2: 后端 + 数据迁移

- [x] **T48.6** `webserver.py` — `_handle_patch_tags()` 改为直接用 `session_id` 存 tags

- [x] **T48.7** 迁移脚本 — `migrate_session_keys_to_ids.py`
  - 扫描所有 JSONL 建立 `sessionKey → [id...]` 映射
  - 迁移 `session_tags.json`：sessionKey → id（重复 key 的 tags 复制到每个 id）
  - 迁移 `session_parents.json`：key 和 value 都从 sessionKey 转为 id
  - 版本检测：webserver 启动时检查 tags/parents 是否含有 `:` 格式的 key，报错引导迁移
  - 迁移结果：96 个 sessionKey 格式 → 101 个 id 格式（tags），103 个 key + 105 个 value（parents）

#### Phase 3: 清理验证

- [x] **T48.8** TypeScript 编译 + Vite build 通过
- [x] **T48.9** Git 提交 — commit `5b17ad8`

### 改动文件
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — getChannel/resolveParent/buildSessionTree 全面改用 id
- `frontend/src/store/sessionStore.ts` — toggleDone 改用 session.id
- `webserver.py` — _handle_patch_tags 改为直接用 session_id 存 tags
- `migrate_session_keys_to_ids.py` — 迁移脚本（新建）
- `docs/REQUIREMENTS.md` — §三十九 Issue #53
- `docs/DEVLOG.md` — Phase 48 记录

---

## Phase 34: Runtime Context 过滤统一收拢 (Issue #41) ✅

> 对应需求 Issue #41

### 问题
webserver.py 中 5-6 处分散的 `[Runtime Context]` 过滤逻辑，代码重复且存在 bug：
- multimodal 消息先拼接 text blocks 再 strip，空格分隔导致正则匹配失败
- session 列表 summary 泄露 Runtime Context 内容

### 修复
1. 提取模块级 `strip_runtime_context(content)` 统一函数
2. 预编译正则 `_RC_PATTERN = re.compile(r'(?:^|\n)\s*\[Runtime Context\].*', re.DOTALL)`
3. 同时处理 string 和 multimodal list 两种格式
4. 修复处理顺序：先 strip 再 flatten（先清理原始 content，再拼接 text）
5. 所有 5 处调用统一替换

### 改动文件
- `webserver.py` — 新增 `strip_runtime_context()` 函数，替换 5 处分散过滤逻辑
- `docs/REQUIREMENTS.md` — Issue #41
- `docs/DEVLOG.md` — Phase 34 记录

### Git
- web-chat commit: `d895365`

---

## Phase 31: Gateway 改名 Webserver + URL 编码 Bug 修复 (Issue #36/#37) ✅

> 对应需求 §二十六 Issue #36 (命名优化)、Issue #37 (URL 编码 Bug)

### T31.1 URL 编码 Bug 修复 (Issue #37) ✅

**问题**：文件名含 `%3A` 的 session（如 `test%3Ainject_e2e2.jsonl`）无法加载消息和删除。
**根因**：前端 `encodeURIComponent("test%3Ainject_e2e2")` 产生双重编码 `test%253Ainject_e2e2`，后端 `_parse_path()` 不做 URL decode，导致不匹配。
**修复**：`_parse_path()` 中增加 `urllib.parse.unquote()` 解码。

### T31.2 Gateway 改名为 Webserver (Issue #36) ✅

**改动**：
- `gateway.py` → `webserver.py`（文件重命名 + 内部 class/logger/service name 更新）
- `restart-gateway.sh` → `restart.sh`（脚本重命名 + 子命令 `webserver` 替代 `gateway`）
- 日志文件：`/tmp/nanobot-gateway.log` → `/tmp/nanobot-webserver.log`
- `start.sh` 更新引用
- `frontend/src/services/api.ts` 注释更新
- `docs/GUIDELINES.md` 所有 gateway 引用更新

### 改动文件
- `gateway.py` → `webserver.py`
- `restart-gateway.sh` → `restart.sh`
- `start.sh`
- `frontend/src/services/api.ts`
- `docs/REQUIREMENTS.md` — §二十六 Issue #36/#37
- `docs/GUIDELINES.md` — gateway → webserver
- `docs/DEVLOG.md` — Phase 31 记录

### Git
- web-chat commit: `aeb2fa0`

---

## Phase 35: Session 列表按来源分组 (Issue #42) ✅

> 日期：2026-02-28
> 需求：REQUIREMENTS.md §三十 Issue #42
> Session 列表按来源（channel）分组显示，提升多来源 session 管理体验

### 需求概述

随着 session 来源多样化（网页、命令行、飞书、Telegram 等），平铺的 session 列表查找不便。按 channel 分组显示，每组带图标标题，可折叠/展开。

### 实现记录

#### 分组逻辑
- 从 `sessionKey` 的冒号前缀提取 channel（如 `feishu.lab:xxx` → `feishu`）
- 支持子 channel 归并（`feishu.lab`、`feishu.ST` → 统一归入 `feishu` 组）
- 分组配置表定义图标、标题和固定排序（webchat 优先）
- 只有一个分组时不显示分组头（保持简洁）

#### Channel 分类

| Channel 前缀 | 分组名 | 图标 | 排序 |
|--------------|--------|------|------|
| `webchat` | 网页对话 | 🌐 | 0 |
| `cli` | 命令行 | 💻 | 1 |
| `feishu` | 飞书 | 💬 | 2 |
| `telegram` | Telegram | ✈️ | 3 |
| `discord` | Discord | 🎮 | 4 |
| `test` | 测试 | 🧪 | 5 |
| 其他 | 其他 | 📁 | 6 |

### 改动文件
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — 分组逻辑 + ChannelGroupHeader 组件
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css` — 分组头样式
- `docs/REQUIREMENTS.md` — §三十 Issue #42
- `docs/DEVLOG.md` — Phase 35 记录

### Git
- web-chat commit: `cae2b51`

---

## Phase 36: ProviderPool — Web Chat Provider 切换 (Issue #43)

> 日期：2026-03-01
> 需求：运行时 Provider 动态切换（webchat 侧）
> 核心依赖：nanobot Phase 16 ProviderPool（详见 nanobot `docs/DEVLOG.md` Phase 16）

### 需求概述

1. Worker 维护模块级 ProviderPool 单例，提供 `GET/PUT /provider` API
2. Webserver 转发 `/api/provider` 到 Worker
3. 前端 `/provider` 斜杠命令 + provider 选择器 UI
4. 任务执行中前后端都禁止切换

### 任务清单

- ✅ **T36.1** Worker: 模块级 ProviderPool 单例 + GET/PUT /provider 端点
  - `_get_pool()` / `_build_pool()` 从 config 构建 ProviderPool 单例
  - `_create_runner()` 基于 Pool 当前 active 状态构建 runner
  - `GET /provider` 返回 active + available
  - `PUT /provider` 切换（任务执行中返回 409）

- ✅ **T36.2** Webserver: 转发 `/api/provider`
  - `GET /api/provider` → worker `GET /provider`
  - `PUT /api/provider` → worker `PUT /provider`

- ✅ **T36.3** 前端: provider API + store
  - `api.ts` 新增 `getProvider()` / `setProvider()` + `ProviderInfo` 接口
  - `store/providerStore.ts` 新建 provider 状态管理

- ✅ **T36.4** 前端: `/provider` 斜杠命令
  - `messageStore.ts` 拦截 `/provider` 命令
  - 调 API 查询/切换，显示 system-local 消息

- ✅ **T36.5** 前端: ChatInput provider 选择器 UI + CSS
  - 输入框上方 provider + model 选择器
  - 任务执行中 disabled
  - 点击外部自动关闭下拉框

- 🔜 **T36.6** 构建 + 测试 + Git 提交

---

## Phase 37: Bug 修复 — SSE 流中断导致前端卡死

> 日期：2026-03-01
> 诊断文档：`docs/BUG_SSE_FREEZE.md`
> 分支：`fix/sse-freeze`

### 根因分析

SSE 流中断后前端 UI 卡死（sending 状态永远不重置）。诊断发现 4 个问题：

1. **Worker 无心跳** — Worker SSE 流在 agent 等待 LLM 响应时长时间无数据，webserver 的 urllib socket read timeout 触发
2. **Webserver SSE 污染**（最严重）— SSE 超时后 webserver 在已发送 200+SSE headers 的流中调用 `_send_json(500)`，混入 HTTP 响应头+JSON body 污染 SSE 流
3. **前端 recovery 正则不匹配** — `isConnectionError` 正则 `/fetch|network|abort|reset|refused/i` 不匹配 `timed out` 和 `SSE connection reset`，导致走 business error 分支不触发 recovery 轮询
4. **Worker done 事件竞态** — `_notify_sse` 发送 done 事件和 `_attach_to_existing_task` 的 while 循环退出之间可能有时序问题

### 任务清单

- ✅ **T37.1** Worker: SSE 心跳 keepalive
  - `_attach_to_existing_task` 的 while 循环中每 15 秒发送 `: keepalive\n\n` 注释行
  - 防止 webserver urllib socket read timeout

- ✅ **T37.2** Webserver: SSE 超时后不污染响应流
  - 添加 `sse_headers_sent` 标志追踪 SSE headers 是否已发送
  - 新增 `_send_sse_error()` 方法：SSE 已发送时用标准 SSE error 事件代替 `_send_json(500)`
  - 跳过 worker keepalive 注释行（`:` 开头），不转发给前端

- ✅ **T37.3** 前端: recovery 正则扩展
  - `isConnectionError` 正则增加 `timeout|timed|connection|running` 匹配（两处）
  - 确保 SSE 中断类错误都能触发 recovery 轮询

- ✅ **T37.4** 构建 + 测试 + 更新 BUG 文档 + Git 提交
  - `npm run build` ✅ (523 modules, 969ms)
  - 服务重启验证 ✅
  - BUG_SSE_FREEZE.md 更新为已修复 ✅

---

## Phase 38: LLM 错误响应显示 (2026-03-03)

> 分支：`main`

### 背景

合并 upstream 后，`finish_reason="error"` 的 LLM 响应不再写入 JSONL session 文件。
导致：
1. Web 前端看不到错误信息（JSONL 中无记录，重载后消失）
2. SSE 流正常发送 `done` 事件但无错误内容
3. 错误信息只出现在日志中

### 修复方案

**后端（nanobot core `loop.py`）**：
- 在 `finish_reason="error"` 分支中，将错误消息以 `"Error calling LLM: {text}"` 前缀存入 JSONL
- 调用 `callbacks.on_message()` 通知前端
- 调用 `on_progress()` 发送 `❌` 前缀的 SSE progress 事件
- `get_history()` Phase 2 自动过滤 `"Error calling LLM:"` 前缀的消息，防止 LLM context 中毒

**前端（web-chat `MessageItem.tsx`）**：
- 检测 `"Error calling LLM:"` 前缀的 assistant 消息
- 剥离前缀，显示干净的错误文本 + ❌ 图标
- 错误气泡使用红色调背景和边框（`.errorBubble` 样式）
- 在 `AssistantTurnGroup` 和独立 `MessageItem` 中均生效

### 任务清单

- ✅ **T38.1** `loop.py` — 错误响应持久化 + callback 通知
- ✅ **T38.2** `MessageItem.tsx` — 错误消息检测与样式化
- ✅ **T38.3** `MessageList.module.css` — 错误气泡 CSS
- ✅ **T38.4** `test_error_response.py` — 5 个新测试全部通过
- ✅ **T38.5** 全量测试 334 passed + 前端构建 + 服务重启


---

## Phase 39: Message 工具 fallback 显示 + 项目清理 (2026-03-04)

> 分支：`main`

### 问题 1: Message 工具内容不显示

当 agent 使用 `message` 工具作为最终输出时（而非直接返回文本），nanobot loop 检测到 `_sent_in_turn=True`，suppress 掉最终的 OutboundMessage。JSONL 中最后一条 assistant 消息的 `content=null`。

前端 `AssistantTurnGroup` 查找 final reply 时只找"没有 tool_calls 且有 content 的 assistant 消息"，因此找不到 final reply，用户看不到 agent 的最终回复。

**修复**：在 `AssistantTurnGroup` 中增加 **Step 1b fallback**：
1. 当找不到正常的 `finalReplyMsg` 时
2. 从后往前搜索 `message` 工具调用，解析其 `arguments.content`
3. 将该 content 作为 `messageToolContent` 渲染为 Markdown final reply

**历史消息兼容**：JSONL 中 `tool_calls[].function.arguments` 完整保存了 message content JSON，API 返回时原样传递，前端解析提取，历史加载完全兼容。

### 问题 2: start.sh 与 restart.sh Python 检测不一致

`start.sh` 硬编码 `python3`，而 `restart.sh` 有 `NANOBOT_PYTHON` 自动检测逻辑。

**修复**：同步 start.sh 的 Python 检测逻辑，与 restart.sh 保持一致。

### 问题 3: 历史遗留文件清理

以下文件是早期开发遗留，已被 `webserver.py` + `worker.py` + React 前端完全替代：
- `server.py` — 旧版单文件后端（v1，端口 8080）
- `server_v2.py` — 过渡版后端（v2，端口 8081，后拆分为 webserver + worker）
- `server.log` — 旧版日志文件
- `index.html` — 旧版单文件前端

**处理**：从 git 跟踪中移除并删除。

### 任务清单

- ✅ **T39.1** `MessageItem.tsx` — message 工具 fallback 逻辑
- ✅ **T39.2** `start.sh` — 同步 Python 自动检测逻辑
- ✅ **T39.3** 删除历史遗留文件（server.py, server_v2.py, server.log, index.html）
- ✅ **T39.4** 前端构建 + 服务重启
- ✅ **T39.5** Git 提交（含 restart.sh 未提交的改动）

### 改动文件
- `frontend/src/pages/chat/MessageItem.tsx` — message 工具 fallback 显示
- `start.sh` — Python 检测逻辑同步
- `restart.sh` — Python 自动检测（上次未提交的改动）
- 删除：`server.py`, `server_v2.py`, `server.log`, `index.html`
- `docs/DEVLOG.md` — Phase 39 记录

---

## Phase 40: Provider 配置热加载 + 默认模型配置 (Issue #44/#45/#46)

> 日期：2026-03-04
> 需求：REQUIREMENTS.md §三十三
> 涉及 nanobot 核心 + web-chat worker + webserver + 前端

### 问题诊断

1. **Provider 不显示**：Worker `_provider_pool` 是模块级单例，启动时构建后不再更新。config 新增 gemini/custom 后，不重启 worker 就看不到。
2. **配置保存不生效**：`PUT /api/config` 只写文件，不通知 worker reload。
3. **默认模型硬编码**：`_PROVIDER_DEFAULT_MODELS` 在 `commands.py` 中硬编码，用户无法自定义每个 provider 的偏好模型。

### 任务清单

- ✅ **T40.1** nanobot 核心: `ProviderConfig` 新增 `preferred_model` 字段
  - `config/schema.py`: `preferred_model: str | None = None`
  - `cli/commands.py`: `_make_provider()` 优先使用 `preferred_model`
  - nanobot core commit: `2f62f59`

- ✅ **T40.2** Worker: `POST /provider/reload` 端点
  - 重新调用 `_build_pool()` 替换单例
  - 尝试保持当前 active provider
  - 任务运行中返回 409

- ✅ **T40.3** Webserver: 转发 + config 保存后自动 reload
  - `POST /api/provider/reload` 转发到 worker
  - `_handle_put_config` 保存成功后调用 reload（best-effort，不阻塞保存）

- ✅ **T40.4** 前端: ConfigPage 保存后刷新 provider
  - `ConfigPage.tsx`: 保存成功后调用 `providerStore.fetchProvider()`
  - 显示 reload 状态信息

- ✅ **T40.5** 前端构建通过

- ✅ **T40.6** 服务重启 + 端到端验证 + 文档更新 + Git push
  - Worker PID 26129 运行正常，5 个 provider 全部显示
  - POST /provider/reload 在任务运行时正确返回 409
  - 代理端点 /api/provider/reload 正常转发

### 验证结果

- ✅ `GET /provider` 返回 5 个 provider（含 custom + gemini）
- ✅ `POST /provider/reload` 任务运行时返回 409（保护机制）
- ✅ webserver 代理 `/api/provider/reload` 正常转发
- ✅ nanobot core 334 tests passed
- ✅ 前端构建通过
- ✅ 服务重启后功能正常

---

## Phase 41: API Session 前端辨识 (Issue #47 / B5)

> 日期：2026-03-06
> 需求：REQUIREMENTS.md §三十四 Issue #47（从 Backlog #15 提升，对应 eval-bench 改进需求 B5）
> 纯前端改动（🟢 安全），不涉及后端

### 需求概述

webchat 分组下 126 个 session 中有 54 个是 API 程序化创建的（dispatch/worker/qa_r2 等），与 71 个手动 session 混在一起。需要在 webchat 分组内增加子分组，将 API session 默认折叠，让手动 session 更易找到。

### 识别规则

webchat channel 下，session_key 冒号后部分：
- **纯数字** → 手动创建（如 `webchat:1772030778`）
- **包含非数字字符** → API 创建（如 `webchat:dispatch_1772696251_gen1`）

### 任务清单

- ✅ **T41.1** `SessionList.tsx` — 新增 `isApiSession()` 辅助函数 + webchat 子分组逻辑
  - 在 channel 分组后，对 webchat 组拆分为 manual + api 两部分
  - 新增 `ApiSessionSubgroup` 组件（🤖 自动任务，默认折叠）
  - 手动 session 正常渲染在分组头下方，api session 在子分组内
  - `ChannelGroup` 接口扩展 `apiSessions` 字段
  - `renderGroupSessions` 统一渲染逻辑（单/多分组复用）

- ✅ **T41.2** `Sidebar.module.css` — 新增子分组头样式
  - `.apiSubgroupHeader`：比 channel 分组头更小更紧凑（padding-left: 16px 缩进）
  - `.apiSubgroupSessions`：padding-left: 8px 子分组内 session 缩进
  - 字体/图标尺寸比 channel 分组头小一号

- ✅ **T41.3** 前端构建 + 验证 + Git 提交
  - TypeScript 编译通过
  - Vite 构建通过（523 modules, 1.04s）
  - Git commit: `d04d91c`

### 识别规则实现

```typescript
function isApiSession(sessionKey: string): boolean {
  // webchat:1772030778 → 纯数字 → 手动创建
  // webchat:dispatch_1772696251_gen1 → 含非数字 → API 创建
  const suffix = sessionKey.substring(sessionKey.indexOf(':') + 1);
  return !/^\d+$/.test(suffix);
}
```

### 改动文件
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — isApiSession + ChannelGroup.apiSessions + ApiSessionSubgroup 组件 + renderGroupSessions 统一 + subagent channel 支持
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css` — .apiSubgroup* 样式
- `docs/REQUIREMENTS.md` — §三十四 Issue #47 + Backlog #15 移除 + Backlog #17 新增
- `docs/DEVLOG.md` — Phase 41 记录

### nanobot 核心联动改动
- `nanobot/agent/subagent.py` — subagent session key 格式从 `subagent:{task_id}` 改为 `subagent:{parent_key_sanitized}_{task_id}`
- `docs/REQUIREMENTS.md` §二十四 — 更新 persist session key 格式说明
- `docs/ARCHITECTURE.md` §十一 — 更新 session key 格式和依赖关系表
- nanobot commit: `f2d456f`

### Git
- web-chat commits: `d04d91c` (main feature), `0532e61` (subagent channel)
- nanobot commit: `f2d456f` (subagent session key format)

---

## Phase 42: Session 树形结构 — 父子关系 + 折叠面板 + 徽章 (§三十四 Issue #48)

> 日期：2026-03-06
> 需求：API session 支持父子关系树形展示，子 session 折叠在父 session 下方

### 需求概述

API 创建的 session 之间存在父子关系（如 dispatch → worker），需要在侧边栏以树形结构展示：
1. 根 session 显示后代数量徽章
2. 子 session 可折叠/展开
3. 总清单计数只数根节点

### 数据源

#### 1. 映射文件 `session_parents.json`
- 位置：`~/.nanobot/workspace/sessions/session_parents.json`
- 格式：`{ "子session_key": "父session_key" }`
- 后端 API：`GET /api/sessions/parents` 返回映射

#### 2. 启发式规则（前端）
- `subagent:{parent_key_sanitized}_{task_id}` → 提取 parent key
- 映射文件优先，启发式作为补充

### 任务清单

- ✅ **T42.1** 后端：`GET /api/sessions/parents` API
  - `webserver.py` 新增路由，读取 `session_parents.json` 返回
  - `api.ts` 新增 `fetchSessionParents()` API

- ✅ **T42.2** 前端：`sessionStore` 加载 parentMap
  - `fetchSessions()` 同时拉取 parentMap
  - `parentMap: Record<string, string>` 状态字段

- ✅ **T42.3** 前端：`SessionList.tsx` 树形结构构建
  - `buildSessionTree()` 函数：映射文件 + subagent 启发式 → 树形节点
  - `TreeNode` 接口：session + children + descendantCount
  - 底层向上计算 descendantCount

- ✅ **T42.4** 前端：树形渲染 UI
  - 根 session 显示蓝色数字徽章（descendantCount）
  - 可折叠子 session 面板（"收起/展开 N 个子 session"）
  - 子 session 缩进 + 箭头指示器
  - 递归渲染支持多级嵌套

- ✅ **T42.5** Bug 修复：根 session 徽章被 overflow 截断
  - 问题：`.sessionSummary` 的 `overflow: hidden` + `text-overflow: ellipsis` 把徽章裁掉
  - 修复：文本包到 `.sessionSummaryText` span，truncation 只作用于文本，徽章 `flex-shrink: 0` 始终可见

- ✅ **T42.6** 总清单计数修正
  - 分组标题旁的 session 计数只数根节点（`group.roots.length`），不含子 session

### 改动文件
- `webserver.py` — `GET /api/sessions/parents` 路由
- `frontend/src/services/api.ts` — `fetchSessionParents()` API
- `frontend/src/store/sessionStore.ts` — `parentMap` 状态 + 加载逻辑
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — 树形结构全面重写（buildSessionTree, TreeNode, 递归渲染, 徽章, 折叠面板）
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css` — 树形节点样式（treeNodeRow, treeChildrenContainer, childBadge, sessionSummaryText 等）

### Git
- web-chat commit: (pending — 含 Phase 42.7)

---

## Phase 42.7: 启发式规则 B 跨通道父子关系匹配 (2026-03-06)

> Phase 42 的增强补丁

### 问题

启发式规则 B 硬编码拼接 `webchat:` 前缀作为父 session key：
```typescript
return 'webchat:' + tsMatch[1];  // 始终拼 webchat: 前缀
```

当从 CLI 或飞书通道通过 web-subsession 创建子 session 时：
- 子 session: `webchat:dispatch_1772603563_gen1`
- 父 session: `cli:1772603563`（不是 `webchat:1772603563`）
- 启发式规则拼出 `webchat:1772603563`，但该 session 不存在 → 父子关系丢失

### 修复

`resolveParent()` 不再硬编码 `webchat:` 前缀，改为在所有已加载 session 中搜索以 `:<timestamp>` 结尾的 session key：

```typescript
// 旧：return 'webchat:' + tsMatch[1];
// 新：遍历 allSessionKeys，找 endsWith(':' + ts) 的 session
for (const candidate of allSessionKeys) {
  if (candidate.endsWith(':' + ts)) return candidate;
}
```

**函数签名变更**：
- `resolveParent(session, parentMap)` → `resolveParent(session, parentMap, allSessionKeys?)`
- `buildSessionTree()` 构建 `allSessionKeys: Set<string>` 并传入

### 跨通道匹配验证

| 子 session | 匹配的父 session |
|-----------|----------------|
| `webchat:dispatch_1772696251_gen1` | `webchat:1772696251` ✅ |
| `webchat:dispatch_1772603563_gen1` | `cli:1772603563` ✅ |
| `webchat:worker_1772376517_task005` | `feishu.lab:1772376517` ✅ |
| `webchat:1772778886`（普通 session） | null（不匹配）✅ |

### 改动文件
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — resolveParent 跨通道搜索 + allSessionKeys 参数
- `docs/REQUIREMENTS.md` — 启发式规则 B 描述更新为"跨通道搜索"

---

## Phase 43: 三级树状 Session 父子关系 (Issue #49)

> 日期：2026-03-06
> 需求：REQUIREMENTS.md §三十五 Issue #49
> batch 调度场景下 session 父子关系从扁平化升级为三级树状结构

### 需求概述

batch-orchestrator 场景下，调度和 Worker 都扁平挂在主控下，无法区分哪些 Worker 属于哪个调度。
需要体现三级树：主控 → 调度 → Worker。

### 方案（G 方案）

1. **调度 session 命名**：`webchat:dispatch_<主控ts>_<调度自身ts>`（含双 timestamp）
2. **Worker session 命名**：`webchat:worker_<调度ts>_<detail>`（parent_ref 指向调度的 ts）
3. **前端启发式规则 B 扩展**：提取 timestamp 后，先精确匹配 `endsWith(':' + ts)`，再后缀匹配 `endsWith('_' + ts)`

### 任务清单

- ✅ **T43.1** `SessionList.tsx` `resolveParent()` — 扩展启发式规则 B
  - 新增 Priority b：`endsWith('_' + ts)` 后缀匹配
  - 排除自身（`candidate !== sk`）避免自引用
  - 注释更新说明三级树支持

- ✅ **T43.2** `skills/web-subsession/SKILL.md` — 更新命名规范
  - 新增"三级树状结构"章节，含完整示例
  - 更新父子关系识别规则（精确匹配 + 后缀匹配）
  - 更新文件名映射示例
  - 更新跨通道使用示例
  - 更新路径 A 和脚本工具示例

- ✅ **T43.3** `skills/batch-orchestrator/SKILL.md` — 更新命名规范
  - 角色分工图增加 session_key 格式说明
  - §3 重写为三级树状结构，含调度和 Worker 命名格式
  - 新增父子关系自动识别表（精确匹配 + 后缀匹配）
  - 新增调度 ts 生成代码示例
  - 更新跨通道使用说明

- ✅ **T43.4** `docs/REQUIREMENTS.md` — 新增 §三十五 Issue #49

- ✅ **T43.5** 前端构建通过
  - TypeScript 编译 ✅
  - Vite 构建 ✅ (523 modules, 998ms)

- ✅ **T43.6** MEMORY.md 更新 + Git 提交

### 向后兼容

- 旧的扁平命名（`worker_<主控ts>_xxx`）仍能被精确匹配到主控，显示为扁平（不报错）
- 新规则只增加了 `endsWith('_' + ts)` 备选搜索，不影响现有匹配

### 改动文件
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — resolveParent 扩展启发式规则 B
- `skills/batch-orchestrator/SKILL.md` — 三级树状命名规范
- `skills/web-subsession/SKILL.md` — 三级树状命名规范 + 跨通道更新
- `docs/REQUIREMENTS.md` — §三十五 Issue #49
- `docs/DEVLOG.md` — Phase 43 记录

---

## Phase 45: restart.sh 进程发现与健康检查修复 (Issue #51)

> 日期：2026-03-08
> 需求：REQUIREMENTS.md §三十七 Issue #51
> 运维脚本改动（🟢 安全），不涉及后端/前端代码

### 问题诊断

在新电脑上发现 `restart.sh` 重启服务静默失败：

1. **pgrep 匹配失败**：`pgrep -f "webserver.py.*--port 8081"` 要求命令行包含 `--port 8081`，但实际进程以默认端口启动（无 `--port` 参数）
2. **跳过 kill**：pgrep 找不到进程 → 脚本认为"not running" → 不执行 kill
3. **新进程启动失败**：端口被老进程占用 → 新进程静默退出
4. **健康检查误报**：curl 打到老进程仍有响应 → 报告 ✅ healthy → **假象重启成功**

### 任务清单

- ✅ **T45.1** 进程发现鲁棒化 — `find_pids()` + `find_pid_on_port()`
  - 三层发现策略：pgrep 脚本路径 → pgrep 进程名 → lsof 端口占用
  - 合并去重后统一 kill，不再依赖命令行参数匹配

- ✅ **T45.2** Stop 后端口释放验证
  - kill 后通过 `lsof -ti :${port}` 确认端口无进程监听
  - 如仍被占用，报错并提示手动 kill（返回非零退出码）

- ✅ **T45.3** 健康检查增加进程年龄验证 — `verify_health()` + `get_process_age_seconds()`
  - curl 响应后，通过 lsof 找端口 PID → `ps -o etime=` 获取运行时长
  - 进程年龄 ≤ 10s → ✅ 新进程，报告成功
  - 进程年龄 > 10s → ❌ 老进程在响应，报错
  - macOS `etime` 格式兼容解析：`[[dd-]hh:]mm:ss`

- ✅ **T45.4** Status 命令增强
  - 显示 PID、端口、进程年龄、命令行（截断 80 字符）
  - 合并 pgrep + lsof 发现的 PID

- ✅ **T45.5** 文档更新 + Git 提交
  - REQUIREMENTS.md §三十七 Issue #51
  - ARCHITECTURE.md §8.6 restart.sh 描述更新
  - DEVLOG.md Phase 45 记录

### 验证结果

```
$ restart.sh status
=== nanobot Web Chat Services ===
Webserver: ✅ running (pid: 77066, port: 8081, age: 4572s)
         cmd: /opt/homebrew/.../Python webserver.py --daemonize
Worker: ✅ running (pid: 65784, port: 8082, age: 53671s)
         cmd: /opt/homebrew/.../Python worker.py
```

### 改动文件
- `restart.sh` — 进程发现鲁棒化 + stop 端口验证 + 健康检查年龄验证 + status 增强
- `docs/REQUIREMENTS.md` — §三十七 Issue #51
- `docs/ARCHITECTURE.md` — §8.6 restart.sh 描述更新（含旧名称 restart-gateway.sh 引用清理）
- `docs/DEVLOG.md` — Phase 45 记录

### Git
- web-chat commit: `9fe6b8b` (restart.sh 修复) + pending (文档补全)

---

## Phase 46.0: Session 重命名存储重构 — session_names.json (2026-03-08)

> 分支：`main`（与 Phase 46 同 commit `924c345`）

### 问题

Session 重命名后发消息，名称被恢复为原始标题。这是 Phase 13.1 修复过的问题的**再次复发**。

### 根因

Phase 13.1 的修复方案是同时将 `custom_name` 写入 JSONL metadata 的顶层和嵌套 `metadata` 字段。但 nanobot core 的 `session.save()` 仍然会在某些场景下重写整个 JSONL 文件，丢失非标准字段。

**核心矛盾**：webserver 和 nanobot core 共享同一个 JSONL 文件，两者的写入操作存在竞态条件。

### 解决方案

将 session 显示名称从 JSONL metadata 中**完全剥离**，改为独立文件存储：

- **新增文件**：`~/.nanobot/workspace/sessions/session_names.json`
  - 格式：`{ "session_id": "显示名称" }`
  - 由 webserver 独占读写，nanobot core 不感知
  - 原子写入（先写 `.tmp` 再 `os.replace`）

- **webserver.py 改动**：
  - 新增 `_read_session_names()` / `_write_session_names()` 辅助方法
  - `_handle_rename_session()`: 从修改 JSONL → 改为写 `session_names.json`
  - `_handle_get_sessions()`: 从 JSONL `custom_name` 读取 → 改为从 `session_names.json` 读取
  - `_handle_search_sessions()`: 同上
  - `_enrich_session_summaries()`: 同上
  - 所有 `custom_name` 引用已清除

- **数据迁移**：已将 3 个现有 JSONL 中的 `custom_name` 迁移到 `session_names.json`

### 设计理念

与 `session_parents.json`、`session_tags.json` 一致：UI 管理概念使用独立 JSON 文件，不侵入 JSONL 对话数据，彻底消除竞态。

### 改动文件
- `webserver.py` — session_names.json 读写 + 5 处 custom_name 引用替换

---

## Phase 46: Session Tag — done 标记与过滤 ✅

> 日期：2026-03-08
> 需求：REQUIREMENTS.md §三十八 Issue #52
> 架构：ARCHITECTURE.md §十七

### 概述

给 session 添加 tag 机制（MVP 只支持 `done`），支持在侧边栏标记已完成任务并过滤隐藏。

### 任务清单

- [x] **T46.1** 后端 — session_tags.json 读写 + API
  - webserver.py: `GET /api/sessions/tags` 读取 tags 映射
  - webserver.py: `PATCH /api/sessions/:id/tags` 更新单个 session tags
  - 文件不存在时返回 `{}`，写入时原子操作（先写 tmp 再 rename）
  - tags 为空数组时从 JSON 中删除该 key

- [x] **T46.2** 前端 Store — tagsMap + hideDone 状态
  - sessionStore.ts: 新增 `tagsMap`, `toggleDone()`, `hideDone`, `setHideDone()`
  - api.ts: 新增 `fetchSessionTags()`, `patchSessionTags()`
  - `fetchSessions()` 中 Promise.all 一并加载 tags

- [x] **T46.3** 前端 UI — ✓ 按钮 + ✅ 标识 + 过滤 toggle
  - SessionList.tsx: session item hover 显示 ✓ 按钮，点击 toggleDone
  - SessionList.tsx: 已 done session 显示 ✅ + opacity 降低
  - Sidebar 顶部: 新增 "隐藏已完成" toggle 按钮
  - Sidebar.module.css: 相关样式

- [x] **T46.4** 过滤逻辑 + 计数联动
  - hideDone=true 时排除 tagsMap[key] 含 "done" 的根 session
  - 搜索模式独立渲染（searchResults），天然不受 hideDone 影响
  - Channel 分组计数随过滤联动（filteredRoots → groups）
  - 子 session 展开列表中已 done 的仍显示（带 ✅ 标识 + opacity）

- [x] **T46.5** 测试验证 + Git 提交
  - 后端 API 验证：GET/PATCH tags 正常工作
  - 前端 TypeScript 编译 + Vite build 通过
  - Git commit
