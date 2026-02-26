# nanobot Web Chat — 开发准则

> 本文档定义开发过程中必须遵守的规则，防止自修改事故。
> 最后更新：2026-02-27

---

## 1. 自修改安全规则 ⚠️

### 1.1 核心原则

nanobot agent 在 Web UI 模式下运行在 **worker 进程内**（SDK 模式）。kill worker = kill agent = 任务中断且不可恢复。

### 1.2 任务风险评估（发起任务前必须判断）

| 风险级别 | 涉及修改的文件 | 推荐执行渠道 | 原因 |
|----------|---------------|-------------|------|
| 🟢 安全 | 前端 `.tsx`/`.css`/`.ts`、文档 `.md`、配置文件 | **Web UI** ✅ | 不需要重启任何进程 |
| 🟡 低风险 | `gateway.py` | **Web UI** ✅ | 优雅降级保护：gateway 重启后 worker 内 agent 继续运行 |
| 🔴 高风险 | `worker.py`、nanobot 核心代码（`nanobot/` 目录） | **CLI** ⚠️ | kill worker = kill 自己 |

### 1.3 高风险任务必须使用 CLI

涉及 `worker.py` 或 nanobot 核心代码修改的任务，**必须通过 CLI 发起**：

```bash
nanobot agent --session "feat-xxx"
```

CLI 模式下 nanobot 是独立进程，可安全修改任何文件并重启服务。

### 1.4 nanobot（AI）自觉遵守

当用户通过 Web UI 发起任务时，nanobot 应：
1. **分析任务涉及的文件**：如果可能涉及 worker.py 或 nanobot 核心修改
2. **主动提醒用户**：建议切换到 CLI 执行
3. **提醒话术**：

```
⚠️ 本次任务可能涉及修改 worker.py / nanobot 核心代码。
由于我当前运行在 worker 进程内，修改后重启 worker 会导致任务中断。

建议切换到 CLI 执行：
  nanobot agent --session "feat-xxx"

CLI 模式下我是独立进程，可以安全地修改和重启服务。
```

4. **如果用户坚持在 Web UI 执行**：
   - 将任务拆分为"修改代码 + commit"和"重启服务"两步
   - 代码修改完成后告知用户手动重启
   - **绝不自行 kill worker 进程**

### 1.5 修改不同文件的处理方式

| 修改内容 | 是否需要重启 | 处理方式 |
|----------|-------------|---------|
| 前端 `.tsx`/`.css` | ❌ | `vite build` 后告知用户刷新浏览器 |
| `gateway.py` | ✅ | 修改 + commit，**告知用户手动重启**（优雅降级保护） |
| `worker.py` | ✅ | 修改 + commit，**告知用户手动重启**。⚠️ Web UI 模式下**禁止**自行 kill worker |
| nanobot 核心代码 | ✅ | 修改 + commit，**告知用户手动重启 worker** |
| 文档 `.md` | ❌ | 直接修改 |

### 1.6 告知用户重启的标准话术

```
⚠️ 本次修改涉及 worker.py / 后端代码，需要手动重启服务才能生效：
   cd ~/.nanobot/workspace/web-chat && bash restart-gateway.sh all
```

### 1.7 复杂任务拆分策略

对于跨组件任务，按风险级别拆分步骤：

```
Step 1 (Web UI 安全执行): 修改前端代码 + vite build + commit
Step 2 (Web UI 安全执行): 修改 gateway.py + commit（不重启）
Step 3 (CLI 或手动操作): 修改 worker.py + commit → 用户手动 restart-gateway.sh all
Step 4 (Web UI 安全执行): 验证 + 测试
```

### 1.8 历史事故备忘

| 事故时间 | Phase | 触发场景 | 后果 |
|----------|-------|---------|------|
| 2026-02-25 23:50 | Phase 11 | 修改 gateway.py + 重启 | SSE 断开，任务中断 |
| 2026-02-26 ~23:15 | Phase 26 | 修改 worker.py + kill worker | nanobot 自杀，转 CLI 恢复 |
| 2026-02-26 ~23:42 | Phase 27 | 修改 worker.py + kill worker | nanobot 自杀，转 CLI 恢复 |

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

*本文档由 2026-02-26 自修改事故后创建，2026-02-27 升级为完整的自修改安全规则体系。*
