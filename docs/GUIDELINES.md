# nanobot Web Chat — 开发准则

> 本文档定义开发过程中必须遵守的规则，防止自修改事故。

---

## 1. 自修改安全规则 ⚠️

### 1.1 绝不在任务执行中重启服务

当 nanobot 通过 Web Chat UI 接收任务时，**绝不能**在同一任务中重启 gateway 或 worker。

**原因**：重启 gateway 会断开正在进行的 SSE 连接，导致：
- 前端报 "TypeError: Failed to fetch"
- 用户看到任务失败
- 代码可能处于未提交的中间状态

### 1.2 修改不同文件的处理方式

| 修改内容 | 是否需要重启 | 处理方式 |
|----------|-------------|---------|
| 前端 `.tsx`/`.css` | ❌ | `vite build` 后告知用户刷新浏览器 |
| `gateway.py` | ✅ | 修改 + commit，**告知用户手动重启** |
| `worker.py` | ✅ | 修改 + commit，**告知用户手动重启** |
| 文档 `.md` | ❌ | 直接修改 |

### 1.3 告知用户重启的标准话术

```
⚠️ 本次修改涉及 gateway.py，需要手动重启 gateway 才能生效：
   cd web-chat && bash start.sh
   或单独重启 gateway：kill <PID> && python3 gateway.py --port 8081 --worker-url http://127.0.0.1:8082 &
```

---

## 2. 代码提交规范

### 2.1 每个功能点独立 commit

- 一个功能一个 commit，message 用中文描述
- 格式：`feat: 功能描述` / `fix: 修复描述` / `docs: 文档更新`

### 2.2 提交前必须验证

- TypeScript：`npx tsc --noEmit`
- Vite build：`npx vite build`
- 两者都通过后才能 commit

---

## 3. 日志规范

### 3.1 日志文件位置

- Gateway 日志：`/tmp/nanobot-gateway.log`
- Worker 日志：`/tmp/nanobot-worker.log`

### 3.2 日志级别

- `INFO`：正常请求、启动/停止
- `WARN`：可恢复的异常（如 client disconnect）
- `ERROR`：需要关注的错误（如 worker 不可用、文件操作失败）

---

## 4. 开发流程

1. 更新需求文档 (`docs/REQUIREMENTS.md`)
2. 更新架构文档 (`docs/ARCHITECTURE.md`)
3. 更新开发日志 (`docs/DEVLOG.md`) — 添加任务计划
4. 实施代码修改
5. TypeScript 检查 + Vite build
6. Git commit
7. 更新 DEVLOG 标记完成

---

*本文档由 2026-02-26 自修改事故后创建，持续更新。*
