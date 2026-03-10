# 基础设施

> 本文件包含 web-chat 自修改安全架构、Gateway+Worker 拆分、优雅降级机制和架构演进规划。

## 本文件索引

| 章节 | 标题 |
|------|------|
| §八 | 自修改安全架构 |
| §九 | 架构拆分 Gateway + Worker 分离 |
| §十 | 优雅降级 Gateway 重启不中断任务 |
| §十四 | 架构演进规划 SDK化+持久化+Token |

---

## 八、自修改安全架构 (v1.1 新增)

### 8.1 问题描述

nanobot 通过 Web Chat UI 接收指令时，可能被要求修改前端代码本身。这产生了一个特殊的架构问题：

```
用户通过 Web UI 发送 "修改前端代码" 
  → server_v2.py 调用 nanobot agent
  → nanobot 修改 .tsx/.css 文件
  → nanobot 执行 vite build（更新 dist/）
  → nanobot 可能重启 server_v2.py ← 💥 这里出问题
  → server_v2.py 被杀 → HTTP 连接断开 → nanobot 子进程可能被终止
  → session JSONL 未完整写入 → 助手回复丢失
```

### 8.2 解决方案

**原则：server_v2.py 不需要重启就能 serve 新的前端构建产物。**

因为 `_serve_static()` 方法每次请求都从磁盘读取文件，所以 `vite build` 产生新的 `dist/` 文件后，用户只需刷新浏览器即可看到新 UI，无需重启 server。

**防护措施：**

1. **进程隔离**：`subprocess.run(..., start_new_session=True)` 让 nanobot agent 子进程脱离 server 的进程组。即使 server 意外被杀，nanobot 仍能完成任务并写入 session。

2. **操作规范**：nanobot 在修改前端代码时，应该：
   - ✅ 修改源码 → `vite build` → 通知用户刷新浏览器
   - ❌ 不要重启 server_v2.py（没有必要）
   - ❌ 不要杀掉 server_v2.py 进程

3. **前后端分离**：
   - 前端静态文件通过 `dist/` 目录 serve，文件名含 hash，不会缓存冲突
   - API 端点 (`/api/*`) 与静态文件服务互不影响
   - `vite build` 是纯文件操作，不影响运行中的 server

### 8.3 操作指南（给 nanobot 自己看）

当通过 Web Chat UI 收到修改前端代码的请求时：
1. 修改前端源码（`.tsx`, `.css` 等）
2. 执行 `cd frontend && npx vite build`
3. `git add -A && git commit -m "..."`
4. 回复用户："已更新，请刷新浏览器查看"
5. **不要重启 gateway.py 或 worker.py**

### 8.4 Gateway 修改的安全规则 (v2.5 更新)

> **背景**：2026-02-25 发生过一次事故 — nanobot 在 Web UI 任务中修改了 `gateway.py` 并重启 gateway，导致 SSE 断开。

> **v1.5 改进**：引入优雅降级机制（见第十章），SSE 断开后 Worker 继续执行任务，前端自动轮询恢复。

> **v2.5 改进**：引入 `--daemonize` 标志 + `restart.sh` 脚本，exec 工具可安全调用脚本重启服务。同时 exec 工具拒绝含 `&` 后台操作符的命令。

**当前规则**：
1. **nanobot 不应主动重启 gateway/worker** — 告知用户手动重启
2. **即使 gateway 意外重启**，Worker 中的 nanobot 子进程会继续执行
3. **前端自动恢复**：SSE 断开后轮询 `/api/sessions/:id/task-status`
4. **前端代码修改 + vite build 不需要重启任何服务** — gateway 从磁盘读取 dist/
5. **exec 工具禁止 `&` 后台操作符** — 避免 PIPE fd 继承导致 `communicate()` 卡死
6. **安全重启方式**：`restart.sh` 脚本（内部使用 `--daemonize` double-fork + 进程年龄验证）

**总结**：
| 修改内容 | 需要重启？ | 谁来重启？ | 降级保护？ |
|----------|-----------|-----------|-----------|
| 前端 .tsx/.css + vite build | ❌ 不需要 | — | — |
| gateway.py | ✅ 需要 | **用户手动** 或 `restart.sh` | ✅ Worker 继续执行 |
| worker.py | ✅ 需要 | **用户手动** 或 `restart.sh` | ❌ 会中断任务 |

### 8.5 exec 工具后台命令防护 (v2.5 新增)

**问题**：Shell 中 `&` 优先级低于 `&&`，导致 `cmd1 && cmd2 &` 整个复合命令后台执行。子进程继承 PIPE fd，`communicate()` 永远阻塞。

**防护机制**（nanobot 核心 `shell.py`）：
```python
@staticmethod
def _has_background_process(command: str) -> bool:
    # 1. 去除引号内字符串（避免误判）
    stripped = re.sub(r"'[^']*'|\"[^\"]*\"", "", command)
    # 2. 去除合法的 & 模式：&&, >&, &>, 2>&1
    stripped = re.sub(r"&&|[0-9]*>&[0-9]*|&>", "", stripped)
    # 3. 剩余的 & 即为后台操作符
    return "&" in stripped
```

检测到后返回错误信息，建议：
1. 使用 `restart.sh` 管理脚本
2. 使用程序的 `--daemonize` 标志
3. 重构命令避免 `&`

### 8.6 Daemonize 机制 (v2.5 新增)

gateway.py 和 worker.py 支持 `--daemonize` 标志，使用 UNIX double-fork 完全脱离父进程：

```
Parent (exec tool)
  └─ fork() → Child
       └─ os.setsid()  # 新 session leader
       └─ fork() → Grandchild (daemon)
            └─ redirect stdin/stdout/stderr → /dev/null
            └─ os.dup2(devnull, 0/1/2)  # 低级 fd 也重定向
            └─ 启动 HTTP server
```

**关键点**：
- 第一次 fork：父进程立即退出，exec 工具的 `communicate()` 正常返回
- `os.setsid()`：脱离父进程的 session 和进程组
- 第二次 fork：确保 daemon 不是 session leader（无法获取控制终端）
- fd 重定向：不继承任何 PIPE fd

**restart.sh 脚本**（原 `restart-gateway.sh`，Phase 31 重命名）：
```bash
# 用法
./restart.sh [all|webserver|worker|stop|status]

# 环境变量
WEBSERVER_PORT=8081  WORKER_PORT=8082  # 可覆盖端口
```

脚本流程（v4.10 增强）：
1. **进程发现**（三层）：pgrep 脚本路径 → pgrep 进程名 → lsof 端口占用，合并去重
2. 发送 SIGTERM 停止旧进程，SIGKILL 兜底，**验证端口已释放**
3. 使用 `--daemonize` 启动新进程
4. **健康检查 + 进程年龄验证**：curl 端口 + lsof 找 PID + `ps etime` 确认进程年龄 ≤ 10s
   - 如果端口响应但进程是老的（age > 10s），报错而非假装成功

---

## 九、架构拆分：API Gateway + Worker 分离 (v1.2 规划)

### 9.1 问题描述

当前 `server_v2.py` 是单进程 `HTTPServer`，同时承担三个职责：
1. **静态文件服务**：serve `frontend/dist/`
2. **API 网关**：处理 `/api/sessions`、`/api/sessions/:id/messages` 等
3. **任务执行**：调用 `nanobot agent` 子进程，等待完成后返回

如果 nanobot 被要求修改 `server_v2.py` 本身：
- 修改文件不影响运行中的 Python 进程（不热加载）
- 但修改后需要重启才能生效 → 当前 HTTP 连接断开 → 前端收到错误
- `start_new_session=True` 保证 nanobot 子进程存活，但 server 死了无法返回 response
- session JSONL 由 nanobot 核心写入，不受 server 影响 → **数据不会丢失**
- 但用户看到的是一个失败的请求，需要刷新页面

### 9.2 拆分方案

将 server 拆分为两个独立进程：

```
┌─────────────────────────────────────────────────────────┐
│                     浏览器 (Frontend)                    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP
┌────────────────────────┴────────────────────────────────┐
│              API Gateway (gateway.py) :8081              │
│                                                         │
│  职责：                                                  │
│  - 静态文件服务 (frontend/dist/)                         │
│  - Session 列表/详情 API (读 JSONL 文件)                  │
│  - 消息历史 API (读 JSONL 文件)                           │
│  - 转发聊天请求到 Worker                                  │
│                                                         │
│  特点：轻量、无状态、可随时重启                             │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP (localhost:8082)
┌────────────────────────┴────────────────────────────────┐
│              Worker Service (worker.py) :8082            │
│                                                         │
│  职责：                                                  │
│  - 接收聊天请求                                          │
│  - 调用 nanobot agent 子进程                              │
│  - 返回回复                                              │
│                                                         │
│  特点：                                                  │
│  - 代码极少，几乎不需要修改                                │
│  - 只依赖 nanobot CLI，不依赖前端代码                      │
│  - 即使 gateway 重启，worker 不受影响                      │
└─────────────────────────────────────────────────────────┘
```

### 9.3 拆分后的安全性分析

| 场景 | 影响 |
|------|------|
| nanobot 修改前端代码 + `vite build` | ✅ 无影响，gateway 从磁盘读 dist/ |
| nanobot 修改 `gateway.py` + 重启 | ⚠️ gateway 短暂不可用，但 worker 继续执行任务，session 正常记录。用户刷新后恢复 |
| nanobot 修改 `worker.py` + 重启 | 🔴 当前正在执行的任务会丢失 response（但 nanobot 子进程仍存活，session 正常写入）|
| nanobot 修改 `worker.py`（不重启）| ✅ 无影响，修改不生效直到手动重启 |

**关键收益**：大多数代码修改（前端、gateway API 逻辑、样式等）都不需要碰 `worker.py`。Worker 的代码极其简单稳定（~30 行），几乎不需要修改。

### 9.4 Worker API 设计

```
POST /execute
{
  "session_key": "webchat:1234",
  "message": "你好"
}
→
{
  "reply": "你好！有什么可以帮你的？",
  "success": true
}
```

### 9.5 实施计划

- **T9.1**: 创建 `worker.py`（独立 HTTP 服务 :8082，仅处理 nanobot agent 调用）
- **T9.2**: 修改 `gateway.py`（从 `server_v2.py` 重命名，聊天请求转发到 worker）
- **T9.3**: 启动脚本（同时启动 gateway + worker）
- **T9.4**: 测试 + 文档更新

---

## 十、优雅降级：Gateway 重启不中断任务 (v1.5 新增)

### 10.1 问题描述

当 nanobot 修改 `gateway.py` 并重启 gateway 时：
- SSE 连接断开 → 前端收到 "Failed to fetch"
- Worker 收到 BrokenPipeError → 之前会 `proc.kill()` 杀掉 nanobot 子进程
- 结果：**任务完全中断**

### 10.2 优雅降级方案

**核心原则：SSE 断开 ≠ 任务失败。nanobot 子进程应该继续执行。**

```
正常流程：
  Frontend ──SSE──→ Gateway ──HTTP──→ Worker ──stdout──→ nanobot
  Frontend ←─SSE──── Gateway ←─SSE──── Worker ←─stdout── nanobot

Gateway 重启时的降级流程：
  Frontend ──SSE──→ Gateway 💥 (重启中)
                     Worker ──stdout──→ nanobot (继续执行)
  
  Gateway 恢复后：
  Frontend ──poll──→ Gateway ──HTTP──→ Worker /tasks/:key → { running / done }
  
  任务完成后：
  Frontend ──GET──→ Gateway /messages → 从 JSONL 重载完整消息
```

### 10.3 Worker 改动

1. **BrokenPipe 不杀子进程**：`except BrokenPipeError` 中移除 `proc.kill()`
2. **Task Registry**：内存字典 `_active_tasks = { session_key: { pid, status, started_at } }`
3. **后台线程**：子进程的 stdout 读取移到后台线程，不依赖 HTTP 连接
4. **查询接口**：`GET /tasks/<session_key>` 返回 `{ status: "running" | "done" | "error" | "unknown" }`

### 10.4 Gateway 改动

1. **转发查询**：`GET /api/sessions/:id/task-status` → Worker `/tasks/<session_key>`

### 10.5 前端改动

1. **SSE 错误不立即报错**：`onError` 回调中先检查是否是连接断开（非业务错误）
2. **轮询恢复**：连接断开后每 3 秒轮询 `/api/sessions/:id/task-status`
3. **状态展示**：
   - `running` → 显示 "⏳ 任务后台执行中..."
   - `done` → 从 JSONL 重载消息，恢复正常
   - `error` → 显示错误信息

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
