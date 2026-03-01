# Bug: Web Chat SSE 流中断导致前端卡死

> 诊断时间: 2026-03-01 01:00
> 第一次修复: 2026-03-01 03:30 (commit `b244781`)
> 第二次修复: 2026-03-01 16:00 (commit `e9ccc88`) — **真正根因**
> 状态: **已修复** (main 分支)

## 现象

前端 UI 卡住（sending 状态永远不重置），但 worker 中的 task 正常运行并已完成。

## 根因分析 — 5 个问题

### 问题 0：Done 事件竞态条件 ⭐ 真正根因（第二次修复）

**这是导致所有后续问题的根源。**

Worker 的 `_execute_task_async` 中，`task['status'] = 'done'` 在 try 块末尾设置，而 `_notify_sse(task, 'done', ...)` 在 finally 块中调用。`_attach_to_existing_task` 的 while 循环检测到 `task['status'] != 'running'` 后立即退出，在 finally 中 `disconnected.set()` + 移除 sse_writer。**结果：`_notify_sse` 调用 sse_writer 时，writer 已被移除或 disconnected 标志已设置，done 事件永远不会被发送到 SSE 客户端。**

时序：
1. asyncio 线程：`task['status'] = 'done'` (try 块末尾)
2. HTTP handler 线程：while 循环检测到 status 变化 → 退出
3. HTTP handler 线程：finally → `disconnected.set()` → 移除 sse_writer
4. asyncio 线程：finally → `_notify_sse('done', ...)` → sse_writer 已移除，done 事件丢失！
5. Worker handler 返回，但 webserver 的 `readline()` 已经在等 → 330 秒后超时

**修复**:
- 添加 `done_sent` threading.Event 追踪 done/error 事件是否已发送
- while 循环退出后，`done_sent.wait(timeout=2.0)` 等待 _notify_sse 发送
- 如果 2 秒后仍未发送，safety net 直接发送 done/error（持有 `_sse_lock` 避免数据交错）
- 然后才 `disconnected.set()` + 移除 sse_writer

### 问题 1：Worker SSE 流无心跳（第一次修复）

Worker `_attach_to_existing_task` 的 while 循环中，当 agent 等待 LLM API 响应时（60-90 秒），SSE 流上没有任何数据。Webserver 的 `urllib.request.urlopen(req, timeout=330)` 的 socket read timeout 在长时间无数据后触发。

**修复**: Worker while 循环中每 15 秒发送 `: keepalive\n\n` SSE 注释行，保持连接活跃。

### 问题 2：Webserver SSE 超时后污染响应流（第一次修复）

SSE 超时后 webserver 的 `except Exception` 分支调用 `_send_json(500)`。但此时 HTTP 200 + SSE headers 已经发送，这会在 SSE 流中混入 HTTP 响应头 + JSON body。

**修复**: 
- 添加 `sse_headers_sent` 标志
- SSE 已发送时：用 `_send_sse_error()` 发送标准 SSE error 事件
- SSE 未发送时：保留原有 `_send_json(500)` 行为

### 问题 3：前端 recovery 正则不匹配（第一次修复）

`isConnectionError` 正则不匹配 `timed out` 和 `SSE connection reset`。

**修复**: 正则扩展为 `/fetch|network|abort|reset|refused|timeout|timed|connection|running/i`

### 问题 4：Webserver 转发 keepalive 注释（第一次修复）

Webserver 检测 `:` 开头的 SSE 注释行，跳过不转发。

## 修改文件

| 文件 | 改动 | Commit |
|------|------|--------|
| `worker.py` | keepalive 心跳 | `b244781` |
| `worker.py` | done_sent 追踪 + safety net + wait | `e9ccc88` |
| `webserver.py` | sse_headers_sent + _send_sse_error + 跳过注释行 | `b244781` |
| `frontend/src/store/messageStore.ts` | isConnectionError 正则扩展 | `b244781` |

## 日志证据（第二次诊断）

```
[15:52:53] Task done: session=webchat:1772349033, steps=9     ← worker 完成
[15:53:04] SSE stream error for session webchat_1772349033: timed out  ← webserver 超时
```

Task 完成后 11 秒 webserver 才超时。之前的几次都是 ~330 秒后超时（urllib timeout）。
Done 事件从未被 webserver 收到，因为 sse_writer 在 _notify_sse 调用前已被移除。
