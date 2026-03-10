# Phase 15-29 归档

## 本文件索引
| Phase | 标题 | 状态 |
|-------|------|------|
| 17 | 任务执行体验优化 (Issue #7/#8/#9) | ✅ |
| 18 | Token 用量统计 (Issue #10) | ✅ |
| 19 | Token 用量 — SQLite 独立存储 (Issue #10 续) | ✅ |
| 20 | Usage 数据流重构 — 移除 JSONL 依赖 | ✅ |
| 21 | 用量统计增强 — Session 用量 + 全局看板 | ✅ |
| 22 | Backlog 1-5 修复 | ✅ |
| 23 | exec 工具 PIPE 卡死修复 + Usage 刷新 | ✅ |
| 24 | nanobot SDK 化 + 实时持久化 + 统一 Token 记录 | ✅ |
| — | Bug Fix: Session 数据写入错误路径 | ✅ |
| 25 | 执行过程展示完整性优化 (Issue #24) | ✅ |
| 26 | 工具调用间隙用户消息注入 (Issue #25) | ✅ |
| 27 | Worker 并发任务支持 (Issue #26) | ✅ |
| 28 | 用量统计增强 + 工具调用用量展示 (Issue #27/#28) | ✅ |
| 29 | Session 管理增强 — 文件名显示 + 删除 + 标题优化 (Issue #29/#30/#31) | ✅ |
| 29 | Web UI 自修改安全实践 (Issue #32 / Backlog #14) | ✅ |

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
