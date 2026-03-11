# Subagent 可见性 & Session List 精准刷新 — 设计文档

## 一、问题分析

### 1.1 Session List 刷新
- `fetchSessions()` 需要遍历 `~/.nanobot/workspace/sessions/*.jsonl` 所有文件，提取 metadata
- 当前 100+ session，每次调用都是 O(n) 文件 I/O
- 目前仅在页面加载和 `_reloadMessages` 后触发，**没有定时轮询**
- 缺失的场景：spawn 创建新 subagent session 时，列表不会更新

### 1.2 Subagent 状态感知
- Subagent 在 `SubagentManager._run_subagent()` 中以 asyncio.Task 运行
- **不经过 worker 的 `_tasks` 注册**，所以 `GET /tasks/<subagent_key>` 返回 `unknown`
- 前端无法知道 subagent 是否在执行、执行到哪一步、是否遇到异常
- 核心缺失：nanobot core → worker 没有回调通知链路

### 1.3 异常信息
- LLM 超时等异常在 `_chat_with_retry` 中重试 3 次后抛出
- 异常被 `_run_subagent` 的 `except Exception` 捕获，更新 `SubagentMeta.status = "failed"`
- 但 worker 和前端对此一无所知

---

## 二、方案设计

### 核心思路
**建立 nanobot core → worker → 前端 的回调通知链路**

```
SubagentManager._run_subagent()
  ↓ (SubagentEventCallback)
Worker 模块级 _subagent_registry
  ↓ (SSE push to parent session / HTTP API)
Frontend
```

---

### 2.1 nanobot core: SubagentEventCallback 协议

在 `subagent.py` 中定义回调协议，让 SubagentManager 在关键节点通知外部：

```python
# nanobot/agent/subagent.py

class SubagentEventCallback(Protocol):
    """Protocol for receiving subagent lifecycle events.
    
    Worker 实现此协议，接收 subagent 状态变化通知。
    所有方法都是同步的（在 asyncio 线程中调用，但不需要 await）。
    """
    
    def on_subagent_spawned(self, meta: SubagentMeta) -> None:
        """Subagent 创建并开始执行。"""
        ...
    
    def on_subagent_progress(self, task_id: str, iteration: int, 
                              max_iterations: int, last_tool: str | None) -> None:
        """Subagent 完成一轮工具调用（每个 iteration 触发一次）。"""
        ...
    
    def on_subagent_retry(self, task_id: str, attempt: int, max_retries: int,
                           delay: float, error: str, is_fast: bool) -> None:
        """Subagent LLM 调用遇到可重试错误，正在等待重试。
        
        对应 AgentLoop._chat_with_retry 中已有的 progress_fn 机制。
        SubagentManager 的 _chat_with_retry 目前只有 logger.warning，
        通过此回调让 worker 知晓重试状态，进而通知前端。
        
        Parameters:
            task_id: subagent 任务 ID
            attempt: 当前重试次数 (1-based)
            max_retries: 最大重试次数
            delay: 等待秒数
            error: 错误信息摘要
            is_fast: True=网络断连/超时(快速重试), False=限流/过载(慢速重试)
        """
        ...
    
    def on_subagent_done(self, task_id: str, status: str, 
                          error: str | None = None) -> None:
        """Subagent 执行结束（completed/failed/max_iterations/stopped）。"""
        ...
```

**SubagentManager 构造函数新增参数**：

```python
class SubagentManager:
    def __init__(self, ..., event_callback: SubagentEventCallback | None = None):
        self._event_callback = event_callback
```

**在 `_run_subagent` 中的 4 个关键节点触发回调**：

1. **spawned**: `spawn()` 方法中，`asyncio.create_task` 之后
2. **progress**: 每次 iteration 开始时（已有 `current_iteration` 更新的位置）
3. **retry**: `_chat_with_retry` 中 `asyncio.sleep(delay)` 之前（参照 AgentLoop 的 `progress_fn` 模式）
4. **done**: `_run_subagent` 的 `finally` 或各个 `except` 分支中

**`_chat_with_retry` 改造**（关键新增）：

```python
async def _chat_with_retry(self, messages, tools, *, task_id: str | None = None):
    """..."""
    for attempt in range(_MAX_RETRIES + 1):
        try:
            ...
            return await self.provider.chat(**kwargs)
        except Exception as e:
            if attempt < _MAX_RETRIES and _is_retryable(e):
                fast = is_fast_retryable(e)
                delay = compute_retry_delay(attempt, fast)
                logger.warning(...)
                # ★ 新增：通过回调通知 worker
                if self._event_callback and task_id:
                    try:
                        self._event_callback.on_subagent_retry(
                            task_id=task_id,
                            attempt=attempt + 1,
                            max_retries=_MAX_RETRIES,
                            delay=delay,
                            error=str(e)[:200],
                            is_fast=fast,
                        )
                    except Exception:
                        pass  # best-effort
                await asyncio.sleep(delay)
                last_error = e
            else:
                raise
```

> **设计说明**：`_chat_with_retry` 需要新增 `task_id` 参数，由 `_run_subagent` 调用时传入。
> 这与 AgentLoop 的 `progress_fn` 模式对称——AgentLoop 通过 `progress_fn` 回调通知 worker，
> SubagentManager 通过 `event_callback.on_subagent_retry` 回调通知 worker。

---

### 2.2 Worker: 实现回调 + 维护 subagent 注册表

```python
# worker.py

# 模块级 subagent 注册表
_subagent_registry: dict[str, dict] = {}  # task_id -> status info
_subagent_registry_lock = threading.Lock()

class WorkerSubagentCallback:
    """实现 SubagentEventCallback，桥接到 worker 的 SSE 和注册表。"""
    
    def on_subagent_spawned(self, meta: SubagentMeta) -> None:
        with _subagent_registry_lock:
            _subagent_registry[meta.task_id] = {
                'task_id': meta.task_id,
                'session_key': meta.subagent_session_key,
                'parent_session_key': meta.parent_session_key,
                'label': meta.label,
                'status': 'running',
                'iteration': 0,
                'max_iterations': meta.max_iterations,
                'last_tool': None,
                'created_at': meta.created_at,
                'finished_at': None,
                'error': None,
            }
        # 通知父 session 的 SSE 客户端
        self._notify_parent(meta.parent_session_key, 'subagent_spawned', {
            'task_id': meta.task_id,
            'session_key': meta.subagent_session_key,
            'label': meta.label,
        })
    
    def on_subagent_progress(self, task_id, iteration, max_iterations, last_tool):
        with _subagent_registry_lock:
            entry = _subagent_registry.get(task_id)
            if entry:
                entry['iteration'] = iteration
                entry['max_iterations'] = max_iterations
                entry['last_tool'] = last_tool
        # 不需要每次 progress 都 SSE push（前端按需轮询即可）
    
    def on_subagent_retry(self, task_id, attempt, max_retries, delay, error, is_fast):
        """LLM 重试中 — push SSE 事件让前端实时显示。"""
        parent_key = None
        with _subagent_registry_lock:
            entry = _subagent_registry.get(task_id)
            if entry:
                label = "网络断连" if is_fast else "API 限流"
                entry['retry_info'] = {
                    'attempt': attempt,
                    'max_retries': max_retries,
                    'delay': delay,
                    'label': label,
                    'error': error[:100],
                }
                parent_key = entry.get('parent_session_key')
        if parent_key:
            self._notify_parent(parent_key, 'subagent_retry', {
                'task_id': task_id,
                'attempt': attempt,
                'max_retries': max_retries,
                'delay': delay,
                'label': "网络断连" if is_fast else "API 限流",
                'error': error[:100],
            })
    
    def on_subagent_done(self, task_id, status, error=None):
        parent_key = None
        with _subagent_registry_lock:
            entry = _subagent_registry.get(task_id)
            if entry:
                entry['status'] = status
                entry['finished_at'] = datetime.now().isoformat()
                entry['error'] = error
                parent_key = entry.get('parent_session_key')
        # 通知父 session
        if parent_key:
            self._notify_parent(parent_key, 'subagent_done', {
                'task_id': task_id,
                'status': status,
                'error': error,
            })
    
    def _notify_parent(self, parent_session_key, event, data):
        """向父 session 的 SSE 客户端发送事件。"""
        if not parent_session_key:
            return
        with _tasks_lock:
            task = _tasks.get(parent_session_key)
        if task:
            _notify_sse(task, event, data)
```

**注册到 SubagentManager**：

```python
_subagent_manager = SubagentManager(
    ...,
    event_callback=WorkerSubagentCallback(),
)
```

**新增 HTTP API**：

```
GET /subagents/<parent_session_key>
```

返回该父 session 下所有 subagent 的状态：

```json
{
  "subagents": [
    {
      "task_id": "abc123",
      "session_key": "subagent:webchat_xxx_abc123",
      "label": "分析代码",
      "status": "running",
      "iteration": 15,
      "max_iterations": 40,
      "last_tool": "read_file",
      "created_at": "...",
      "finished_at": null,
      "error": null
    }
  ]
}
```

---

### 2.3 前端: SSE 事件驱动 + 按需查询

#### Session List 精准刷新（方案 A + B）

**A. SSE spawn 事件触发**：

在 `sendMessage` 的 `onProgress` 回调中，检测 spawn 工具调用：

```typescript
onProgress: (step) => {
  // ... existing progress handling ...
  
  // 检测 spawn 工具结果 → 触发 session list 刷新
  if (step.type === 'tool_result' && step.name === 'spawn') {
    useSessionStore.getState().fetchSessions();
  }
},
```

**B. Subagent 结果回传触发**：

检测 `system_inject` 类型（subagent 完成后向父 session 注入结果）：

```typescript
if (step.type === 'system_inject') {
  useSessionStore.getState().fetchSessions();
}
```

#### Subagent 状态显示

**方案：SSE push 关键事件 + 按需 HTTP 查询**

1. **父 session SSE 流**中新增三种事件：
   - `subagent_spawned`: 新 subagent 创建
   - `subagent_retry`: subagent LLM 调用重试中（含重试次数、等待时间、错误类型）
   - `subagent_done`: subagent 完成/失败

2. **前端收到 `subagent_spawned` 时**：
   - 刷新 session list
   - 如果当前查看的是该 subagent session，标记为"执行中"

3. **前端收到 `subagent_retry` 时**：
   - 在父 session 的 progress steps 中显示：`⏳ [子任务名] 网络断连，等待 8s 后重试 (2/3)`
   - 如果用户正在查看该 subagent session，也在 subagent 页面显示

4. **前端收到 `subagent_done` 时**：
   - 刷新 session list
   - 如果当前查看的是该 subagent session：
     - 重新加载消息（`loadMessages`）
     - 如果 `status === 'failed'`，显示错误信息

4. **用户切换到 subagent session 时**（`checkRunningTask` 增强）：
   - 先查 worker 的 `_tasks`（现有逻辑）
   - 如果返回 `unknown`，再查 `GET /subagents/<parent_key>` 
   - 如果 subagent 状态为 `running`：
     - 显示"执行中"状态 + 当前 iteration / max_iterations
     - 加载已有消息
     - 启动**有限轮询**（每 5 秒 reload messages，直到 subagent_done SSE 事件到达）
   - 如果 subagent 状态为 `failed`：显示错误信息
   - 如果 subagent 状态为 `completed`：正常显示

5. **异常体现**：
   - `on_subagent_done(status='failed', error='Error: Connection timeout...')` 
   - 前端收到 SSE `subagent_done` 事件后，在 UI 上显示错误信息
   - 如果用户正在查看该 subagent session，直接在聊天区域显示错误提示

---

## 三、改动范围

### nanobot core（`nanobot/agent/subagent.py`）
- 新增 `SubagentEventCallback` Protocol 类（~20 行，含 `on_subagent_retry`）
- `SubagentManager.__init__` 新增 `event_callback` 参数
- `spawn()` 中调用 `on_subagent_spawned`（~3 行）
- `_run_subagent()` 每次 iteration 调用 `on_subagent_progress`（~3 行）
- `_chat_with_retry()` 新增 `task_id` 参数，重试时调用 `on_subagent_retry`（~10 行）
- `_run_subagent()` 各个退出分支调用 `on_subagent_done`（~10 行）
- 总计：~50 行新增

### worker.py
- 新增 `_subagent_registry` + `WorkerSubagentCallback` 类（~80 行，含 `on_subagent_retry` 处理）
- `_get_subagent_manager()` 传入 `event_callback`（~1 行）
- 新增 `GET /subagents/<parent_key>` 路由（~20 行）
- 总计：~100 行新增

### webserver.py
- 新增代理路由 `GET /api/sessions/:id/subagents` → worker（~15 行）

### 前端 api.ts
- 新增 `fetchSubagentStatus(parentSessionId)` 函数（~10 行）

### 前端 messageStore.ts
- `onProgress` 中检测 spawn/system_inject → fetchSessions（~6 行）
- `checkRunningTask` 增强 subagent 检测逻辑（~30 行）
- SSE 事件处理新增 `subagent_spawned` / `subagent_done`（~15 行）

### 前端 types/index.ts
- 新增 `SubagentStatus` 接口（~10 行）

---

## 四、实施顺序

| Phase | 内容 | 依赖 |
|-------|------|------|
| **A** | nanobot core: SubagentEventCallback + 3 个回调点 | 无 |
| **B** | worker: WorkerSubagentCallback + registry + HTTP API | A |
| **C** | 前端 P0: onProgress 检测 spawn/inject → fetchSessions | 无（可并行） |
| **D** | webserver: 代理路由 | B |
| **E** | 前端: subagent 状态显示 + SSE 事件处理 | B + D |

Phase C 可以立即做（纯前端，不依赖后端改动）。
Phase A → B → D → E 是主链路。

---

## 五、关于轮询的说明

**完全避免轮询**：
- 父 session 的 SSE 流中，`subagent_spawned` 和 `subagent_done` 是 push 的
- Session list 刷新完全由事件驱动

**最小化轮询**：
- 当用户**正在查看**一个 running subagent session 时，需要定期 reload 消息来看到内容增长
- 这是唯一需要轮询的场景，且只在用户主动查看时才触发
- 频率：每 5 秒一次，仅 reload 单个 session 的消息（轻量）
- 一旦收到 `subagent_done` SSE 事件，立即停止轮询

**未来优化方向**：
- 如果 subagent 也注册到 `_tasks`，就可以用 SSE 实时推送 progress，彻底消除轮询
- 但这需要改动较大（subagent 的 agent loop 没有经过 worker 的 callback 机制），作为 P2 考虑
