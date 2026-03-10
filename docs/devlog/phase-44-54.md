# Phase 44-54 归档

## 本文件索引
| Phase | 标题 | 状态 |
|-------|------|------|
| 45 | restart.sh 进程发现与健康检查修复 (Issue #51) | ✅ |
| 46.0 | Session 重命名存储重构 — session_names.json | ✅ |
| 46 | Session Tag — done 标记与过滤 | ✅ |
| 49 | 用量统计页面增强 (§四十 Issue #54) | ✅ |
| 50 | System Inject 消息展示 (§四十一 Issue #55) | ✅ |
| 51 | Subagent 消息 Role 适配 — 内容前缀识别 (§四十二) | ✅ |
| 52 | REQUIREMENTS.md Backlog 区域重构 (文档维护) | ✅ |
| 53 | 日志路径统一迁移 — /tmp → ~/.nanobot/logs/ | ✅ |
| 54 | 前端 Markdown 渲染修复与消息复制 (v5.5) | ✅ |

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

---

## Phase 49: 用量统计页面增强 (§四十 Issue #54) ✅

> 日期：2026-03-09
> 需求：REQUIREMENTS.md §四十 Issue #54
> 5 项改进：未缓存卡片 + 时间段筛选 + Session 父子聚合 + 分页 + 曲线图

### 任务清单

- [x] **T49.1** 后端 — `analytics.py` + `webserver.py` 增加 `period` 参数
  - `get_global_usage(period=None)` — 支持 `1d|7d|30d|all`
  - `get_daily_usage(period=None)` — 同上
  - `webserver.py` 解析 `?period=` query param 并传递
  - 新增 `_period_filter()` 静态辅助方法

- [x] **T49.2** 前端 API — `fetchUsage()` / `fetchDailyUsage()` 增加 `period` 参数

- [x] **T49.3** 前端 — 时间段选择器 UI + 联动
  - 页面顶部 4 个 tab：过去一天 | 过去一周 | 过去一个月 | 历史累计
  - 选中后重新请求数据，所有区域联动

- [x] **T49.4** 前端 — 总量卡片增加"未缓存"
  - 新增卡片：值 = prompt_tokens - cache_read - cache_creation
  - 红色调

- [x] **T49.5** 前端 — Session 父子聚合
  - 复用 `fetchSessionParents()` 获取 parentMap
  - 复用 SessionList 的 `resolveParent` 启发式逻辑，计算根父节点
  - 聚合后只显示根 session 行，子 session 数量显示为 badge

- [x] **T49.6** 前端 — 按对话分页
  - 每页 20 条，分页控件（上一页/下一页 + 页码）

- [x] **T49.7** 前端 — 每日趋势曲线图
  - SVG `<polyline>` 折线图
  - 三条曲线：总 token（蓝）、输入（深蓝）、缓存命中（绿）
  - X 轴日期、Y 轴刻度、hover tooltip + 竖线指示器

- [x] **T49.8** CSS 样式 + 构建 + 测试 + Git 提交
  - TypeScript 编译通过
  - Vite build 通过 (1.01s)
  - 41 个后端测试通过（含 5 个新 period 测试）
  - Git commit: `5f49382`

- [x] **T49.9** 时间段筛选口径优化：滑动窗口 → CST 自然日
  - 后端 `_period_filter()` 改用 CST 自然日起点（`datetime('now','+8 hours','start of day','-8 hours')`）
  - `1d`=今日00:00 CST, `7d`=7天前00:00 CST, `30d`=30天前00:00 CST
  - 前端 `UsagePage.tsx` 时间段选择器下方增加口径说明文字
  - 前端 `UsagePage.module.css` 新增 `.periodHint` 样式
  - TypeScript 编译通过

- [x] **T49.10** 修复 childBadge (+N) 不显示
  - **根因**：`.colSession` 同时设置了 `display: flex` + `overflow: hidden`，当 summary 文字过长时 badge 被裁掉
  - **修复**：拆分为 `.colSession`（flex 容器，`min-width: 0`）+ `.sessionName`（承载 ellipsis），badge 的 `flex-shrink: 0` 保证始终可见
  - TypeScript + Vite build 通过

- [x] **T49.11** "按模型"和"按对话"表格增加缓存命中/缓存写入列
  - "按模型"表头新增"缓存命中"（绿色）、"缓存写入"（橙色）两列
  - "按对话"表头同上，已删除行显示 `-`
  - 后端 `by_model` API 已有 `cache_creation_input_tokens` / `cache_read_input_tokens` 字段，纯前端改动
  - TypeScript + Vite build 通过，41 个后端测试通过

---

## Phase 50: System Inject 消息展示 (§四十一 Issue #55) ✅

> 日期：2026-03-09
> 需求：REQUIREMENTS.md §四十一 Issue #55
> Subagent 返回等系统注入消息在 Web Chat 中可视化展示

### 背景

Agent spawn subagent 后，subagent 完成时通过 SessionMessenger 注入 `role: "system"` 消息到父 session JSONL。但 Web Chat 前端完全看不到这些消息——后端过滤、前端类型和分组逻辑都不支持 system 角色。

### 任务清单

- [x] **T50.1** 后端 — webserver.py 放行 system 角色消息
  - 消息过滤条件从 `('user', 'assistant', 'tool')` 扩展为 `('user', 'assistant', 'tool', 'system')`

- [x] **T50.2** 后端 — worker.py SSE on_message 处理 system 角色
  - 新增 `system` 角色处理分支，解析 source，发送 `system_inject` 类型 progress 事件
  - progress text 格式：`🤖 source: body[:80]`

- [x] **T50.3** 前端类型 — types/index.ts 扩展
  - `Message.role` 增加 `'system'`
  - `ProgressStep.type` 增加 `'system_inject'`

- [x] **T50.4** 前端 — MessageItem.tsx groupMessages + SystemInjectCard
  - `MessageGroup.type` 增加 `'system-inject'`
  - `groupMessages()` 识别 `system` 角色，创建独立 `'system-inject'` group
  - 新增 `parseSystemInject()` 解析 subagent 返回消息格式（去 boilerplate + 提取结果正文）
  - 新增 `formatSubagentSource()` 提取短标识（如 `subagent f60a77e9`）
  - 新增 `SystemInjectCard` 组件：紫色渐变卡片，可展开/折叠，Markdown 渲染内容

- [x] **T50.5** 前端 — MessageList.tsx 渲染 + progress 类型
  - 导入 `SystemInjectCard`，渲染 `system-inject` group
  - `ProgressStepItem` 新增 `system_inject` 类型渲染（紫色斜体）

- [x] **T50.6** 前端 — MessageList.module.css 样式
  - `.systemInjectCard` 容器（flex column 居中）
  - `.systemInjectHeader` 可点击头部（紫色渐变背景 + hover 效果）
  - `.systemInjectBody` 展开内容区（灰色背景 + Markdown 渲染）
  - `.progressSystemInject` streaming 步骤样式

- [x] **T50.7** 构建 + 测试 + Git 提交
  - TypeScript 编译通过
  - Vite build 通过 (984ms)
  - 41 个后端测试通过

### 改动文件
- `webserver.py` — 消息过滤放行 system 角色
- `worker.py` — SSE on_message system 角色处理
- `frontend/src/types/index.ts` — Message.role + ProgressStep.type 扩展
- `frontend/src/pages/chat/MessageItem.tsx` — groupMessages 扩展 + SystemInjectCard 组件
- `frontend/src/pages/chat/MessageList.tsx` — system-inject 渲染 + progress 类型
- `frontend/src/pages/chat/MessageList.module.css` — 紫色通知卡片样式
- `docs/REQUIREMENTS.md` — §四十一 Issue #55
- `docs/DEVLOG.md` — Phase 50 记录

---

## Phase 51: Subagent 消息 Role 适配 — 内容前缀识别 (§四十二)

> 日期：2026-03-09
> 需求：REQUIREMENTS.md §四十二
> 配合 nanobot 核心 §35，subagent 消息从 system role 改回 user role

### 背景

nanobot 核心 §35 将 subagent 回报消息从 `role="system"` 改回 `role="user"`（Anthropic API 会把 system 消息抽到 system prompt 导致 cache 失效）。web-chat 需要通过内容前缀（而非 role）识别 subagent 通知消息。

### 任务清单

- [x] **T51.1** `worker.py` — WorkerSessionMessenger inject 改为 user role
- [x] **T51.2** `worker.py` — on_message 通过内容前缀识别 subagent 消息
- [x] **T51.3** `webserver.py` — 确认消息过滤保持兼容（system 保留）
- [x] **T51.4** `MessageItem.tsx` — groupMessages 通过前缀识别 user role 的 subagent 消息
- [x] **T51.5** 确认 strip_runtime_context 不误伤 `[Message from session`
- [x] **T51.6** TypeScript 编译 + Vite build
- [x] **T51.7** 后端测试 pytest
- [x] **T51.8** Git 提交

### 改动文件
- `worker.py` — WorkerSessionMessenger inject role 改为 user + on_message 前缀识别
- `webserver.py` — 无改动（system 已在过滤列表中，兼容旧数据）
- `frontend/src/pages/chat/MessageItem.tsx` — groupMessages 新增 isSystemInjectByContent 前缀检测
- `docs/REQUIREMENTS.md` — §四十二
- `docs/DEVLOG.md` — Phase 51 记录

### Git
- web-chat commit: `c728f4b`

---

## Phase 52: REQUIREMENTS.md Backlog 区域重构 (文档维护)

> 日期：2026-03-09
> 纯文档改动，无代码变更

### 背景

REQUIREMENTS.md 中的手动维护 backlog 区域（Backlog #16、#17）位于文档中间位置，容易被新增的正式需求章节"夹在中间"，导致文档结构混乱。

### 改动

- 移除原有的内联 backlog 区域（Backlog #16 message tool 跨 Session 消息传递、Backlog #17 API 子 Session 命名规范 Skill）
- 在文件末尾新增结构化的 `## 📋 Backlog（手动维护）` 区域
- 添加 HTML 注释锚点标记（`⚠️ BACKLOG 区域`、`⚠️ BACKLOG 结束`），明确标识 backlog 边界
- AI 指令注释：新增正式需求章节时插入到 backlog 区域之前，保持 backlog 始终位于文件最末尾
- 已完成的 backlog 项已在之前的 Phase 中被提升为正式需求或关闭，当前 backlog 为空

### 验证

- 41 个后端测试全部通过
- 无代码改动，仅文档结构调整

---

## Phase 53: 日志路径统一迁移 — /tmp → ~/.nanobot/logs/

> 日期：2026-03-09
> 运维改进，将所有日志从 /tmp 迁移到统一的 ~/.nanobot/logs/ 目录

### 背景

nanobot 的 gateway、webserver、worker 日志散落在 `/tmp/` 目录下：
- `/tmp/nanobot-gateway.log`
- `/tmp/nanobot-webserver.log` + `-stderr.log`
- `/tmp/nanobot-worker.log` + `-stderr.log`

问题：
1. 容易忘记日志位置
2. 系统重启后 `/tmp` 可能被清理，历史日志丢失
3. 日志分散，不便于统一管理

### 改动

统一迁移到 `~/.nanobot/logs/` 目录：

| 旧路径 | 新路径 |
|--------|--------|
| `/tmp/nanobot-gateway.log` | `~/.nanobot/logs/gateway.log` |
| `/tmp/nanobot-webserver.log` | `~/.nanobot/logs/webserver.log` |
| `/tmp/nanobot-webserver-stderr.log` | `~/.nanobot/logs/webserver-stderr.log` |
| `/tmp/nanobot-worker.log` | `~/.nanobot/logs/worker.log` |
| `/tmp/nanobot-worker-stderr.log` | `~/.nanobot/logs/worker-stderr.log` |

### 任务清单

- [x] **T53.1** `webserver.py` — LOG_FILE 改为 `~/.nanobot/logs/webserver.log`，自动创建目录
- [x] **T53.2** `worker.py` — LOG_FILE 改为 `~/.nanobot/logs/worker.log`，自动创建目录
- [x] **T53.3** `restart_gateway_direct.sh` — GATEWAY_LOG 改为 `~/.nanobot/logs/gateway.log`
- [x] **T53.4** `restart_gateway.sh` — GATEWAY_LOG 同步更新
- [x] **T53.5** `skills/restart-webchat/SKILL.md` — 更新日志路径文档
- [x] **T53.6** `skills/restart-gateway/SKILL.md` — 更新日志路径文档
- [x] **T53.7** `docs/GUIDELINES.md` — 更新日志路径引用
- [x] **T53.8** 备份旧日志到新目录（5 个文件，共 ~19MB）
- [x] **T53.9** 后端测试 41 passed
- [x] **T53.10** `MEMORY.md` 更新日志目录信息
- [x] **T53.11** Git 提交

### 改动文件
- `webserver.py` — LOG_DIR + LOG_FILE 路径变更
- `worker.py` — LOG_DIR + LOG_FILE 路径变更
- `skills/restart-gateway/scripts/restart_gateway_direct.sh` — GATEWAY_LOG 路径变更
- `skills/restart-gateway/scripts/restart_gateway.sh` — GATEWAY_LOG 路径变更
- `skills/restart-webchat/SKILL.md` — 日志路径文档
- `skills/restart-gateway/SKILL.md` — 日志路径文档
- `docs/GUIDELINES.md` — 日志路径引用

### Git
- web-chat commit: `361e076`

---

## Phase 54: 前端 Markdown 渲染修复与消息复制 (v5.5)

> 日期：2026-03-10
> 需求：§四十三

### 任务清单

- [x] **T54.1** 安装 `remark-breaks` 依赖，添加到 MarkdownRenderer remarkPlugins (Issue #43-4)
- [x] **T54.2** MarkdownRenderer 添加 `extractText()` 递归函数，修复代码框复制 (Issue #43-3)
- [x] **T54.3** MessageItem 添加 `CopyButton` 组件 + CSS 样式 (Issue #43-2)
- [x] **T54.4** `.codeBlock code` CSS 添加 `white-space: pre-wrap` + `word-break: break-all` 修复代码块换行 (Issue #43-1)
- [x] **T54.5** npm run build 验证 ✅
- [x] **T54.6** Git commit: `a7ed4f3`
- [x] **T54.7** 更新 DEVLOG 记录结果

### 根因分析

代码块换行丢失的根因：
1. `MarkdownRenderer` 的 `components.pre` 将 `<pre>` 替换为 `<>{children}</>`（透传 fragment）
2. highlight.js 默认样式 `pre code.hljs { display: block; }` 因缺少 `<pre>` 祖先而不匹配
3. 自定义 CSS `.codeBlock code` 也没有 `white-space` 声明
4. `<code>` 标签默认 `white-space: normal`，换行符被当作空格

### 改动文件
- `frontend/src/components/Markdown/MarkdownRenderer.module.css` — 添加 `white-space: pre-wrap` + `word-break: break-all`
- `docs/REQUIREMENTS.md` — 新增 §四十三
- `docs/DEVLOG.md` — Phase 54 记录

### Git
- `620841c` — Phase 54 初始修复（remark-breaks + extractText + CopyButton）
- `a7ed4f3` — 代码块换行修复 + 文档补全（CSS-only 方案，未解决根因）

### 二次诊断 — 代码块换行仍未修复

**现象**：用户反馈 `webchat_1772810614` 中代码块仍然不换行。复制出来内容正确（有 `\n`），但页面显示挤在一行。

**根因分析**：
- 原 `CodeBlock` 组件通过 `className` 区分 fenced vs inline code
- 无语言标识的 fenced code block（` ``` ` 不带语言），rehype-highlight 默认 `detect: false`，不添加 class
- `className` 为空 → 走 `if (!className)` 分支 → 渲染为 inline code（无 `white-space: pre-wrap`）
- 上一轮修复只给 `.codeBlock code` 加了 `white-space: pre-wrap`，但该选择器根本不匹配（因为走了 inline 分支）

**修复方案**：重构组件架构
- `FencedCodeBlock`（`components.pre`）：处理所有 fenced code block，保留 `<pre>` 标签
- `InlineCode`（`components.code`）：只处理 inline code
- CSS: 新增 `.codeBlockPre { white-space: pre-wrap; }`

### 改动文件
- `MarkdownRenderer.tsx` — 重构：CodeBlock 拆分为 FencedCodeBlock + InlineCode
- `MarkdownRenderer.module.css` — 新增 `.codeBlockPre`，调整 `.codeBlock code`

### Git
- `5e3541c` — 代码块换行修复：FencedCodeBlock + InlineCode 拆分
- `a53262e` — 代码块多余 padding/空行修复 + 长行横向滚动

### 三次修复：代码块额外 padding + 长行自动换行

**用户反馈**：代码块上下多空行、左边多空格、长行自动折行破坏显示

**根因**：
1. highlight.js 默认 `pre code.hljs { padding: 1em }` 未被覆盖（选择器特异性 0-1-2 > 我们的 0-1-1）→ 多余 padding 导致空行和左侧空格
2. `white-space: pre-wrap` + `word-break: break-all` → 长行自动折行

**修复**：
- `.codeBlock code:global(.hljs)` 选择器（0-2-1）覆盖 highlight.js 默认 padding
- 重置 `padding: 0; margin: 0; background: transparent; color: #c9d1d9; border-radius: 0`
- `white-space: pre; overflow-x: auto` 改为横向滚动条

### 四次修复：代码块溢出撑大消息气泡

**用户反馈**：包含长行的代码块会撑大消息气泡超出右边界，预期是气泡宽度不变，代码块内部出现横向滚动条。

**根因**：flex 布局中子元素默认 `min-width: auto`，`<pre>` 的宽内容逐级撑大 `.codeBlock` → `.markdown` → `.bubble` → `.message`，突破 `max-width: 85%` 约束。

**修复**：
- `.bubble` 加 `min-width: 0`（允许 flex 子元素收缩）
- `.markdown` 加 `overflow: hidden; min-width: 0`（约束代码块在容器内）

### 改动文件汇总
- `MarkdownRenderer.tsx` — 重构 FencedCodeBlock + CodeElement 组件
- `MarkdownRenderer.module.css` — hljs padding 覆盖、横向滚动、容器 overflow 约束
- `MessageList.module.css` — `.bubble` 加 `min-width: 0`

### Git
- `5e3541c` — 代码块换行修复：FencedCodeBlock + InlineCode 拆分
- `a53262e` — 代码块多余 padding/空行修复 + 长行横向滚动
- `cfe618c` — DEVLOG 补充
- `7d8c741` — 代码块溢出修复：约束气泡宽度

### 结果
✅ Phase 54 全部完成（7 个 Issue 全部修复）
