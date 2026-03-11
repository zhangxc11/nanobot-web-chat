# 功能模块架构

> 本文件包含 web-chat 任务执行体验优化、Token 用量统计、斜杠命令、Provider 动态切换、Session Tag、Cache Usage 的架构设计。

## 本文件索引
| 章节 | 标题 |
|------|------|
| §十二 | 任务执行体验优化 (v2.1) |
| §十三 | Token 用量统计 — SQLite 独立存储 (v2.2) |
| §十五 | 斜杠命令系统 (v4.1) |
| §十六 | Provider 动态切换 (v4.3) |
| §十七 | Session Tag 功能 |
| §十八 | Cache Usage 字段与 SQLite Migration |
| §十九 | Subagent 可见性 — 实时运行状态 |

---

## 十二、任务执行体验优化 (v2.1)

### 12.1 问题总结

| # | 问题 | 根因 |
|---|------|------|
| 7 | 切换 session 时执行进度跟着切换 | `sending`/`progressSteps` 是全局状态，不绑定 session |
| 8 | 无法强制停止执行中的任务 | 前端未保存 AbortController，后端无 kill 接口 |
| 9 | 刷新页面后任务状态丢失 | 页面加载时不检查是否有正在运行的任务 |

### 12.2 设计方案

#### 12.2.1 任务状态绑定 Session (Issue #7)

**messageStore 改动**：
- 新增 `sendingSessionId: string | null` — 记录正在执行任务的 session
- `sending` 状态保留，但 ProgressIndicator 只在 `activeSessionId === sendingSessionId` 时显示
- 切换 session 时不清除 `sending`/`progressSteps`/`sendingSessionId`（任务仍在后台运行）
- ChatInput 在 `sending && activeSessionId !== sendingSessionId` 时也禁用发送（全局单任务锁）

**MessageList 改动**：
- ProgressIndicator 的渲染条件从 `sending` 改为 `sending && activeSessionId === sendingSessionId`
- 其他 session 显示 "有任务正在执行中" 的提示（在 ChatInput 区域）

#### 12.2.2 强制停止功能 (Issue #8)

**前端改动**：
- messageStore 新增 `abortController: AbortController | null` 和 `cancelTask()` 方法
- `sendMessage` 中保存 `sendMessageStream` 返回的 AbortController
- `cancelTask()` 调用 `abortController.abort()` + 调用后端 kill API + 重置状态
- ChatInput: 发送中时显示停止按钮（■ 图标），点击调用 `cancelTask()`

**后端改动**：
- Worker 新增 `POST /tasks/:session_key/kill` — 杀掉正在运行的 nanobot 子进程
- Gateway 新增 `POST /api/sessions/:id/task-kill` — 转发到 Worker

#### 12.2.3 页面刷新后恢复任务状态 (Issue #9)

**前端改动**：
- messageStore 新增 `checkRunningTask(sessionId)` 方法
- 页面加载时（`MessageList` 的 `useEffect`），调用 `GET /api/sessions/:id/task-status`
- 如果返回 `status: 'running'`：
  1. 设置 `sending=true`, `sendingSessionId=sessionId`
  2. 调用 Worker 的 `/execute-stream` 附加到已有任务的 SSE（Worker 已支持 attach）
  3. 通过 Gateway 新增的 `POST /api/sessions/:id/task-attach` 端点实现
  4. 恢复 ProgressIndicator 显示

**Worker 改动**：
- 新增 `POST /tasks/:session_key/attach` — 附加 SSE 客户端到已有运行任务
  - 返回已有 progress + 实时后续进度
  - 如果任务已完成，直接返回 done/error

**Gateway 改动**：
- 新增 `POST /api/sessions/:id/task-attach` — SSE 转发到 Worker `/tasks/:key/attach`

### 12.3 API 新增

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/tasks/:key/kill` (Worker) | 杀掉正在运行的 nanobot 子进程 |
| POST | `/tasks/:key/attach` (Worker) | 附加 SSE 到已有任务 |
| POST | `/api/sessions/:id/task-kill` (Gateway) | 转发 kill 请求 |
| POST | `/api/sessions/:id/task-attach` (Gateway) | SSE 转发 attach 请求 |

### 12.4 ChatInput 状态矩阵

| 场景 | 输入框 | 按钮 |
|------|--------|------|
| 空闲 | 可输入 | 发送（灰色） |
| 有文字 | 可输入 | 发送（高亮） |
| 当前 session 执行中 | 禁用 | ■ 停止（红色） |
| 其他 session 执行中 | 禁用 | 发送（灰色）+ 提示 |

---

## 十三、Token 用量统计 — SQLite 独立存储 (v2.2)

### 13.1 问题描述与设计演进

nanobot 的 LLM Provider 层返回 `usage` 数据（prompt_tokens, completion_tokens, total_tokens）。

**v2.2 初版**（已废弃）：在 nanobot 核心 `agent/loop.py` 中累计 usage，保存为 session JSONL 中的 `_type: "usage"` 记录，Gateway 遍历所有 JSONL 文件聚合查询。

**v2.2 初版的问题**：
1. **与 nanobot 上游不兼容** — `local` 分支的 `_save_usage` 改动增加了与 `main` 分支 merge 的难度
2. **查询效率差** — 统计"今天总用量"需遍历所有 JSONL 文件的每一行
3. **职责混乱** — session JSONL 是对话记录，usage 是运营数据，不应耦合
4. **扩展性弱** — 后续的"按天统计"、"费用计算"、"模型对比"等需求无法高效支持

**v2.2 新方案**：引入 SQLite 独立数据库，usage 数据由 Gateway 层写入。nanobot 核心仅累计 usage 并输出到 stderr，不写入 JSONL。

### 13.2 数据流设计（新方案）

```
LiteLLM Provider
  └─ LLMResponse.usage = { prompt_tokens, completion_tokens, total_tokens }
       │
Agent Loop (_run_agent_loop)
  └─ 每次 provider.chat() 后累计 usage（local 分支）
  └─ 循环结束后，将 usage JSON 输出到 stderr（标记 __usage__: true）
  └─ 不写入 session JSONL
       │
Worker (worker.py)
  └─ 在独立线程中读取 nanobot 子进程的 stderr
  └─ 解析包含 __usage__: true 的 JSON 行，提取 usage 数据
  └─ 通过 /execute-stream SSE done 事件返回 usage
       │
Gateway (gateway.py)
  └─ 收到 Worker 返回的 usage 数据后，写入 SQLite
  └─ GET /api/usage — 从 SQLite 查询，毫秒级响应
       │
Frontend
  └─ Sidebar 底部 UsageIndicator（全局用量）
  └─ 未来：当前 session 用量 + 独立的 Usage 分析页面
```

### 13.3 SQLite 数据库设计

**文件位置**：`~/.nanobot/workspace/analytics.db`（生产）
**测试数据库**：`~/.nanobot/workspace/web-chat/tests/test_analytics.db`（测试，自动创建/销毁）

#### Schema

```sql
-- Token 用量表
-- 每条记录对应一次用户消息的完整处理（一次 _process_message 调用）
-- 一次处理中可能有多轮 LLM 调用（因工具调用循环），llm_calls 记录总次数
CREATE TABLE token_usage (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,

    -- 归属
    session_key       TEXT NOT NULL,          -- "cli:direct", "webchat:1772030778"

    -- 用量数据
    model             TEXT NOT NULL,          -- "claude-opus-4-6"
    prompt_tokens     INTEGER DEFAULT 0,      -- 输入 tokens（累计）
    completion_tokens INTEGER DEFAULT 0,      -- 输出 tokens（累计）
    total_tokens      INTEGER DEFAULT 0,      -- 总 tokens（累计）
    llm_calls         INTEGER DEFAULT 0,      -- 本次交互的 LLM 调用次数

    -- 时间区间（用于与 JSONL 消息按时间匹配）
    started_at        TEXT NOT NULL,          -- agent loop 开始时间 (ISO 8601)
    finished_at       TEXT NOT NULL           -- agent loop 结束时间 (ISO 8601)
);

-- 索引
CREATE INDEX idx_usage_session    ON token_usage(session_key);
CREATE INDEX idx_usage_started    ON token_usage(started_at);
CREATE INDEX idx_usage_finished   ON token_usage(finished_at);
CREATE INDEX idx_usage_model      ON token_usage(model);
```

#### 数据来源

Usage 数据**不再**存储在 session JSONL 中。数据流：

```
nanobot stderr JSON → Worker 解析 → SSE done 事件 → Gateway → SQLite
```

Worker 从 nanobot 子进程的 stderr 中解析 `__usage__: true` JSON 行，字段映射：

```
stderr JSON 字段                    SQLite 列            说明
─────────────────────────────────   ──────────────────   ──────────────
(Worker 补充 session_key)            session_key          Worker 传入
"model": "claude-opus-4-6"         model                直接映射
"prompt_tokens": 334191            prompt_tokens        直接映射
"completion_tokens": 4075          completion_tokens    直接映射
"total_tokens": 338266             total_tokens         直接映射
"llm_calls": 18                    llm_calls            直接映射
"started_at": "2026-02-26T..."     started_at           agent loop 开始时间
"finished_at": "2026-02-26T..."    finished_at          agent loop 结束时间
(自增)                              id                   自增主键
```

### 13.4 nanobot 核心改动

**目标**：在 `_run_agent_loop` 中累计 usage，循环结束后输出到 stderr（JSON 行，标记 `__usage__: true`）。不写入 session JSONL。

**agent/loop.py 改动（local 分支）**：
```python
# _run_agent_loop: 累计 usage，循环结束后输出到 stderr
async def _run_agent_loop(self, ...):
    from datetime import datetime
    loop_started_at = datetime.now().isoformat()
    accumulated_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "llm_calls": 0}
    # ... 每次 provider.chat() 后累计 usage ...
    
    # 循环结束后，输出 usage JSON 到 stderr（供 worker 解析）
    if accumulated_usage["llm_calls"] > 0:
        usage_record = {"__usage__": True, "model": self.model, ...}
        print(json.dumps(usage_record), file=sys.stderr)
    
    return final_content, tools_used, messages  # 不再返回 usage

# _save_usage 已移除 — 不再写入 session JSONL
```

**关键设计**：
- usage 通过 stderr JSON 行传递（标记 `__usage__: true`），不污染 session JSONL
- Worker 在独立线程中读取 stderr，解析 usage JSON
- `add_assistant_message` bug fix 保留（确保最终回复写入 JSONL）

### 13.5 Gateway 层 — analytics 模块

新增 `analytics.py` 模块，封装 SQLite 操作：

```python
# analytics.py — Token 用量数据库管理

import sqlite3
import os

DEFAULT_DB_PATH = os.path.expanduser("~/.nanobot/workspace/analytics.db")

class AnalyticsDB:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        self._ensure_schema()

    def _ensure_schema(self):
        """创建表和索引（如果不存在）。"""
        ...

    def record_usage(self, session_key, model, prompt_tokens,
                     completion_tokens, total_tokens, llm_calls,
                     started_at, finished_at):
        """写入一条 usage 记录。"""
        ...

    def get_global_usage(self) -> dict:
        """全局汇总：总计 + 按模型 + 按 session。"""
        ...

    def get_session_usage(self, session_key: str) -> dict:
        """单个 session 的 usage 汇总。"""
        ...

    def get_daily_usage(self, days: int = 30) -> list:
        """按天统计最近 N 天的用量。"""
        ...

    def migrate_from_jsonl(self, sessions_dir: str):
        """从现有 JSONL 文件迁移 _type: "usage" 记录到 SQLite。"""
        ...
```

### 13.6 Gateway API

| 方法 | 路径 | 说明 | 数据源 |
|------|------|------|--------|
| GET | `/api/usage` | 全局 usage 汇总 | SQLite |
| GET | `/api/usage?session=<key>` | 单 session usage | SQLite |
| GET | `/api/usage/daily?days=30` | 按天统计 | SQLite |
| POST | `/api/usage/migrate` | 从 JSONL 迁移数据到 SQLite | JSONL → SQLite |

**GET /api/usage 响应格式**（与前端现有 `UsageStats` 类型兼容）：
```json
{
  "total_prompt_tokens": 1234567,
  "total_completion_tokens": 234567,
  "total_tokens": 1469134,
  "total_llm_calls": 456,
  "by_model": {
    "claude-opus-4-6": {
      "prompt_tokens": 800000,
      "completion_tokens": 150000,
      "total_tokens": 950000,
      "llm_calls": 300
    }
  },
  "by_session": [
    {
      "session_id": "webchat_xxx",
      "summary": "对话名称",
      "total_tokens": 50000,
      "prompt_tokens": 30000,
      "completion_tokens": 20000,
      "llm_calls": 10,
      "last_used": "2026-02-26T14:30:00"
    }
  ]
}
```

### 13.7 数据写入时机

Gateway 在以下时机将 usage 写入 SQLite：

1. **实时写入**（推荐）：Worker 的 `/execute-stream` SSE `done` 事件中携带 usage 数据，Gateway 收到后立即写入
2. **补偿写入**：Gateway 启动时，扫描 JSONL 中的 `_type: "usage"` 记录，将 SQLite 中缺失的记录补入

**Worker SSE done 事件扩展**：
```
event: done
data: {"usage": {"model": "claude-opus-4-6", "prompt_tokens": 1234, "completion_tokens": 567, "total_tokens": 1801, "llm_calls": 3, "started_at": "...", "finished_at": "..."}}
```

### 13.8 数据迁移

一次性迁移脚本，将现有 JSONL 中的 `_type: "usage"` 记录导入 SQLite：

```python
def migrate_from_jsonl(self, sessions_dir):
    """遍历所有 session JSONL，提取 _type: usage 记录，写入 SQLite。"""
    for filepath in glob.glob(os.path.join(sessions_dir, '*.jsonl')):
        session_filename = os.path.basename(filepath).replace('.jsonl', '')
        # 文件名转 session_key: cli_direct → cli:direct, webchat_xxx → webchat:xxx
        session_key = session_filename.replace('_', ':', 1)
        with open(filepath) as f:
            for line in f:
                obj = json.loads(line)
                if obj.get('_type') == 'usage':
                    self.record_usage(
                        session_key=session_key,
                        model=obj['model'],
                        prompt_tokens=obj.get('prompt_tokens', 0),
                        completion_tokens=obj.get('completion_tokens', 0),
                        total_tokens=obj.get('total_tokens', 0),
                        llm_calls=obj.get('llm_calls', 0),
                        # 旧记录只有 timestamp，没有 started_at
                        started_at=obj.get('started_at', obj['timestamp']),
                        finished_at=obj.get('finished_at', obj['timestamp']),
                    )
```

### 13.9 前端展示

**当前实现**：Sidebar 底部 `UsageIndicator` 组件，调用 `GET /api/usage`，显示**全局**用量。

**改进计划**：
- Sidebar 底部显示**当前 session** 的用量（`GET /api/usage?session=<key>`）
- 点击展开后显示全局汇总 + 按模型分布
- 未来：独立的 Usage 分析页面（按天趋势图、费用估算等）

### 13.10 测试策略

**测试文件**：`tests/test_analytics.py`

**测试数据库隔离**：
- 测试使用独立的 SQLite 文件（`tests/test_analytics.db`），每个测试用例前创建、后销毁
- 也可使用 `:memory:` 内存数据库加速测试
- 生产数据库路径通过 `AnalyticsDB(db_path=...)` 参数注入，测试时传入测试路径

**测试用例**：
1. **Schema 创建**：验证表和索引正确创建
2. **record_usage**：写入记录，验证字段完整性
3. **get_global_usage**：多条记录聚合，验证总计、按模型、按 session 分组
4. **get_session_usage**：单 session 过滤
5. **get_daily_usage**：按天聚合，验证日期分组和排序
6. **migrate_from_jsonl**：从测试 JSONL 文件迁移，验证记录数和字段映射
7. **幂等迁移**：重复迁移不产生重复记录
8. **空数据库查询**：无记录时返回零值，不报错
9. **并发写入**：模拟多线程写入，验证 SQLite WAL 模式下无锁冲突

**测试文档**：`tests/README.md` 记录测试结构、运行方式、注意事项

### 13.11 实施计划

| 步骤 | 任务 | 说明 |
|------|------|------|
| T13.1 | 创建 `analytics.py` + Schema | AnalyticsDB 类，表创建，基本 CRUD |
| T13.2 | 编写 `tests/test_analytics.py` | 完整测试用例，验证所有查询方法 |
| T13.3 | nanobot 核心：`_save_usage` 增加 `started_at` | `_run_agent_loop` 记录开始时间 |
| T13.4 | 数据迁移：`migrate_from_jsonl` | 从现有 JSONL 导入历史 usage 数据 |
| T13.5 | Gateway 集成：`_handle_get_usage` 改用 SQLite | 替换原有的 JSONL 遍历逻辑 |
| T13.6 | Worker SSE done 事件携带 usage | Gateway 收到后实时写入 SQLite |
| T13.7 | 前端：UsageIndicator 支持当前 session 用量 | 可选，后续迭代 |
| T13.8 | 测试文档 `tests/README.md` | 记录测试结构和运行方式 |

---

## 十四、架构演进规划 — SDK 化 + 实时持久化 + 统一 Token (v3.0)

> 详细技术设计见 nanobot 核心仓库 `docs/ARCHITECTURE.md` §二。
> 对应需求: REQUIREMENTS.md §十五(#20)、§十六(#21)、§十七(#22)

### 14.1 演进方向

当前 Worker 通过 CLI 子进程调用 nanobot，存在信息传递不便、解析脆弱、资源浪费等问题。计划分三阶段改造：

```
Phase 1 (nanobot 核心):
  Session 实时持久化 — 每条消息立即追加到 JSONL
  → web-chat 无需改动，自动受益

Phase 2 (nanobot 核心 + web-chat gateway):
  统一 Token 记录 — 核心层直接写入 SQLite
  → gateway.py 移除 usage 写入逻辑
  → analytics.py schema 迁移到 nanobot 核心

Phase 3 (nanobot 核心 + web-chat worker):
  SDK 化 — Worker 进程内调用 AgentRunner
  → worker.py 从 subprocess 改为 SDK 调用
  → 结构化回调替代 stdout/stderr 解析
```

### 14.2 对 web-chat 的影响

| 组件 | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|
| gateway.py | 无变化 | 移除 usage 写入 | 无变化 |
| worker.py | 无变化 | stderr 解析可简化 | **重写**（SDK 调用） |
| analytics.py | 无变化 | 可能移除（迁移到核心） | — |
| 前端 | 无变化 | 无变化 | SSE 数据源变更 |

### 14.3 Worker 改造后的架构

```
改造前:
  Gateway ──HTTP──→ Worker ──subprocess──→ nanobot CLI
                     │                        │
                     ├─ stdout 解析 progress   ├─ stderr JSON → usage
                     └─ SSE 推送               └─ JSONL 写入

改造后:
  Gateway ──HTTP──→ Worker ──SDK──→ AgentRunner (进程内)
                     │                  │
                     ├─ callbacks        ├─ on_progress → SSE
                     │  (结构化)         ├─ on_message → 实时 JSONL
                     │                  ├─ on_usage → SQLite
                     └─ SSE 推送        └─ on_done → SSE done
```

---

## 十五、斜杠命令系统 (v4.1)

### 15.1 命令架构

Web UI 的斜杠命令分为两层处理：

```
用户输入 /xxx
  │
  ├─ 前端本地命令（不消耗 token）
  │   ├─ /help  → 显示命令列表（system-local 消息）
  │   ├─ /stop  → 中断运行中的任务（调用 cancelTask）
  │   └─ /xxx   → 未知命令提示
  │
  └─ 后端命令（发送到 agent loop）
      └─ /new   → 归档 session 历史，清空对话
```

### 15.2 前端实现

**命令拦截位置**：`messageStore.sendMessage()` 中，在 `task.sending` 检查之前。

**关键设计**：
- 斜杠命令在 `task.sending` 检查之前拦截，确保 `/help` 和 `/stop` 在任务执行中也能使用
- `/stop` 在 ChatInput 层也有拦截（处理 inject 模式下的 `/stop`）
- `/new` 在任务执行中会提示先停止任务
- 系统消息使用 `system-local` role，不持久化到 JSONL

**系统消息类型**：`Message.role = 'system-local'`
- 居中显示，灰色背景圆角
- 不参与 assistant turn 分组
- 不参与工具调用折叠

---

## 十六、Provider 动态切换 (v4.3)

> 依赖：nanobot 核心 ProviderPool（nanobot 核心仓库 `docs/ARCHITECTURE.md §七`）

### 16.1 架构概览

```
前端 Provider 选择器 / /provider 命令
  │
  ▼
webserver.py (:8081)
  GET/PUT /api/provider → 转发
  │
  ▼
worker.py (:8082)
  GET/PUT /provider → 操作 ProviderPool 单例
  │
  ▼
ProviderPool (模块级单例)
  ├── active_provider / active_model → 运行时状态
  └── providers: { name → (LLMProvider, default_model) }
```

### 16.2 Worker ProviderPool 单例

Worker 维护模块级 ProviderPool 单例，所有任务共享同一个 Pool 的 active 状态：

```python
_provider_pool = None  # 模块级单例
_pool_lock = threading.Lock()

def _get_pool():
    """获取或创建 ProviderPool 单例。"""
    # 使用 nanobot 核心的 _make_provider(config) 构建
    ...

def _create_runner():
    """创建 AgentRunner，将 Pool 作为 provider 传入。"""
    pool = _get_pool()
    # AgentLoop 接收 pool 作为 provider，无感知切换
    agent_loop = AgentLoop(provider=pool, model=pool.active_model, ...)
    return AgentRunner(agent_loop)
```

### 16.3 Worker API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/provider` | 返回 `{ active: {provider, model}, available: [{name, model}] }` |
| PUT | `/provider` | 切换 `{ provider, model? }`。任务执行中返回 409 |

PUT 的保护逻辑：
```python
def _handle_set_provider(self):
    if _has_running_tasks():
        return 409, {"error": "Task running, cannot switch provider"}
    pool.switch(provider_name, model)
    return 200, {"active": {"provider": ..., "model": ...}}
```

### 16.4 Webserver 转发

| 前端路径 | Worker 路径 | 方法 |
|---------|------------|------|
| `/api/provider` | `/provider` | GET |
| `/api/provider` | `/provider` | PUT |

### 16.5 前端组件架构

```
ChatInput
  ├── ProviderSelector (新增)
  │   ├── ProviderButton (显示当前 active)
  │   └── ProviderDropdown (展开可选列表)
  └── InputWrapper (现有)
      ├── TextArea
      └── SendButton

store/providerStore.ts (新增)
  ├── active: { provider, model }
  ├── available: [{ name, model }]
  ├── fetchProvider()
  └── switchProvider(name, model?)
```

### 16.6 /provider 斜杠命令

前端本地拦截（不发送到后端），通过 API 调用 Worker：

```
/provider        → GET /api/provider → 显示 system-local 消息
/provider <name> → PUT /api/provider → 切换 + 显示结果
```

任务执行中：本地提示 "⚠️ 任务执行中，无法切换 provider"。

---

## 十七、Session Tag 功能

### 17.1 数据存储

```
~/.nanobot/workspace/sessions/
├── session_names.json      # 已有：自定义显示名称映射 { "session_id": "显示名称" }
├── session_parents.json    # 已有：父子关系映射
├── session_tags.json       # 新增：tag 映射
│   格式: { "session_key": ["done"], ... }
└── *.jsonl                 # session 对话数据（不修改）
```

设计理由：Tag、名称、父子关系都是 UI 管理概念，不属于对话内容，使用独立 JSON 文件避免与 nanobot `session.save()` 竞态。

### 17.2 后端 API

#### GET /api/sessions/tags
- 读取 `session_tags.json`，返回完整映射
- 文件不存在时返回 `{}`

#### PATCH /api/sessions/:id/tags
- `:id` 为 URL-encoded 的 session filename（与现有 rename/delete 一致）
- 请求体：`{ "add": ["done"] }` 和/或 `{ "remove": ["done"] }`
- 从文件名解析 session_key，更新 `session_tags.json` 中对应条目
- 返回：`{ "tags": ["done"] }`
- tags 为空数组时从 JSON 中删除该 key

### 17.3 前端状态管理

```
store/sessionStore.ts 扩展:
  tagsMap: Record<string, string[]>   // session_key → tags
  fetchTags()                         // GET /api/sessions/tags
  toggleDone(session)                 // PATCH → 本地更新 tagsMap
  hideDone: boolean                   // 过滤开关，默认 true
  setHideDone(v)
```

`fetchTags()` 在 `fetchSessions()` 中一并调用。

### 17.4 前端组件变更

```
SessionList.tsx:
  ├── 过滤逻辑：hideDone=true 时排除 tagsMap[key] 含 "done" 的根 session
  ├── SessionItem hover → 显示 ✓ 按钮（done toggle）
  ├── 已 done session：✅ 图标 + opacity 降低
  └── Channel 分组计数：过滤后重新计数

Sidebar 顶部:
  └── "隐藏已完成" toggle 按钮（搜索框附近）
```

### 17.5 交互规则

| 场景 | 行为 |
|------|------|
| 父 session 标记 done | 子 session 不受影响（独立） |
| 子 session 标记 done | 父 session 不受影响 |
| 搜索模式 | 忽略 hideDone 过滤，显示所有匹配结果 |
| 子 session 展开列表 | 已 done 子 session 仍显示（带 ✅） |
| 过滤 toggle 切换 | 即时生效，无需刷新 |

---

## 十八、Cache Usage 字段与 SQLite Migration (§三十九附)

### 18.1 Schema 变更

`token_usage` 表新增两列：

```sql
cache_creation_input_tokens INTEGER DEFAULT 0
cache_read_input_tokens     INTEGER DEFAULT 0
```

### 18.2 Migration 策略

与 nanobot core 的 `UsageRecorder._migrate()` 相同策略：

```python
_MIGRATION_SQL = [
    "ALTER TABLE token_usage ADD COLUMN cache_creation_input_tokens INTEGER DEFAULT 0",
    "ALTER TABLE token_usage ADD COLUMN cache_read_input_tokens INTEGER DEFAULT 0",
]

@staticmethod
def _migrate(conn):
    existing = {row[1] for row in conn.execute("PRAGMA table_info(token_usage)")}
    for sql in _MIGRATION_SQL:
        col_name = sql.split("ADD COLUMN")[1].strip().split()[0]
        if col_name not in existing:
            try:
                conn.execute(sql)
            except sqlite3.OperationalError:
                pass  # 并发竞争兜底
```

三种部署场景：
| 场景 | 行为 |
|------|------|
| 全新部署 | `CREATE TABLE` 已含 cache 列，`_migrate()` 检测到列已存在，跳过 |
| 旧数据库升级 | `_migrate()` 检测到列缺失，`ALTER TABLE ADD COLUMN`，旧行默认 0 |
| 重复执行 | 幂等，不报错 |

### 18.3 数据流

```
nanobot core agent/loop.py
  └─ UsageRecorder.record() → 直接写入 analytics.db（含 cache 字段）

worker.py on_usage() callback
  └─ 透传 cache 字段 → SSE event → 前端实时显示

webserver.py _try_record_usage()
  └─ NO-OP（usage 由 core 直接写入，避免重复）

前端读取路径：
  GET /api/usage → AnalyticsDB.get_global_usage() → 含 cache 聚合
  GET /api/sessions/:id/usage → AnalyticsDB.get_session_usage() → 含 cache 明细
```

### 18.4 前端展示

| 组件 | 展示内容 |
|------|----------|
| UsageIndicator（折叠） | 上下文长度 = prompt_tokens |
| UsageIndicator（展开） | cache_creation / cache_read 明细 |
| UsagePage | cache 汇总卡片（总创建 / 总读取） |
| MessageItem | 工具调用摘要中显示 cache hit/creation |

---

## 十九、Subagent 可见性 — 实时运行状态 (v5.7)

### 19.1 架构概览

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│                                                      │
│  useRunningSessions (10s poll)                        │
│    └─ GET /api/sessions/running                      │
│    └─ 返回 Set<sessionKey>                           │
│    └─ 变化时触发 fetchSessions() 刷新列表             │
│                                                      │
│  useSubagentStatus (5s poll, 仅运行中时激活)           │
│    └─ GET /api/subagents/<parentKey>                 │
│    └─ 返回 Map<parentKey, SubagentInfo[]>            │
│                                                      │
│  SessionList                                         │
│    └─ runningKeys → 绿色脉冲点                       │
│    └─ subagentMap → ⚙️ 5/30 · tool_name 进度        │
└───────────────┬─────────────────┬────────────────────┘
                │                 │
          ┌─────▼─────┐   ┌──────▼──────┐
          │ Webserver  │   │ Webserver   │
          │ proxy GET  │   │ proxy GET   │
          │ /sessions/ │   │ /subagents/ │
          │ running    │   │ <parent>    │
          └─────┬──────┘   └──────┬──────┘
                │                 │
          ┌─────▼─────────────────▼──────┐
          │          Worker              │
          │                              │
          │  WorkerSubagentCallback      │
          │    ._registry: Dict          │
          │    .get_all_running_keys()   │
          │    .get_subagents_for()      │
          │                              │
          │  SubagentManager             │
          │    .event_callback = ↑       │
          └──────────────────────────────┘
```

### 19.2 后端数据流

**WorkerSubagentCallback** 实现 `SubagentEventCallback` 协议，维护 `_registry` 字典：

| 事件 | 回调方法 | registry 操作 |
|------|----------|---------------|
| subagent 启动 | `on_spawned()` | 注册 entry（task_id, label, parent_key, status=running） |
| 迭代进度 | `on_progress()` | 更新 current_iteration, last_tool_name |
| 重试 | `on_retry()` | 更新 retry_count |
| 完成/失败 | `on_done()` | 设置 status=done/error, finished_at |

**HTTP 端点**:
- `GET /sessions/running` — 合并 regular tasks（worker._running_tasks）+ subagent tasks → 去重返回所有运行中 session key
- `GET /subagents/<parent_key>` — 从 registry 过滤指定 parent 的 subagent 列表

### 19.3 前端轮询策略

**引用稳定性设计**（§五十 修复后）:

| Hook | 轮询间隔 | 更新策略 |
|------|----------|----------|
| `useRunningSessions` | 10s | 对比新旧 Set 内容（排序后 join），仅变化时 setState |
| `useSubagentStatus` | 5s | `mapsEqual()` JSON 序列化深比较，仅变化时 setState |

**fetchSessions() 静默刷新**:
- 首次加载（sessions 为空）：设 `loading: true`，显示加载状态
- 后台刷新（已有数据）：直接更新 sessions 数组，不设 loading，UI 无闪烁

### 19.4 前端组件集成

```
SessionList
  ├─ useRunningSessions() → runningKeys: Set<string>
  ├─ useSubagentStatus(runningKeys) → subagentMap: Map<string, SubagentInfo[]>
  │
  ├─ SessionGroup
  │   └─ SessionItem
  │       ├─ runningKeys.has(key) → <span class="runningIndicator" />  (8px 脉冲绿点)
  │       └─ ChildrenPanel
  │           └─ ChildItem
  │               ├─ runningKeys.has(key) → <span class="runningIndicatorSmall" />  (6px)
  │               └─ subagentMap.get(key) → <div class="subagentStatus">⚙️ 5/30 · read_file</div>
```

### 19.5 CSS 动画

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.runningIndicator { animation: pulse 2s ease-in-out infinite; }
```

---

*本文档将随开发进展持续更新。*
