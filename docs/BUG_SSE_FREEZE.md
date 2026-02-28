# Bug: Web Chat SSE 流中断导致前端卡死

> 诊断时间: 2026-03-01 01:00
> 状态: **待修复**（先完成 provider 切换功能后再处理）

## 现象

前端 UI 卡住（不再发送任何请求），但 worker 中的 task 正常运行并已完成。

## 发现了 3 个问题

### 问题 1：Webserver SSE 代理超时过短（直接原因）

`webserver.py` 用 `urllib.request.urlopen(req, timeout=330)` 代理 worker 的 SSE 流。这个 330 秒是 **socket read timeout**（两次数据之间的最大空闲时间）。当 agent 在等待 LLM API 响应时（60-90 秒无 progress 事件），虽然不到 330 秒，但从日志看实际 ~82 秒就超时了，说明可能还受到了其他系统级 timeout 的影响。SSE 流断开后，worker 的 task 继续在后台正常运行。

### 问题 2：SSE 超时后 webserver 错误处理污染了响应流（关键 bug）

SSE 超时后，webserver 进入 `except Exception` 分支，调用了 `_send_json({'reply': '❌ 转发失败'}, 500)`。但此时 **HTTP 200 + SSE headers 已经发送了**！`_send_json` 会在 SSE 流中混入 `HTTP/1.0 500 Internal Server Error` 响应头和 JSON body。这导致前端浏览器的 `ReadableStream` 收到了**非法的混合数据**，可能使前端的 Promise 链断裂或触发未被正确捕获的 JS 异常，导致 **recovery 轮询 (`_pollTaskStatus`) 从未被触发**。

### 问题 3：Worker 的 done 事件存在竞态条件

Worker 的 `_execute()` 协程中：
1. 先设置 `task['status'] = 'done'`（line 311）
2. 后调用 `_notify_sse(task, 'done', ...)`（line 335）

而 `_attach_to_existing_task` 的 `while task['status'] == 'running'` 循环在检测到 status 变化后**立即退出**，`finally` 块从 `_sse_clients` 中移除了 `sse_writer`。如果 while 循环在 `_notify_sse` 调用之前退出，**done 事件就丢失了**，webserver 只能等到 socket timeout 才发现流结束。

## 时间线还原（最后一次卡死）

| 时间 | 事件 |
|------|------|
| 00:42:45 | 用户发送 "可以，开始开发吧"，webserver 转发到 worker |
| 00:42:45 | Worker 创建 task，开始执行（大量代码读写操作） |
| 00:44:07 | Webserver urllib timeout 触发（82 秒无数据） |
| 00:44:07 | Webserver 在 SSE 流中混入 500 JSON 响应（问题 2） |
| 00:44:07 | 前端收到异常数据，**UI 卡死**，recovery 未触发 |
| 00:44:12~37 | Webserver 的 `_try_recover_usage` 后台线程查询 worker（3 次） |
| 01:01:22 | Worker task 正常完成（280 步，用了 18 分钟） |
| 至今 | 前端完全静默，无任何请求 |

## 修复建议

1. **问题 2（优先级最高）**：SSE 超时后的 catch 块中，如果 headers 已发送，**不要调用 `_send_json`**，直接关闭连接即可
2. **问题 3**：Worker 中将 `_notify_sse` 调用移到 `task['status'] = 'done'` **之前**，或在 `_attach_to_existing_task` 退出 while 循环后主动检查 task status 并发送 done 事件
3. **问题 1**：考虑增大 timeout 或改用 worker 端的心跳机制（定期发送 SSE comment `: keepalive`）
