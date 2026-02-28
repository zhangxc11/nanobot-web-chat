# Bug: Web Chat SSE 流中断导致前端卡死

> 诊断时间: 2026-03-01 01:00
> 修复时间: 2026-03-01 03:30
> 状态: **已修复** (fix/sse-freeze 分支)

## 现象

前端 UI 卡住（sending 状态永远不重置），但 worker 中的 task 正常运行并已完成。

## 根因分析 — 4 个问题

### 问题 1：Worker SSE 流无心跳（根源）

Worker `_attach_to_existing_task` 的 while 循环中，当 agent 等待 LLM API 响应时（60-90 秒），SSE 流上没有任何数据。Webserver 的 `urllib.request.urlopen(req, timeout=330)` 的 socket read timeout 在长时间无数据后触发（实测 ~82-200 秒不等，受系统级 timeout 影响）。

**修复**: Worker while 循环中每 15 秒发送 `: keepalive\n\n` SSE 注释行，保持连接活跃。

### 问题 2：Webserver SSE 超时后污染响应流（最严重）

SSE 超时后 webserver 的 `except Exception` 分支调用 `_send_json({'reply': '❌ 转发失败: ...'}, 500)`。但此时 HTTP 200 + SSE headers 已经发送，这会在 SSE 流中混入 HTTP 响应头 + JSON body，前端 SSE parser 无法解析。

**修复**: 
- 添加 `sse_headers_sent` 标志追踪 SSE headers 是否已发送
- SSE 已发送时：用 `_send_sse_error()` 发送标准 SSE error 事件
- SSE 未发送时：保留原有 `_send_json(500)` 行为

### 问题 3：前端 recovery 正则不匹配（加剧）

`isConnectionError` 正则 `/fetch|network|abort|reset|refused/i` 不匹配 `timed out` 和 `SSE connection reset — task may still be running`，导致走 business error 分支，直接设置 `sending: false` 但不触发 recovery 轮询。

**修复**: 正则扩展为 `/fetch|network|abort|reset|refused|timeout|timed|connection|running/i`，覆盖所有 transport 层错误。

### 问题 4：Webserver 转发 keepalive 注释

Webserver 的 SSE 代理 readline 循环会原样转发 worker 的 `: keepalive` 注释行。虽然无害（SSE 规范允许注释），但不必要。

**修复**: Webserver 检测 `:` 开头的注释行，跳过不转发（仅用于保持 urllib socket 活跃）。

## 修改文件

| 文件 | 改动 |
|------|------|
| `worker.py` | `_attach_to_existing_task` 添加 15 秒 keepalive 心跳 |
| `webserver.py` | `sse_headers_sent` 标志 + `_send_sse_error()` 方法 + 跳过注释行转发 |
| `frontend/src/store/messageStore.ts` | `isConnectionError` 正则扩展（两处） |

## 时间线（修复前最后一次复现）

| 时间 | 事件 |
|------|------|
| 03:12:14 | 用户发送消息，webserver 开始代理 SSE 流 |
| 03:13:52 | Worker task 完成（33 步），done 事件可能未被 webserver 接收 |
| 03:15:34 | Webserver SSE 超时，`_send_json(500)` 污染流 |
| 03:15:34+ | 前端收到污染数据，recovery 不触发，UI 卡死 |
