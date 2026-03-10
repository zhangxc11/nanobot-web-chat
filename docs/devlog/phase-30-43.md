# Phase 30-43 归档

## 本文件索引
| Phase | 标题 | 状态 |
|-------|------|------|
| 30 | 配置页面增强 + Session 搜索 + 删除回收站 (Issue #33/#34/#35) | ✅ |
| 32 | 图片输入功能 (Issue #38) | ✅ |
| 33 | 斜杠命令系统 (Issue #40) | ✅ |
| 44 | 斜杠命令失败后输入回填 (Issue #50) | ✅ |
| 47 | Bug 修复 — 后端不可达时消息静默丢失 | ✅ |
| 47.5 | Cache Usage 字段 + 上下文长度展示 (§三十九附) | ✅ |
| 48 | 全链路统一用 session.id 替代 sessionKey (§三十九 Issue #53) | ✅ |
| 34 | Runtime Context 过滤统一收拢 (Issue #41) | ✅ |
| 31 | Gateway 改名 Webserver + URL 编码 Bug 修复 (Issue #36/#37) | ✅ |
| 35 | Session 列表按来源分组 (Issue #42) | ✅ |
| 36 | ProviderPool — Web Chat Provider 切换 (Issue #43) | ✅ |
| 37 | Bug 修复 — SSE 流中断导致前端卡死 | ✅ |
| 38 | LLM 错误响应显示 | ✅ |
| 39 | Message 工具 fallback 显示 + 项目清理 | ✅ |
| 40 | Provider 配置热加载 + 默认模型配置 (Issue #44/#45/#46) | ✅ |
| 41 | API Session 前端辨识 (Issue #47 / B5) | ✅ |
| 42 | Session 树形结构 — 父子关系 + 折叠面板 + 徽章 (§三十四 Issue #48) | ✅ |
| 42.7 | 启发式规则 B 跨通道父子关系匹配 | ✅ |
| 43 | 三级树状 Session 父子关系 (Issue #49) | ✅ |

---

## Phase 30: 配置页面增强 + Session 搜索 + 删除回收站 (Issue #33/#34/#35) ✅

> 对应需求 §二十五 Issue #33 (配置页面对象数组)、Issue #34 (Session 搜索)、Issue #35 (删除回收站)

### T30.1 配置页面支持对象数组展示 (Issue #33) ✅

**问题**：飞书配置改为多租户数组后，配置页面无法正常展示和编辑。

**改动**：
- `ConfigPage.tsx`:
  - 新增 `isObjectArray()` 函数区分简单数组和对象数组
  - `ConfigValue` 对象数组返回 null（交由 ConfigObject 处理）
  - `ConfigObject` 新增对象数组渲染逻辑：每个元素展开为可折叠子面板，标题取 `name` 字段
  - `handleChange` 支持数组索引路径（`Number.isInteger(idx)` 判断）
- `ConfigPage.module.css`: 新增 `.arrayBadge` 样式

### T30.2 Session 搜索功能 (Issue #34) ✅

**改动**：
- `gateway.py`:
  - 新增 `GET /api/sessions/search?q=keyword` 路由
  - `_handle_search_sessions()`: 遍历所有 JSONL 文件，搜索标题和用户消息内容
  - 标题匹配优先排序，每 session 最多 3 条匹配摘要，最多返回 20 条结果
- `frontend/src/services/api.ts`:
  - 新增 `SearchResult` 接口和 `searchSessions()` API
- `frontend/src/pages/chat/Sidebar/Sidebar.tsx`:
  - 新增搜索状态管理（searchQuery, searchResults, searching）
  - 300ms debounce 搜索
  - 搜索结果替代 session 列表展示，点击跳转
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css`:
  - 新增 `.searchBox`, `.searchInput`, `.searchClear`, `.searchResults`, `.searchResultItem` 等样式

### T30.3 删除 Session 改为移入回收站 (Issue #35) ✅

**改动**：
- `gateway.py`:
  - `_handle_delete_session()`: `os.remove()` → `os.rename()` 移入 `sessions/.trash/`
  - 自动创建 `.trash` 目录，同名文件加时间戳后缀

### 改动文件
- `gateway.py` — 搜索 API + 删除回收站
- `frontend/src/services/api.ts` — 搜索 API
- `frontend/src/pages/config/ConfigPage.tsx` — 对象数组支持
- `frontend/src/pages/config/ConfigPage.module.css` — arrayBadge 样式
- `frontend/src/pages/chat/Sidebar/Sidebar.tsx` — 搜索 UI
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css` — 搜索样式
- `docs/REQUIREMENTS.md` — §二十五 Issue #33/#34/#35 + backlog 更新
- `docs/DEVLOG.md` — Phase 30 记录

### Git
- web-chat commit: `53f268b`

---

## Phase 32: 图片输入功能 (Issue #38) ✅

> 对应需求 §二十七 Issue #38
> 支持用户在 Web Chat 中发送图片，利用 Claude 多模态能力理解图片内容

### 任务拆解

由于涉及 worker.py 和 nanobot 核心修改（🔴高风险），在 CLI 中执行全部改动。

#### Step 1: nanobot 核心 — media 参数透传
- ✅ **T32.1** `process_direct()` 增加 `media` 参数，透传给 `_build_user_content()`
- ✅ **T32.2** `AgentRunner.run()` 增加 `media` 参数，透传给 `process_direct()`
- ✅ **T32.3** 测试：CLI 模式下发送图片消息验证

#### Step 2: Worker — 接收并传递 media
- ✅ **T32.4** `worker.py` execute-stream 端点接收 `images` 字段
- ✅ **T32.5** 传递给 `runner.run(media=images)`

#### Step 3: Webserver — 图片上传 + 静态服务
- ✅ **T32.6** `webserver.py` 新增 `POST /api/upload` — multipart 图片上传 API
- ✅ **T32.7** `webserver.py` 新增 `GET /api/uploads/<date>/<filename>` — 图片静态服务
- ✅ **T32.8** `webserver.py` 转发 images 给 worker + 处理多模态 content

#### Step 4: 前端 — 图片交互
- ✅ **T32.9** ChatInput 增加图片选择(📎)/拖拽/粘贴功能
- ✅ **T32.10** 图片预览缩略图 + 上传进度 + 移除按钮
- ✅ **T32.11** 发送时上传图片 + 附带路径
- ✅ **T32.12** MessageItem 中显示用户消息里的图片 (multimodal content 解析)

#### Step 5: 重启 + 验证
- ✅ **T32.13** `restart.sh all` 重启服务
- ✅ **T32.14** 端到端测试：上传蓝色 PNG → 发送 "什么颜色" → Claude 回复 "蓝色" ✅
- ✅ **T32.15** Git commit: `9fc2544`

### 技术细节

#### 多模态消息格式
用户发送带图片的消息时，JSONL 中 user message 的 `content` 为数组：
```json
[
  {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}},
  {"type": "text", "text": "用户的文本消息"},
  {"type": "text", "text": "[Runtime Context]\n..."}
]
```

#### 前端兼容处理
- `Message.content` 类型从 `string` 扩展为 `string | ContentBlock[]`
- `getTextContent()` / `getImageUrls()` 辅助函数统一处理两种格式
- AssistantTurnGroup、ToolProcessCollapsible 等组件全部适配

#### 图片存储
- 上传目录: `~/.nanobot/workspace/uploads/<date>/<uuid>.<ext>`
- URL: `/api/uploads/<date>/<filename>`
- JSONL 中存储 base64 data URL（由 nanobot 核心 `_build_user_content` 编码）

### 改动文件
- nanobot 核心: `agent/loop.py`, `sdk/runner.py` — media 参数透传
- `worker.py` — images 参数接收 + 传递
- `webserver.py` — upload API + image serving + multimodal content 处理
- `frontend/src/types/index.ts` — ContentBlock 类型
- `frontend/src/services/api.ts` — uploadImage + sendMessageStream images
- `frontend/src/store/messageStore.ts` — sendMessage images 参数
- `frontend/src/pages/chat/ChatInput.tsx` — 图片交互全套
- `frontend/src/pages/chat/ChatInput.module.css` — 图片预览/拖拽样式
- `frontend/src/pages/chat/MessageItem.tsx` — multimodal content 渲染
- `frontend/src/pages/chat/MessageList.module.css` — 消息图片样式

---

---

## Phase 33: 斜杠命令系统 (Issue #40) ✅

> 日期：2026-02-27
> 需求：REQUIREMENTS.md §二十九 Issue #40
> Web UI 支持斜杠命令（/help, /new, /stop），与 CLI/Telegram 行为一致

### 需求概述

1. `/help` — 前端本地处理，显示命令帮助（不消耗 token）
2. `/stop` — 前端本地处理，等价于停止按钮
3. `/new` — 发送到后端 agent loop 处理，归档并清空 session

### 实现记录

#### T33.1 前端 messageStore: 斜杠命令拦截逻辑 ✅
- `sendMessage()` 在 `task.sending` 检查之前拦截斜杠命令
- `/help`: 插入 `system-local` 消息显示命令列表
- `/stop`: 有任务时调用 `cancelTask()`，无任务时显示提示
- `/new`: 检查任务状态，发送到后端 agent loop 处理
- 未知命令: 显示提示信息
- ChatInput `handleSend()` 也拦截 `/stop`（处理 inject 模式）

#### T33.2 前端 types: 新增系统消息类型 ✅
- `Message.role` 扩展支持 `'system-local'`
- 新增 `SystemMessage` 接口
- `MessageGroup.type` 扩展支持 `'system'`

#### T33.3 前端 MessageItem: 系统消息渲染样式 ✅
- `groupMessages()` 识别 `system-local` role，创建 `system` 类型分组
- `MessageItem` 新增 `system-local` 渲染分支（居中、灰色背景、圆角）
- CSS: `.systemMessage` + `.systemBubble` 样式

#### T33.4 前端 ChatInput: placeholder 更新 ✅
- 正常模式: "输入消息或 /help 查看命令 (Shift+Enter 发送)"
- 执行中: "输入补充信息或 /stop 停止 (Shift+Enter 注入)"

#### T33.5 构建 + 测试 + Git 提交 ✅
- TypeScript 编译通过
- Vite 构建通过

### 改动文件
- `frontend/src/types/index.ts` — Message.role 扩展 + SystemMessage 类型
- `frontend/src/store/messageStore.ts` — v21 斜杠命令拦截 + _makeSystemMsg
- `frontend/src/pages/chat/ChatInput.tsx` — /stop 拦截 + placeholder 更新
- `frontend/src/pages/chat/MessageItem.tsx` — system-local 渲染 + MessageGroup 扩展
- `frontend/src/pages/chat/MessageList.tsx` — system 分组渲染
- `frontend/src/pages/chat/MessageList.module.css` — .systemMessage + .systemBubble
- `docs/REQUIREMENTS.md` — §二十九 Issue #40
- `docs/ARCHITECTURE.md` — §十五 斜杠命令系统
- `docs/DEVLOG.md` — Phase 33 记录

---

## Phase 44: 斜杠命令失败后输入回填 (Issue #50)

> 日期：2026-03-07
> 需求：REQUIREMENTS.md §三十六 Issue #50
> 纯前端改动（🟢 安全），不涉及后端

### 需求概述

用户输入以 `/` 开头的非命令内容（如文件路径），被 slash 命令系统识别为未知命令后，输入框已被清空。需要在未知命令时回填原始输入，方便用户修改后重新发送。

### 任务清单

- ✅ **T44.1** `messageStore.ts` — unknown command 分支回填 draft
  - 在 `default` (unknown slash command) 分支中，显示错误提示后调用 `get().setDraft(sessionId, content)` 回填原始输入
- ✅ **T44.2** `ChatInput.tsx` — draft 变化时重新计算 textarea 高度
  - `adjustHeight` useEffect 依赖数组增加 `text`，确保 draft 回填后 textarea 高度正确调整
- ✅ **T44.3** 前端构建 + 验证 + Git 提交

### 改动文件
- `frontend/src/store/messageStore.ts` — unknown command 分支 `setDraft()` 回填
- `frontend/src/pages/chat/ChatInput.tsx` — adjustHeight useEffect 增加 `text` 依赖

---

## Phase 47: Bug 修复 — 后端不可达时消息静默丢失 (2026-03-08)

> 分支：`main`

### 问题

用户发送消息时后端正好在重启（webserver 宕机），fetch POST 直接失败。前端 `sendMessage` 的 catch 块中 `isConnectionError` 正则匹配到 `"Failed to fetch"` 后误入 poll recovery 分支（`_pollTaskStatus`），但消息从未到达后端，poll 毫无意义。poll 多次后超时放弃，显示"请刷新页面查看结果"。用户刷新后消息消失——**消息静默丢失**。

### 根因

`isConnectionError` 正则无差别匹配了两种不同性质的错误：
1. **fetch 失败**（`"Failed to fetch"` / `"网络错误"`）— 消息未送达后端
2. **SSE 中途断开**（`"SSE connection reset — task may still be running"`）— 消息已送达，任务可能仍在运行

修改前两种错误都走 poll recovery 分支，但 fetch 失败时 poll 完全无意义。

### 修复

在 `sendMessage` 的 catch 块中，新增 `isSseDisconnect` 和 `isFetchFailure` 两个判断：

- **`isSseDisconnect`**：错误消息匹配 `"SSE connection reset"` 或 `"task may still be running"` → 保持现有 poll recovery 行为不变
- **`isFetchFailure`**：`isConnectionError && !isSseDisconnect` → 新行为：
  - 回滚 optimistic update（移除前端临时添加的 `userMsg`）
  - 重置 sending 状态，允许用户重新发送
  - 显示明确的错误提示："消息发送失败（服务暂不可用），请稍后重试"

### 副作用评估

| 错误类型 | 修改前行为 | 修改后行为 | 影响 |
|----------|-----------|-----------|------|
| fetch 失败 | 静默丢失 + 无意义 poll | 提示重试 + 回滚 | ✅ 改善 |
| SSE 断开 | poll recovery | poll recovery（不变） | ✅ 无影响 |
| HTTP 错误 | 直接显示错误 | 直接显示错误（不变） | ✅ 无影响 |
| 业务错误 | 直接显示错误 | 直接显示错误（不变） | ✅ 无影响 |

### 改动文件
- `frontend/src/store/messageStore.ts` — sendMessage catch 块区分 fetch 失败 vs SSE 断开
- `docs/DEVLOG.md` — Phase 47 记录

---

*每次 session 更新此文件后 commit。*

---

## Phase 47.5: Cache Usage 字段 + 上下文长度展示 (§三十九附)

> 日期：2026-03-09
> 需求：REQUIREMENTS.md §三十九（附） / nanobot core §32 配套
> 架构：ARCHITECTURE.md §十八
> Commit：`a4ba99e`

### 概述

配合 nanobot core §32 cache control 策略优化，web-chat 侧完成 cache 数据的存储、查询和前端展示。

### 改动

#### 1. analytics.py — schema + migration + 查询
- Schema 新增 `cache_creation_input_tokens` / `cache_read_input_tokens` 列 (DEFAULT 0)
- `_MIGRATION_SQL` + `_migrate()` 自动升级旧数据库
- 所有查询方法 (get_global_usage, get_session_usage, get_daily_usage, by_model, by_session) 增加 cache 字段聚合

#### 2. worker.py — on_usage callback
- `on_usage()` 透传 `cache_creation_input_tokens` / `cache_read_input_tokens` 到 SSE

#### 3. 前端 — api.ts + 3 个组件
- `api.ts`: Usage 接口增加可选 cache 字段
- `UsageIndicator`: 折叠态显示上下文长度；展开态显示 cache 明细
- `UsagePage`: 增加 cache 汇总卡片
- `MessageItem`: 工具摘要增加 cache 信息

### 测试

- ✅ `test_analytics.py` 新增 10 个 cache 测试 (TestCacheFields × 7 + TestCacheMigration × 3)，总计 36 passed

---

## Phase 48: 全链路统一用 session.id 替代 sessionKey (§三十九 Issue #53)

> 日期：2026-03-09
> 需求：REQUIREMENTS.md §三十九 Issue #53
> 方案详情：docs/ISSUE_SESSION_KEY_DEDUP.md

### 任务清单

#### Phase 1: 前端改动（修复核心 bug）

- [x] **T48.1** `SessionList.tsx` — `buildSessionTree()` 全部改用 `id`
  - `nodeByKey` key 改为 `s.id`
  - `allSessionKeys` → `allSessionIds`，收集 `s.id`
  - `childSessionKeys` → `childSessionIds`，收集 `s.id`
  - `sessionByKey` 只写 `s.id`

- [x] **T48.2** `SessionList.tsx` — `resolveParent()` 改为基于 id 格式
  - 参数从 `allSessionKeys` 改为 `allSessionIds: Set<string>`
  - 查找 parentMap 用 id
  - subagent 启发式：从 id 提取（`subagent_` 前缀，`_` 分隔）
  - webchat 启发式：从 id 提取（`webchat_` 前缀，`_` 分隔）
  - 精确匹配 `endsWith('_' + ts)` 替代 `endsWith(':' + ts)`

- [x] **T48.3** `SessionList.tsx` — `getChannel()` 改为从 id 提取
  - 取第一个 `_` 或 `.` 之前的部分作为 channel

- [x] **T48.4** `SessionList.tsx` — 所有 React key、expandedKeys、tagsMap 查找改用 id

- [x] **T48.5** `sessionStore.ts` — `toggleDone()` 中 key 改用 `session.id`

#### Phase 2: 后端 + 数据迁移

- [x] **T48.6** `webserver.py` — `_handle_patch_tags()` 改为直接用 `session_id` 存 tags

- [x] **T48.7** 迁移脚本 — `migrate_session_keys_to_ids.py`
  - 扫描所有 JSONL 建立 `sessionKey → [id...]` 映射
  - 迁移 `session_tags.json`：sessionKey → id（重复 key 的 tags 复制到每个 id）
  - 迁移 `session_parents.json`：key 和 value 都从 sessionKey 转为 id
  - 版本检测：webserver 启动时检查 tags/parents 是否含有 `:` 格式的 key，报错引导迁移
  - 迁移结果：96 个 sessionKey 格式 → 101 个 id 格式（tags），103 个 key + 105 个 value（parents）

#### Phase 3: 清理验证

- [x] **T48.8** TypeScript 编译 + Vite build 通过
- [x] **T48.9** Git 提交 — commit `5b17ad8`

### 改动文件
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — getChannel/resolveParent/buildSessionTree 全面改用 id
- `frontend/src/store/sessionStore.ts` — toggleDone 改用 session.id
- `webserver.py` — _handle_patch_tags 改为直接用 session_id 存 tags
- `migrate_session_keys_to_ids.py` — 迁移脚本（新建）
- `docs/REQUIREMENTS.md` — §三十九 Issue #53
- `docs/DEVLOG.md` — Phase 48 记录

---

## Phase 34: Runtime Context 过滤统一收拢 (Issue #41) ✅

> 对应需求 Issue #41

### 问题
webserver.py 中 5-6 处分散的 `[Runtime Context]` 过滤逻辑，代码重复且存在 bug：
- multimodal 消息先拼接 text blocks 再 strip，空格分隔导致正则匹配失败
- session 列表 summary 泄露 Runtime Context 内容

### 修复
1. 提取模块级 `strip_runtime_context(content)` 统一函数
2. 预编译正则 `_RC_PATTERN = re.compile(r'(?:^|\n)\s*\[Runtime Context\].*', re.DOTALL)`
3. 同时处理 string 和 multimodal list 两种格式
4. 修复处理顺序：先 strip 再 flatten（先清理原始 content，再拼接 text）
5. 所有 5 处调用统一替换

### 改动文件
- `webserver.py` — 新增 `strip_runtime_context()` 函数，替换 5 处分散过滤逻辑
- `docs/REQUIREMENTS.md` — Issue #41
- `docs/DEVLOG.md` — Phase 34 记录

### Git
- web-chat commit: `d895365`

---

## Phase 31: Gateway 改名 Webserver + URL 编码 Bug 修复 (Issue #36/#37) ✅

> 对应需求 §二十六 Issue #36 (命名优化)、Issue #37 (URL 编码 Bug)

### T31.1 URL 编码 Bug 修复 (Issue #37) ✅

**问题**：文件名含 `%3A` 的 session（如 `test%3Ainject_e2e2.jsonl`）无法加载消息和删除。
**根因**：前端 `encodeURIComponent("test%3Ainject_e2e2")` 产生双重编码 `test%253Ainject_e2e2`，后端 `_parse_path()` 不做 URL decode，导致不匹配。
**修复**：`_parse_path()` 中增加 `urllib.parse.unquote()` 解码。

### T31.2 Gateway 改名为 Webserver (Issue #36) ✅

**改动**：
- `gateway.py` → `webserver.py`（文件重命名 + 内部 class/logger/service name 更新）
- `restart-gateway.sh` → `restart.sh`（脚本重命名 + 子命令 `webserver` 替代 `gateway`）
- 日志文件：`/tmp/nanobot-gateway.log` → `/tmp/nanobot-webserver.log`
- `start.sh` 更新引用
- `frontend/src/services/api.ts` 注释更新
- `docs/GUIDELINES.md` 所有 gateway 引用更新

### 改动文件
- `gateway.py` → `webserver.py`
- `restart-gateway.sh` → `restart.sh`
- `start.sh`
- `frontend/src/services/api.ts`
- `docs/REQUIREMENTS.md` — §二十六 Issue #36/#37
- `docs/GUIDELINES.md` — gateway → webserver
- `docs/DEVLOG.md` — Phase 31 记录

### Git
- web-chat commit: `aeb2fa0`

---

## Phase 35: Session 列表按来源分组 (Issue #42) ✅

> 日期：2026-02-28
> 需求：REQUIREMENTS.md §三十 Issue #42
> Session 列表按来源（channel）分组显示，提升多来源 session 管理体验

### 需求概述

随着 session 来源多样化（网页、命令行、飞书、Telegram 等），平铺的 session 列表查找不便。按 channel 分组显示，每组带图标标题，可折叠/展开。

### 实现记录

#### 分组逻辑
- 从 `sessionKey` 的冒号前缀提取 channel（如 `feishu.lab:xxx` → `feishu`）
- 支持子 channel 归并（`feishu.lab`、`feishu.ST` → 统一归入 `feishu` 组）
- 分组配置表定义图标、标题和固定排序（webchat 优先）
- 只有一个分组时不显示分组头（保持简洁）

#### Channel 分类

| Channel 前缀 | 分组名 | 图标 | 排序 |
|--------------|--------|------|------|
| `webchat` | 网页对话 | 🌐 | 0 |
| `cli` | 命令行 | 💻 | 1 |
| `feishu` | 飞书 | 💬 | 2 |
| `telegram` | Telegram | ✈️ | 3 |
| `discord` | Discord | 🎮 | 4 |
| `test` | 测试 | 🧪 | 5 |
| 其他 | 其他 | 📁 | 6 |

### 改动文件
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — 分组逻辑 + ChannelGroupHeader 组件
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css` — 分组头样式
- `docs/REQUIREMENTS.md` — §三十 Issue #42
- `docs/DEVLOG.md` — Phase 35 记录

### Git
- web-chat commit: `cae2b51`

---

## Phase 36: ProviderPool — Web Chat Provider 切换 (Issue #43)

> 日期：2026-03-01
> 需求：运行时 Provider 动态切换（webchat 侧）
> 核心依赖：nanobot Phase 16 ProviderPool（详见 nanobot `docs/DEVLOG.md` Phase 16）

### 需求概述

1. Worker 维护模块级 ProviderPool 单例，提供 `GET/PUT /provider` API
2. Webserver 转发 `/api/provider` 到 Worker
3. 前端 `/provider` 斜杠命令 + provider 选择器 UI
4. 任务执行中前后端都禁止切换

### 任务清单

- ✅ **T36.1** Worker: 模块级 ProviderPool 单例 + GET/PUT /provider 端点
  - `_get_pool()` / `_build_pool()` 从 config 构建 ProviderPool 单例
  - `_create_runner()` 基于 Pool 当前 active 状态构建 runner
  - `GET /provider` 返回 active + available
  - `PUT /provider` 切换（任务执行中返回 409）

- ✅ **T36.2** Webserver: 转发 `/api/provider`
  - `GET /api/provider` → worker `GET /provider`
  - `PUT /api/provider` → worker `PUT /provider`

- ✅ **T36.3** 前端: provider API + store
  - `api.ts` 新增 `getProvider()` / `setProvider()` + `ProviderInfo` 接口
  - `store/providerStore.ts` 新建 provider 状态管理

- ✅ **T36.4** 前端: `/provider` 斜杠命令
  - `messageStore.ts` 拦截 `/provider` 命令
  - 调 API 查询/切换，显示 system-local 消息

- ✅ **T36.5** 前端: ChatInput provider 选择器 UI + CSS
  - 输入框上方 provider + model 选择器
  - 任务执行中 disabled
  - 点击外部自动关闭下拉框

- ✅ **T36.6** 构建 + 测试 + Git 提交

---

## Phase 37: Bug 修复 — SSE 流中断导致前端卡死

> 日期：2026-03-01
> 诊断文档：`docs/BUG_SSE_FREEZE.md`
> 分支：`fix/sse-freeze`

### 根因分析

SSE 流中断后前端 UI 卡死（sending 状态永远不重置）。诊断发现 4 个问题：

1. **Worker 无心跳** — Worker SSE 流在 agent 等待 LLM 响应时长时间无数据，webserver 的 urllib socket read timeout 触发
2. **Webserver SSE 污染**（最严重）— SSE 超时后 webserver 在已发送 200+SSE headers 的流中调用 `_send_json(500)`，混入 HTTP 响应头+JSON body 污染 SSE 流
3. **前端 recovery 正则不匹配** — `isConnectionError` 正则 `/fetch|network|abort|reset|refused/i` 不匹配 `timed out` 和 `SSE connection reset`，导致走 business error 分支不触发 recovery 轮询
4. **Worker done 事件竞态** — `_notify_sse` 发送 done 事件和 `_attach_to_existing_task` 的 while 循环退出之间可能有时序问题

### 任务清单

- ✅ **T37.1** Worker: SSE 心跳 keepalive
  - `_attach_to_existing_task` 的 while 循环中每 15 秒发送 `: keepalive\n\n` 注释行
  - 防止 webserver urllib socket read timeout

- ✅ **T37.2** Webserver: SSE 超时后不污染响应流
  - 添加 `sse_headers_sent` 标志追踪 SSE headers 是否已发送
  - 新增 `_send_sse_error()` 方法：SSE 已发送时用标准 SSE error 事件代替 `_send_json(500)`
  - 跳过 worker keepalive 注释行（`:` 开头），不转发给前端

- ✅ **T37.3** 前端: recovery 正则扩展
  - `isConnectionError` 正则增加 `timeout|timed|connection|running` 匹配（两处）
  - 确保 SSE 中断类错误都能触发 recovery 轮询

- ✅ **T37.4** 构建 + 测试 + 更新 BUG 文档 + Git 提交
  - `npm run build` ✅ (523 modules, 969ms)
  - 服务重启验证 ✅
  - BUG_SSE_FREEZE.md 更新为已修复 ✅

---

## Phase 38: LLM 错误响应显示 (2026-03-03)

> 分支：`main`

### 背景

合并 upstream 后，`finish_reason="error"` 的 LLM 响应不再写入 JSONL session 文件。
导致：
1. Web 前端看不到错误信息（JSONL 中无记录，重载后消失）
2. SSE 流正常发送 `done` 事件但无错误内容
3. 错误信息只出现在日志中

### 修复方案

**后端（nanobot core `loop.py`）**：
- 在 `finish_reason="error"` 分支中，将错误消息以 `"Error calling LLM: {text}"` 前缀存入 JSONL
- 调用 `callbacks.on_message()` 通知前端
- 调用 `on_progress()` 发送 `❌` 前缀的 SSE progress 事件
- `get_history()` Phase 2 自动过滤 `"Error calling LLM:"` 前缀的消息，防止 LLM context 中毒

**前端（web-chat `MessageItem.tsx`）**：
- 检测 `"Error calling LLM:"` 前缀的 assistant 消息
- 剥离前缀，显示干净的错误文本 + ❌ 图标
- 错误气泡使用红色调背景和边框（`.errorBubble` 样式）
- 在 `AssistantTurnGroup` 和独立 `MessageItem` 中均生效

### 任务清单

- ✅ **T38.1** `loop.py` — 错误响应持久化 + callback 通知
- ✅ **T38.2** `MessageItem.tsx` — 错误消息检测与样式化
- ✅ **T38.3** `MessageList.module.css` — 错误气泡 CSS
- ✅ **T38.4** `test_error_response.py` — 5 个新测试全部通过
- ✅ **T38.5** 全量测试 334 passed + 前端构建 + 服务重启


---

## Phase 39: Message 工具 fallback 显示 + 项目清理 (2026-03-04)

> 分支：`main`

### 问题 1: Message 工具内容不显示

当 agent 使用 `message` 工具作为最终输出时（而非直接返回文本），nanobot loop 检测到 `_sent_in_turn=True`，suppress 掉最终的 OutboundMessage。JSONL 中最后一条 assistant 消息的 `content=null`。

前端 `AssistantTurnGroup` 查找 final reply 时只找"没有 tool_calls 且有 content 的 assistant 消息"，因此找不到 final reply，用户看不到 agent 的最终回复。

**修复**：在 `AssistantTurnGroup` 中增加 **Step 1b fallback**：
1. 当找不到正常的 `finalReplyMsg` 时
2. 从后往前搜索 `message` 工具调用，解析其 `arguments.content`
3. 将该 content 作为 `messageToolContent` 渲染为 Markdown final reply

**历史消息兼容**：JSONL 中 `tool_calls[].function.arguments` 完整保存了 message content JSON，API 返回时原样传递，前端解析提取，历史加载完全兼容。

### 问题 2: start.sh 与 restart.sh Python 检测不一致

`start.sh` 硬编码 `python3`，而 `restart.sh` 有 `NANOBOT_PYTHON` 自动检测逻辑。

**修复**：同步 start.sh 的 Python 检测逻辑，与 restart.sh 保持一致。

### 问题 3: 历史遗留文件清理

以下文件是早期开发遗留，已被 `webserver.py` + `worker.py` + React 前端完全替代：
- `server.py` — 旧版单文件后端（v1，端口 8080）
- `server_v2.py` — 过渡版后端（v2，端口 8081，后拆分为 webserver + worker）
- `server.log` — 旧版日志文件
- `index.html` — 旧版单文件前端

**处理**：从 git 跟踪中移除并删除。

### 任务清单

- ✅ **T39.1** `MessageItem.tsx` — message 工具 fallback 逻辑
- ✅ **T39.2** `start.sh` — 同步 Python 自动检测逻辑
- ✅ **T39.3** 删除历史遗留文件（server.py, server_v2.py, server.log, index.html）
- ✅ **T39.4** 前端构建 + 服务重启
- ✅ **T39.5** Git 提交（含 restart.sh 未提交的改动）

### 改动文件
- `frontend/src/pages/chat/MessageItem.tsx` — message 工具 fallback 显示
- `start.sh` — Python 检测逻辑同步
- `restart.sh` — Python 自动检测（上次未提交的改动）
- 删除：`server.py`, `server_v2.py`, `server.log`, `index.html`
- `docs/DEVLOG.md` — Phase 39 记录

---

## Phase 40: Provider 配置热加载 + 默认模型配置 (Issue #44/#45/#46)

> 日期：2026-03-04
> 需求：REQUIREMENTS.md §三十三
> 涉及 nanobot 核心 + web-chat worker + webserver + 前端

### 问题诊断

1. **Provider 不显示**：Worker `_provider_pool` 是模块级单例，启动时构建后不再更新。config 新增 gemini/custom 后，不重启 worker 就看不到。
2. **配置保存不生效**：`PUT /api/config` 只写文件，不通知 worker reload。
3. **默认模型硬编码**：`_PROVIDER_DEFAULT_MODELS` 在 `commands.py` 中硬编码，用户无法自定义每个 provider 的偏好模型。

### 任务清单

- ✅ **T40.1** nanobot 核心: `ProviderConfig` 新增 `preferred_model` 字段
  - `config/schema.py`: `preferred_model: str | None = None`
  - `cli/commands.py`: `_make_provider()` 优先使用 `preferred_model`
  - nanobot core commit: `2f62f59`

- ✅ **T40.2** Worker: `POST /provider/reload` 端点
  - 重新调用 `_build_pool()` 替换单例
  - 尝试保持当前 active provider
  - 任务运行中返回 409

- ✅ **T40.3** Webserver: 转发 + config 保存后自动 reload
  - `POST /api/provider/reload` 转发到 worker
  - `_handle_put_config` 保存成功后调用 reload（best-effort，不阻塞保存）

- ✅ **T40.4** 前端: ConfigPage 保存后刷新 provider
  - `ConfigPage.tsx`: 保存成功后调用 `providerStore.fetchProvider()`
  - 显示 reload 状态信息

- ✅ **T40.5** 前端构建通过

- ✅ **T40.6** 服务重启 + 端到端验证 + 文档更新 + Git push
  - Worker PID 26129 运行正常，5 个 provider 全部显示
  - POST /provider/reload 在任务运行时正确返回 409
  - 代理端点 /api/provider/reload 正常转发

### 验证结果

- ✅ `GET /provider` 返回 5 个 provider（含 custom + gemini）
- ✅ `POST /provider/reload` 任务运行时返回 409（保护机制）
- ✅ webserver 代理 `/api/provider/reload` 正常转发
- ✅ nanobot core 334 tests passed
- ✅ 前端构建通过
- ✅ 服务重启后功能正常

---

## Phase 41: API Session 前端辨识 (Issue #47 / B5)

> 日期：2026-03-06
> 需求：REQUIREMENTS.md §三十四 Issue #47（从 Backlog #15 提升，对应 eval-bench 改进需求 B5）
> 纯前端改动（🟢 安全），不涉及后端

### 需求概述

webchat 分组下 126 个 session 中有 54 个是 API 程序化创建的（dispatch/worker/qa_r2 等），与 71 个手动 session 混在一起。需要在 webchat 分组内增加子分组，将 API session 默认折叠，让手动 session 更易找到。

### 识别规则

webchat channel 下，session_key 冒号后部分：
- **纯数字** → 手动创建（如 `webchat:1772030778`）
- **包含非数字字符** → API 创建（如 `webchat:dispatch_1772696251_gen1`）

### 任务清单

- ✅ **T41.1** `SessionList.tsx` — 新增 `isApiSession()` 辅助函数 + webchat 子分组逻辑
  - 在 channel 分组后，对 webchat 组拆分为 manual + api 两部分
  - 新增 `ApiSessionSubgroup` 组件（🤖 自动任务，默认折叠）
  - 手动 session 正常渲染在分组头下方，api session 在子分组内
  - `ChannelGroup` 接口扩展 `apiSessions` 字段
  - `renderGroupSessions` 统一渲染逻辑（单/多分组复用）

- ✅ **T41.2** `Sidebar.module.css` — 新增子分组头样式
  - `.apiSubgroupHeader`：比 channel 分组头更小更紧凑（padding-left: 16px 缩进）
  - `.apiSubgroupSessions`：padding-left: 8px 子分组内 session 缩进
  - 字体/图标尺寸比 channel 分组头小一号

- ✅ **T41.3** 前端构建 + 验证 + Git 提交
  - TypeScript 编译通过
  - Vite 构建通过（523 modules, 1.04s）
  - Git commit: `d04d91c`

### 识别规则实现

```typescript
function isApiSession(sessionKey: string): boolean {
  // webchat:1772030778 → 纯数字 → 手动创建
  // webchat:dispatch_1772696251_gen1 → 含非数字 → API 创建
  const suffix = sessionKey.substring(sessionKey.indexOf(':') + 1);
  return !/^\d+$/.test(suffix);
}
```

### 改动文件
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — isApiSession + ChannelGroup.apiSessions + ApiSessionSubgroup 组件 + renderGroupSessions 统一 + subagent channel 支持
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css` — .apiSubgroup* 样式
- `docs/REQUIREMENTS.md` — §三十四 Issue #47 + Backlog #15 移除 + Backlog #17 新增
- `docs/DEVLOG.md` — Phase 41 记录

### nanobot 核心联动改动
- `nanobot/agent/subagent.py` — subagent session key 格式从 `subagent:{task_id}` 改为 `subagent:{parent_key_sanitized}_{task_id}`
- `docs/REQUIREMENTS.md` §二十四 — 更新 persist session key 格式说明
- `docs/ARCHITECTURE.md` §十一 — 更新 session key 格式和依赖关系表
- nanobot commit: `f2d456f`

### Git
- web-chat commits: `d04d91c` (main feature), `0532e61` (subagent channel)
- nanobot commit: `f2d456f` (subagent session key format)

---

## Phase 42: Session 树形结构 — 父子关系 + 折叠面板 + 徽章 (§三十四 Issue #48)

> 日期：2026-03-06
> 需求：API session 支持父子关系树形展示，子 session 折叠在父 session 下方

### 需求概述

API 创建的 session 之间存在父子关系（如 dispatch → worker），需要在侧边栏以树形结构展示：
1. 根 session 显示后代数量徽章
2. 子 session 可折叠/展开
3. 总清单计数只数根节点

### 数据源

#### 1. 映射文件 `session_parents.json`
- 位置：`~/.nanobot/workspace/sessions/session_parents.json`
- 格式：`{ "子session_key": "父session_key" }`
- 后端 API：`GET /api/sessions/parents` 返回映射

#### 2. 启发式规则（前端）
- `subagent:{parent_key_sanitized}_{task_id}` → 提取 parent key
- 映射文件优先，启发式作为补充

### 任务清单

- ✅ **T42.1** 后端：`GET /api/sessions/parents` API
  - `webserver.py` 新增路由，读取 `session_parents.json` 返回
  - `api.ts` 新增 `fetchSessionParents()` API

- ✅ **T42.2** 前端：`sessionStore` 加载 parentMap
  - `fetchSessions()` 同时拉取 parentMap
  - `parentMap: Record<string, string>` 状态字段

- ✅ **T42.3** 前端：`SessionList.tsx` 树形结构构建
  - `buildSessionTree()` 函数：映射文件 + subagent 启发式 → 树形节点
  - `TreeNode` 接口：session + children + descendantCount
  - 底层向上计算 descendantCount

- ✅ **T42.4** 前端：树形渲染 UI
  - 根 session 显示蓝色数字徽章（descendantCount）
  - 可折叠子 session 面板（"收起/展开 N 个子 session"）
  - 子 session 缩进 + 箭头指示器
  - 递归渲染支持多级嵌套

- ✅ **T42.5** Bug 修复：根 session 徽章被 overflow 截断
  - 问题：`.sessionSummary` 的 `overflow: hidden` + `text-overflow: ellipsis` 把徽章裁掉
  - 修复：文本包到 `.sessionSummaryText` span，truncation 只作用于文本，徽章 `flex-shrink: 0` 始终可见

- ✅ **T42.6** 总清单计数修正
  - 分组标题旁的 session 计数只数根节点（`group.roots.length`），不含子 session

### 改动文件
- `webserver.py` — `GET /api/sessions/parents` 路由
- `frontend/src/services/api.ts` — `fetchSessionParents()` API
- `frontend/src/store/sessionStore.ts` — `parentMap` 状态 + 加载逻辑
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — 树形结构全面重写（buildSessionTree, TreeNode, 递归渲染, 徽章, 折叠面板）
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css` — 树形节点样式（treeNodeRow, treeChildrenContainer, childBadge, sessionSummaryText 等）

### Git
- web-chat commit: (pending — 含 Phase 42.7)

---

## Phase 42.7: 启发式规则 B 跨通道父子关系匹配 (2026-03-06)

> Phase 42 的增强补丁

### 问题

启发式规则 B 硬编码拼接 `webchat:` 前缀作为父 session key：
```typescript
return 'webchat:' + tsMatch[1];  // 始终拼 webchat: 前缀
```

当从 CLI 或飞书通道通过 web-subsession 创建子 session 时：
- 子 session: `webchat:dispatch_1772603563_gen1`
- 父 session: `cli:1772603563`（不是 `webchat:1772603563`）
- 启发式规则拼出 `webchat:1772603563`，但该 session 不存在 → 父子关系丢失

### 修复

`resolveParent()` 不再硬编码 `webchat:` 前缀，改为在所有已加载 session 中搜索以 `:<timestamp>` 结尾的 session key：

```typescript
// 旧：return 'webchat:' + tsMatch[1];
// 新：遍历 allSessionKeys，找 endsWith(':' + ts) 的 session
for (const candidate of allSessionKeys) {
  if (candidate.endsWith(':' + ts)) return candidate;
}
```

**函数签名变更**：
- `resolveParent(session, parentMap)` → `resolveParent(session, parentMap, allSessionKeys?)`
- `buildSessionTree()` 构建 `allSessionKeys: Set<string>` 并传入

### 跨通道匹配验证

| 子 session | 匹配的父 session |
|-----------|----------------|
| `webchat:dispatch_1772696251_gen1` | `webchat:1772696251` ✅ |
| `webchat:dispatch_1772603563_gen1` | `cli:1772603563` ✅ |
| `webchat:worker_1772376517_task005` | `feishu.lab:1772376517` ✅ |
| `webchat:1772778886`（普通 session） | null（不匹配）✅ |

### 改动文件
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — resolveParent 跨通道搜索 + allSessionKeys 参数
- `docs/REQUIREMENTS.md` — 启发式规则 B 描述更新为"跨通道搜索"

---

## Phase 43: 三级树状 Session 父子关系 (Issue #49)

> 日期：2026-03-06
> 需求：REQUIREMENTS.md §三十五 Issue #49
> batch 调度场景下 session 父子关系从扁平化升级为三级树状结构

### 需求概述

batch-orchestrator 场景下，调度和 Worker 都扁平挂在主控下，无法区分哪些 Worker 属于哪个调度。
需要体现三级树：主控 → 调度 → Worker。

### 方案（G 方案）

1. **调度 session 命名**：`webchat:dispatch_<主控ts>_<调度自身ts>`（含双 timestamp）
2. **Worker session 命名**：`webchat:worker_<调度ts>_<detail>`（parent_ref 指向调度的 ts）
3. **前端启发式规则 B 扩展**：提取 timestamp 后，先精确匹配 `endsWith(':' + ts)`，再后缀匹配 `endsWith('_' + ts)`

### 任务清单

- ✅ **T43.1** `SessionList.tsx` `resolveParent()` — 扩展启发式规则 B
  - 新增 Priority b：`endsWith('_' + ts)` 后缀匹配
  - 排除自身（`candidate !== sk`）避免自引用
  - 注释更新说明三级树支持

- ✅ **T43.2** `skills/web-subsession/SKILL.md` — 更新命名规范
  - 新增"三级树状结构"章节，含完整示例
  - 更新父子关系识别规则（精确匹配 + 后缀匹配）
  - 更新文件名映射示例
  - 更新跨通道使用示例
  - 更新路径 A 和脚本工具示例

- ✅ **T43.3** `skills/batch-orchestrator/SKILL.md` — 更新命名规范
  - 角色分工图增加 session_key 格式说明
  - §3 重写为三级树状结构，含调度和 Worker 命名格式
  - 新增父子关系自动识别表（精确匹配 + 后缀匹配）
  - 新增调度 ts 生成代码示例
  - 更新跨通道使用说明

- ✅ **T43.4** `docs/REQUIREMENTS.md` — 新增 §三十五 Issue #49

- ✅ **T43.5** 前端构建通过
  - TypeScript 编译 ✅
  - Vite 构建 ✅ (523 modules, 998ms)

- ✅ **T43.6** MEMORY.md 更新 + Git 提交

### 向后兼容

- 旧的扁平命名（`worker_<主控ts>_xxx`）仍能被精确匹配到主控，显示为扁平（不报错）
- 新规则只增加了 `endsWith('_' + ts)` 备选搜索，不影响现有匹配

### 改动文件
- `frontend/src/pages/chat/Sidebar/SessionList.tsx` — resolveParent 扩展启发式规则 B
- `skills/batch-orchestrator/SKILL.md` — 三级树状命名规范
- `skills/web-subsession/SKILL.md` — 三级树状命名规范 + 跨通道更新
- `docs/REQUIREMENTS.md` — §三十五 Issue #49
- `docs/DEVLOG.md` — Phase 43 记录

---
