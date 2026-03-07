# nanobot Web Chat UI 需求文档

> 状态：**需求已确认（V1）** | 最后更新：2026-02-25

---

## 一、现有系统概述

### 技术栈
- **后端**：Python 3 `http.server`，代理调用 `nanobot` CLI
- **前端**：单文件 `index.html`（原生 HTML/CSS/JS，无框架）
- **数据**：Session 以 `.jsonl` 文件存储在 `~/.nanobot/workspace/sessions/`

### 现有功能
1. 顶部 Header：显示 logo、在线状态、Session 下拉选择器
2. Tab 栏：「💬 聊天」和「📜 会话历史」两个 Tab
3. 聊天面板：用户发消息 → 调用后端 `/chat` → 显示回复（纯文本）
4. 历史面板：选择 Session 后加载 `.jsonl` 中的历史消息（只读浏览）
5. 消息展示：纯文本 `pre-wrap`，无 Markdown 渲染，无代码高亮

### 现有问题
- Session 管理不直观（下拉框 + 独立的历史 Tab）
- 聊天和历史是割裂的（聊天 Tab 不显示历史，历史 Tab 不能继续聊天）
- 消息渲染简陋（纯文本，无 Markdown/代码高亮）
- Tab 功能定位不清晰，不具备扩展性

---

## 二、新功能需求

### 2.1 整体布局

```
┌──────────────────────────────────────────────────┐
│  [💬 对话] [⚙️ 配置] [🧠 记忆] [🔧 Skill]  Tab栏  │
├────────┬─────────────────────────────────────────┤
│        │                                         │
│ Session│           聊天消息区域                    │
│  导航栏 │     (Markdown渲染 + 代码高亮)            │
│        │     (Tool调用结果折叠显示)                │
│ [新建]  │                                         │
│ ────── │                                         │
│ Sess 1 │─────────────────────────────────────────│
│ Sess 2 │         [消息输入框]  [发送]              │
│ Sess 3 │                                         │
│  ...   │                                         │
│ [折叠◀] │                                         │
└────────┴─────────────────────────────────────────┘
```

### 2.2 左侧 Session 导航栏

| 项目 | 描述 |
|------|------|
| **位置** | 页面最左侧，垂直导航栏 |
| **内容** | 显示所有 Session 列表 |
| **排序** | 按最近活跃时间倒序排列（最新活跃的在最上面） |
| **Session 名称** | 自动生成摘要（如首条用户消息的前 N 个字符） |
| **分组** | 暂不需要分组，平铺显示 |
| **交互** | 点击 Session 可切换，右侧加载该 Session 的消息并可继续聊天 |
| **新建** | 顶部「+ 新建 Session」按钮，名称自动生成 |
| **折叠/展开** | 支持折叠/展开，折叠后只显示图标或完全隐藏，适配小屏 |

### 2.3 Session 切换与聊天行为

| 项目 | 描述 |
|------|------|
| **切换后** | 右侧加载该 Session 的最新消息，滚动到底部，可继续输入聊天 |
| **连续性** | 聊天和历史合并为一体，不再分离 |
| **新消息** | 发送消息后，Session 自动排到列表最上方 |

### 2.4 消息加载策略 — 增量加载

| 项目 | 描述 |
|------|------|
| **初始加载** | 切换 Session 时，只加载最新的 N 条消息（如 30 条） |
| **增量加载** | 用户向上滚动到顶部时，触发加载更早的历史消息 |
| **加载指示** | 加载中显示 loading 指示器 |
| **目的** | 保证长 Session 不卡顿，提升加载速度 |

### 2.5 顶部 Tab 栏 — 模块切换

| 项目 | 描述 |
|------|------|
| **定位** | Tab 用于切换功能模块（非聊天内的子功能） |
| **当前模块** | 💬 对话（即当前聊天功能，完整实现） |
| **占位模块** | ⚙️ 配置（占位）、🧠 记忆管理（占位）、🔧 Skill 管理（占位） |
| **占位行为** | 点击占位 Tab 显示「Coming Soon」或简单说明 |

### 2.6 消息渲染优化

| 项目 | 描述 |
|------|------|
| **Markdown 渲染** | 支持标准 Markdown（标题、列表、加粗、斜体、链接、表格等） |
| **代码高亮** | 代码块语法高亮（支持常见编程语言），带复制按钮 |
| **工具调用** | Tool 类型消息（工具调用及其结果）默认折叠显示，可点击展开查看详情 |
| **用户消息** | 简洁气泡样式 |
| **助手消息** | 左侧对齐，Markdown 渲染 |

---

## 三、需求确认记录

| # | 问题 | 确认结果 |
|---|------|----------|
| 1 | Session 列表排序方式 | ✅ 按最近活跃时间倒序 |
| 2 | Session 显示名称 | ✅ 自动生成摘要 |
| 3 | 新建 Session 命名 | ✅ 自动生成，无需手动指定 |
| 4 | 左侧导航栏折叠 | ✅ 支持折叠/展开 |
| 5 | 历史消息加载策略 | ✅ 加载最新消息，向上滚动时增量加载 |
| 6 | Tool 消息展示方式 | ✅ 默认折叠，可展开 |
| 7 | 未来模块 Tab | ✅ 先占位（配置、记忆管理、Skill 管理） |

---

## 四、技术决策

| 决策项 | 结论 |
|--------|------|
| 前端框架 | 引入现代前端框架（方案 B），参考 Cherry Studio 的 UI 设计 |
| 不直接 fork Cherry Studio | Cherry Studio 是 Electron 桌面应用，技术栈过重；我们是 Web 应用，按需参考其 UI/UX |
| 工程化 | 引入架构设计、UI 设计、测试框架、Git 版本管理 |

---

## 五、参考项目

- **Cherry Studio** ([GitHub](https://github.com/CherryHQ/cherry-studio))
  - 技术栈：Electron + React + TypeScript + Vite + styled-components + Ant Design
  - 参考点：Sidebar 导航设计、Session/Topic 管理、消息渲染、整体布局
  - 本地参考代码：`reference/cherry-studio/`

---

## 六、迭代反馈 (v1.1)

> 2026-02-25 用户首次使用新前端后的反馈

### Issue #1：工具调用消息占据过多篇幅

**现象**：每次工具调用产生两条独立消息（assistant+tool_calls badge + tool result details），在消息流中占据大量空间，影响阅读体验。

**期望**：参考 CLI 终端的渲染风格，一次工具调用只占一行（类似 `↳ 调用 exec → 结果摘要`），大幅压缩工具调用的视觉占用。

**解决方案**：
- 将 assistant 的 tool_calls 信息和对应的 tool result 合并为一个紧凑的单行展示
- 无内容的 assistant+tool_calls 消息不再单独渲染为一条消息
- tool 消息改为内联紧凑样式：`↳ 工具名 → 结果摘要（可点击展开详情）`
- 连续的工具调用消息合并显示，减少视觉噪音

### Issue #2：旧 web UI 的 session 缺少助手回复内容

**现象**：`cli_webchat` session 中助手回复没有被记录到 JSONL 文件。

**原因**：旧版 web UI (`server.py`) 在记录消息时存在 bug，只记录了用户消息和工具调用，没有正确记录助手的最终回复文本。

**解决方案**：这是旧 UI 的已知问题，新 UI 通过 `nanobot agent` CLI 发送消息，消息记录由 nanobot 核心处理，不会有此问题。无需修复。

### Issue #3：Sidebar 折叠后无法展开

**现象**：点击 Sidebar 底部的「◀ 收起」按钮后，Sidebar 完全隐藏（width=0），没有提供展开按钮。

**解决方案**：在 ChatArea 顶部或左侧添加一个展开按钮（如 `▶` 或 hamburger 图标），当 Sidebar 折叠时显示，点击可重新展开 Sidebar。

---

## 七、迭代反馈 (v1.4)

> 2026-02-25 用户对工具调用显示的进一步优化需求

### Issue #4：工具调用最终显示与流式输出不一致 + 缺少整体折叠

**现象**：
1. 流式输出期间，工具调用步骤以 `↳ step` 风格显示（ProgressIndicator）
2. 任务完成后从 JSONL 重新加载，工具调用以 `▸ tool_name → 摘要` 风格显示（ToolCallLine）
3. 两者视觉风格不一致
4. 最终显示时，工具调用过程和助手文本混在一起，无法整体折叠

**期望**：
1. **风格统一**：最终显示的工具调用部分与流式输出时保持一致的 `↳` 风格
2. **整体可折叠**：一个 assistant turn 中的所有工具调用过程可以整体折叠/展开
3. **默认折叠**：只显示最终助手的文本输出，工具调用过程默认折叠
4. **折叠摘要**：折叠时显示简短摘要（如 `⚙ 使用了 3 个工具`），点击可展开查看详情
5. **展开后**：展开后显示所有工具调用步骤，每步用 `↳ tool_name → 摘要` 格式，与流式输出一致

**渲染示例**：

```
折叠状态（默认）：
┌─────────────────────────────────────────────┐
│ 🤖                                          │
│  [⚙ 使用了 3 个工具 ▸]                       │  ← 点击展开
│                                             │
│ 好的，代码已经在 main 分支上，状态正常。        │
└─────────────────────────────────────────────┘

展开状态：
┌─────────────────────────────────────────────┐
│ 🤖                                          │
│  [⚙ 使用了 3 个工具 ▾]                       │  ← 点击折叠
│   ↳ exec → On branch main, nothing to...   │  ← 可点击展开详情
│   ↳ read_file → Successfully read 2050...   │  ← 可点击展开详情
│   ↳ write_file → File written successfully  │  ← 可点击展开详情
│                                             │
│ 好的，代码已经在 main 分支上，状态正常。        │
└─────────────────────────────────────────────┘
```

---

## 八、迭代反馈 (v1.5)

> 2026-02-26 Session 管理增强

### Issue #5：Session 名称可编辑

**现象**：Session 列表中的名称是自动生成的（取第一条用户消息的前 80 字符），用户无法自定义。

**期望**：
1. **双击编辑**：在 Sidebar 的 Session 列表中，双击 session 名称可进入编辑模式
2. **行内编辑**：编辑时显示输入框，替换原有名称文本
3. **确认方式**：Enter 确认 / Escape 取消 / 失去焦点确认
4. **持久化**：重命名后的名称存储在 JSONL metadata 的 `custom_name` 字段中
5. **优先级**：`custom_name` > 第一条用户消息 > session_id

---

## 九、迭代反馈 (v1.6)

> 2026-02-26 工具调用折叠优化

### Issue #6：工具调用前置文本应一起折叠

**现象**：
1. Assistant 消息在调用工具前通常会输出一段"思考/意图"文本（如 "让我查看一下你明天的日程。"、"好的，我来创建一个日历查询 skill。"）
2. 这些前置文本目前作为**独立文本段**显示在 bubble 中，不参与折叠
3. 只有 tool call 的名称和结果被折叠在 `⚙ 使用了 N 个工具` 里

**问题**：
- 前置文本本质上是工具调用过程的一部分，不是最终回复
- 用户只关心最终回复，前置文本增加了视觉噪音
- 折叠 tool calls 后仍然能看到一堆中间"思考"文本，折叠效果不完整

**期望**：

```
折叠状态（默认）：
┌─────────────────────────────────────────────┐
│  [⚙ 使用了 2 个工具 ▸]                       │  ← 前置文本 + tool calls 全部折叠
│                                             │
│ 明天日程安排如下：...                         │  ← 只显示最终回复
└─────────────────────────────────────────────┘

展开状态：
┌─────────────────────────────────────────────┐
│  [⚙ 使用了 2 个工具 ▾]                       │
│  │ 让我查看一下你明天的日程。                  │  ← 前置文本（缩进显示）
│  │ ↳ read_file → Successfully read...       │
│  │ ↳ exec → 查询到 5 条日程...               │
│                                             │
│ 明天日程安排如下：...                         │  ← 最终回复
└─────────────────────────────────────────────┘
```

**规则**：
- 一个 assistant turn 中，"最终回复"定义为：最后一条不带 `tool_calls` 的 assistant 消息的 `content`
- 其他所有 assistant 消息的 `content`（带 `tool_calls` 的消息的文本部分）都归入"工具调用过程"，一起折叠
- 折叠区域内的前置文本使用缩进样式，与 tool call 行视觉统一
- 多轮工具调用（assistant→tool→assistant→tool→...→assistant(final)）中间所有文本都折叠

---

## 十、功能模块实现 (v2.0)

> 2026-02-26 实现配置、记忆、Skill 管理三个功能模块

### 功能 1：配置模块 (⚙️ 配置)

**数据源**：`~/.nanobot/config.json`

**功能**：
1. **显示配置**：将 config.json 的内容以结构化方式展示在页面上
2. **编辑配置**：支持在页面上编辑配置项，保存后写回 config.json
3. **分区展示**：按 config.json 的顶层 key 分区（agents、channels、providers、gateway、tools）
4. **安全性**：API Key 等敏感字段用密码框显示（`type=password`），可切换显示/隐藏

**布局**：
```
┌──────────────────────────────────────────────────┐
│  [💬 对话] [⚙️ 配置] [🧠 记忆] [🔧 Skill]        │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌─ agents ──────────────────────────────────┐  │
│  │ model: [claude-opus-4-6          ▼]       │  │
│  │ maxTokens: [8192                    ]       │  │
│  │ temperature: [0.7                   ]       │  │
│  │ maxToolIterations: [60              ]       │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌─ providers ───────────────────────────────┐  │
│  │ ▸ anthropic                               │  │
│  │ ▸ openai                                  │  │
│  │ ▸ ...                                     │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│                          [保存配置]              │
└──────────────────────────────────────────────────┘
```

**后端 API**：
- `GET /api/config` — 读取 config.json 返回 JSON
- `PUT /api/config` — 接收完整 JSON 写入 config.json

---

### 功能 2：记忆模块 (🧠 记忆)

**数据源**：`~/.nanobot/workspace/memory/` 目录下的文件

**功能**：
1. **文件列表**：左侧边栏列出 memory 目录下所有文件
2. **内容查看**：右侧显示选中文件的内容，使用 Markdown 渲染
3. **只读**：暂时不支持编辑

**布局**：
```
┌──────────────────────────────────────────────────┐
│  [💬 对话] [⚙️ 配置] [🧠 记忆] [🔧 Skill]        │
├────────┬─────────────────────────────────────────┤
│        │                                         │
│ 📄 文件 │          文件内容（Markdown 渲染）        │
│ ────── │                                         │
│ MEMORY │  # Long-term Memory                     │
│  .md   │                                         │
│ HISTORY│  This file stores important...          │
│  .md   │  ...                                    │
│        │                                         │
└────────┴─────────────────────────────────────────┘
```

**后端 API**：
- `GET /api/memory/files` — 列出 memory 目录下所有文件
- `GET /api/memory/files/:filename` — 读取指定文件内容

---

### 功能 3：Skill 管理模块 (🔧 Skill)

**数据源**：
- 用户自定义 Skills：`~/.nanobot/workspace/skills/`
- 内置 Skills：`nanobot` 安装目录下的 `nanobot/skills/`（从 SKILL.md 的 skills XML 中解析）

**功能**：
1. **Skill 列表**：左侧边栏列出所有 Skills（名称 + 简短描述 + 可用状态）
2. **Skill 详情**：右侧显示选中 Skill 的 SKILL.md 内容（Markdown 渲染）
3. **目录树**：显示 Skill 目录下的文件树结构
4. **文件查看**：点击目录树中的文件可查看内容
5. **只读**：暂时不支持编辑

**布局**：
```
┌──────────────────────────────────────────────────┐
│  [💬 对话] [⚙️ 配置] [🧠 记忆] [🔧 Skill]        │
├────────┬─────────────────────────────────────────┤
│        │                                         │
│ 🔧 Skills│        Skill 详情                      │
│ ────── │                                         │
│ ✅ cal │  # Calendar Reader                      │
│  endar │  ⚠️ READ-ONLY ONLY...                  │
│ ✅ mem │                                         │
│  ory   │  ── 目录树 ──                            │
│ ✅ cron│  📁 calendar-reader/                    │
│ ❌ git │    📄 SKILL.md                          │
│  hub   │    📁 scripts/                          │
│ ...    │      📄 query_events.sh                 │
│        │      📄 query_events.swift              │
│        │                                         │
└────────┴─────────────────────────────────────────┘
```

**后端 API**：
- `GET /api/skills` — 列出所有 Skills（名称、描述、位置、可用状态）
- `GET /api/skills/:name` — 获取 Skill 详情（SKILL.md 内容）
- `GET /api/skills/:name/tree` — 获取 Skill 目录树
- `GET /api/skills/:name/files/:path` — 读取 Skill 下指定文件内容

---

## 十一、迭代反馈 (v2.1)

> 2026-02-26 任务执行过程体验优化

### Issue #7：切换 Session 时执行过程显示跟着切换

**现象**：
1. 在 Session A 发送消息，显示执行过程（ProgressIndicator）
2. 执行过程中切换到 Session B
3. Session B 中也显示了 Session A 的执行进度

**期望**：
- 执行过程只在提交任务的 Session 中显示
- 切换到其他 Session 时，不显示执行过程
- 其他 Session 在任务执行期间禁止发送新消息（因为 nanobot 是单任务的）

### Issue #8：缺少强制停止执行功能

**现象**：发送消息后只能等待任务执行结束，无法中途取消。

**期望**：
1. 发送消息后，发送按钮变为**停止按钮**（如 ■ 图标）
2. 点击停止按钮可强制终止正在执行的 nanobot 任务
3. 停止后恢复到可输入状态

### Issue #9：刷新页面后任务执行状态丢失

**现象**：
1. 发送消息，任务执行中
2. 刷新页面
3. 页面加载后没有任何执行状态指示，只能等后台执行完成后手动刷新查看结果

**期望**：
1. 刷新页面后，如果当前 Session 有正在执行的任务，自动恢复到执行状态
2. 显示 ProgressIndicator，通过 SSE 重新连接获取实时进度
3. 即使无法看到完整的历史进度，也应显示当前的执行状态

### Issue #10：Token 用量统计与展示

**现象**：nanobot provider 层已返回 `usage` 数据（prompt_tokens, completion_tokens, total_tokens），但 agent loop 未累计、未保存，前端无展示。

**期望**：
1. **后端**：agent loop 累计每次 LLM 调用的 token usage，保存到 session JSONL
2. **前端**：增加用量展示模块，显示 session 级别和全局级别的 token 用量统计
3. **数据维度**：prompt_tokens, completion_tokens, total_tokens, 调用次数, 模型名称

---

## 十二、迭代反馈 (v2.3)

> 2026-02-26 用量统计展示增强

### Issue #11：Session 级用量 + 全局用量看板

**现象**：当前 Sidebar 底部的 UsageIndicator 只显示全局用量统计，缺少当前 session 的用量，也没有趋势可视化。

**期望**：

1. **Sidebar 底部**：改为显示**当前 session** 的 token 用量（切换 session 时更新）
2. **新增用量模块**：在顶部 Tab 栏新增 `📊 用量` Tab，作为独立的全局用量看板

#### Sidebar Session 用量

```
┌──────────────────────┐
│ 📊 12.5K tokens · 3次 │  ← 当前 session 的用量
│  ▸ 详情               │
└──────────────────────┘
```

- 显示当前活跃 session 的 token 用量汇总
- 切换 session 时自动刷新
- 展开后显示输入/输出/总计/按模型明细

#### 全局用量看板（📊 用量 Tab）

```
┌──────────────────────────────────────────────────┐
│  [💬 对话] [📊 用量] [⚙️ 配置] [🧠 记忆] [🔧 Skill] │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌─ 总计 ────────────────────────────────────┐  │
│  │ 总 Tokens: 712.1K  │ 调用次数: 43         │  │
│  │ 输入: 702.1K        │ 输出: 9.9K          │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌─ 每日趋势 ────────────────────────────────┐  │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           │  │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           │  │
│  │  02/20  02/21  02/22  ...  02/26          │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌─ 按模型 ──────────────────────────────────┐  │
│  │ claude-opus-4-6  │ 712.1K tokens │ 43次   │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌─ 按 Session ──────────────────────────────┐  │
│  │ 网页默认窗口    │ 500K tokens │ 30次       │  │
│  │ 命令行窗口      │ 200K tokens │ 10次       │  │
│  │ ...             │             │            │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

- 顶部总计卡片
- 每日趋势图（纯 CSS/SVG 柱状图，不引入图表库）
- 按模型分布
- 按 Session 分布（带名称、用量、调用次数）

**后端 API 扩展**：
- `GET /api/usage?session=<key>` — 单 session 用量（已有 analytics 方法，需加路由）
- `GET /api/usage/daily?days=30` — 每日用量趋势（已有 analytics 方法，需加路由）

---

## 十三、迭代反馈 (v2.4)

> 2026-02-26 Backlog 1-5 修复

### Issue #12：切换 Session 后 streaming 内容丢失

**现象**：执行任务过程中切换到其他 session，再切换回来，之前的 streaming 进度内容消失，只显示"正在执行任务"。

**解决方案**：
- Worker 的 task-status API 返回完整的 `progress` 列表（不仅是 `progress_count`）
- 前端 `checkRunningTask` 切换回来时从 task-status 恢复完整的 progress 历史
- Gateway 后端作为 progress 的持久存储（只要 gateway 不重启，数据就在）
- Gateway 重启时降级为现有行为（只显示进度计数）

### Issue #13：输入框内容未与 Session 绑定

**现象**：
1. 在对话框输入内容后切换 session，输入框内容不变，提交会发到新 session
2. 切换回原 session 后，之前输入的内容丢失

**解决方案**：
- messageStore 新增 `draftBySession: Record<string, string>` 按 session 保存草稿
- ChatInput 从 store 读写草稿，切换 session 时自动切换输入内容
- 切换模块（Tab）后再切回对话，输入框内容也保持（因为 draft 在 store 中）

### Issue #14：切换模块后输入框内容丢失

**现象**：切换到记忆/配置等模块再切回对话，session 中之前输入的内容丢失。

**解决方案**：同 Issue #13，draftBySession 在 Zustand store 中持久化，不受 Tab 切换影响。

### Issue #15：Max tool iterations 后 Web 无显示

**现象**：达到最大工具调用次数后，CLI 会输出提示信息，但 Web 中看不到。

**根因**：nanobot 核心 `_run_agent_loop` 在 max_iterations 达到时设置了 `final_content` 文本，但**未将其作为 assistant 消息添加到 messages 列表**，导致 `_save_turn` 不会保存到 JSONL，Web UI 从 JSONL 重载时看不到。

**修复**：在设置 `final_content` 后，调用 `context.add_assistant_message` 将其追加到 messages 列表。

### Issue #16：CLI 模式下 Token 用量未记入统计

**现象**：在命令行 `nanobot agent` 模式下交互，token 用量不会被记入 SQLite 统计。

**根因**：Usage 数据通过 stderr JSON 输出（`__usage__: true`），只有 worker.py 会解析并通过 SSE 传给 gateway 写入 analytics.db。CLI 模式不经过 worker，stderr 输出到终端后被丢弃。

**状态**：已知限制，暂不修复。后续可通过 Backlog #6（SDK 方案）统一解决。

### Issue #17 偶尔出现 "unexpected tool_use_id found in tool_result blocks" 错误

— 根因：`get_history()` 的 `memory_window` 截断落在长工具调用链中间，导致孤立的 `tool_result` 消息（对应的 `assistant` 消息在窗口之外）。修复：`get_history()` 对齐逻辑改为优先找 `user` 消息、回退到 `assistant` 消息，永不以 `tool` 消息开头。（nanobot 核心仓库 commit c14804d）

已经解决

---

---

## 十四、迭代反馈 (v2.5)

> 2026-02-26 exec 工具 PIPE 卡死 + Usage 指示器刷新

### Issue #18：exec 工具执行含 `&` 后台操作符的命令时卡死

**现象**：
1. nanobot 通过 exec 工具执行 `cd /dir && python3 gateway.py &` 类似命令
2. `communicate()` 永远不返回，exec 工具超时（180s）

**根因**：
Shell 中 `&` 的优先级低于 `&&`，导致 `cd /dir && python3 server.py &` 整个复合命令被当作后台作业。子 shell 继承了 PIPE file descriptors（stdin/stdout/stderr），即使主 shell 退出，`communicate()` 仍在等待 PIPE EOF——而 PIPE EOF 只有在**所有持有 fd 的进程**都退出后才会发生。后台进程不退出，`communicate()` 就永远阻塞。

**修复方案（三层防护）**：

1. **exec 工具层（nanobot 核心）**：新增 `_has_background_process()` 检测函数
   - 去除引号内字符串，排除 `&&`、`>&`、`&>`、`2>&1` 等合法模式后，检测剩余的 `&`
   - 检测到后**拒绝执行**，返回错误信息 + 安全替代方案建议
   - LLM 可根据提示自行调整命令

2. **服务层（gateway.py / worker.py）**：新增 `--daemonize` 标志
   - 使用 UNIX double-fork 完全脱离父进程
   - 重定向 stdin/stdout/stderr 到 `/dev/null`
   - 不继承任何 PIPE fd，彻底避免 `communicate()` 阻塞

3. **运维层（restart-gateway.sh 脚本）**：统一服务管理
   - 支持 `all|gateway|worker|stop|status` 子命令
   - 内部使用 `--daemonize` 启动，安全可从 exec 工具调用
   - 自动检测端口冲突、健康检查、PID 文件管理

### Issue #19：消息发送完成后 Usage 指示器不立即刷新

**现象**：
1. 发送消息，等待 nanobot 回复完成
2. Sidebar 底部的 UsageIndicator 仍显示旧数据
3. 需要等 60 秒定时器或切换 session 才能看到更新

**根因**：UsageIndicator 只在 session 切换和每 60 秒定时器时刷新，消息发送完成后不会触发刷新。

**修复**：
- messageStore 在消息发送/恢复完成后 dispatch `usage-updated` CustomEvent
- UsageIndicator 监听此事件立即刷新
- 改动文件：`messageStore.ts`, `UsageIndicator.tsx`

---

---

## 十五、nanobot SDK 化 — Worker 直接调用 Agent（原 Backlog #6）

> 2026-02-26 从 Backlog 提升为正式需求。与 §十六、§十七 联合设计。
> 详细技术设计见 nanobot 核心仓库 `docs/ARCHITECTURE.md` §二。

### Issue #20：Worker 通过 CLI 子进程调用 nanobot 存在多个问题

**现象**：
1. Worker 通过 `subprocess.Popen(['nanobot', 'agent', ...])` 调用 nanobot
2. Usage 数据只能通过 stderr JSON 传递，progress 通过 stdout `↳` 前缀行传递
3. 需要逐行解析 stdout/stderr，解析逻辑脆弱
4. 无法获取结构化的中间状态
5. 每次调用启动新 Python 进程，资源浪费

**目标**：
- nanobot 提供 Python SDK（`nanobot.sdk.AgentRunner`）
- Worker 在进程内直接调用，通过结构化回调获取 progress/usage/消息
- 不再需要 subprocess + stdout/stderr 解析

**对 web-chat 的影响**：
- `worker.py` 从 subprocess 改为 SDK 调用（**破坏性变更**，需 feature 分支）
- `gateway.py` 的 usage 写入逻辑可简化（核心层已写入 SQLite）
- `analytics.py` 可能迁移到 nanobot 核心

**实施依赖**：依赖 §十六（实时持久化）和 §十七（统一 token 记录）先完成。

---

## 十六、实时 Session 持久化（原 Backlog #7）

> 2026-02-26 从 Backlog 提升为正式需求。
> 详细技术设计见 nanobot 核心仓库 `docs/ARCHITECTURE.md` §2.4。

### Issue #21：Agent 执行中途异常退出导致 Session 记录丢失

**现象**：
1. 用户发送消息，nanobot 开始执行（可能运行数分钟）
2. 执行过程中进程异常退出（crash/kill/OOM）
3. 所有中间消息（assistant 回复、tool 调用结果）全部丢失
4. Session JSONL 中没有任何本次执行的记录
5. 但文件系统已被修改（工具调用的副作用），导致状态不一致

**根因**：
- `_save_turn()` 和 `session.save()` 只在 `_process_message()` 末尾调用
- `_run_agent_loop()` 运行期间所有消息只在内存中
- 进程退出 = 内存数据丢失

**目标**：
- 每条消息（user/assistant/tool）在产生时**立即**追加到 JSONL
- 中途异常退出后，JSONL 中保留已执行的完整记录
- 不影响现有 JSONL 格式和读取逻辑

**对 web-chat 的影响**：
- 改动在 nanobot 核心层，web-chat 无需修改
- Web UI 刷新后可看到中途中断的消息（因为已写入 JSONL）

---

## 十七、统一 Token 用量记录（原 Backlog #8）

> 2026-02-26 从 Backlog 提升为正式需求。
> 详细技术设计见 nanobot 核心仓库 `docs/ARCHITECTURE.md` §2.5。

### Issue #22：Token 用量记录仅在 Web UI 模式有效

**现象**：
| 调用方式 | 用量记录 | 原因 |
|----------|----------|------|
| Web UI | ✅ 有 | Worker 解析 stderr → Gateway → SQLite |
| CLI 单次 | ❌ 无 | stderr 输出到终端后丢弃 |
| CLI 交互 | ❌ 无 | stderr 输出到终端后丢弃 |
| IM channels | ❌ 无 | 不经过 Worker |
| Cron 任务 | ❌ 无 | 不经过 Worker |

**目标**：
- Token 用量在 nanobot 核心层统一写入 SQLite
- 所有调用方式自动记录，不依赖外部 Worker
- web-chat 的 UsageIndicator 继续正常工作

**对 web-chat 的影响**：
- `gateway.py` 移除 usage 写入逻辑（核心层已写入同一 SQLite）
- `/api/usage` 路由不变（仍查询 SQLite）
- `analytics.py` 的 schema 迁移到 nanobot 核心
- Worker 的 stderr usage 解析可简化或移除

---

## 十八、Bug 修复 — SDK 化后 Session 数据写入错误路径

> 2026-02-26 Phase 24 SDK 化后发现的关键 Bug

### Issue #23：Web UI 消息执行成功但 Session 不记录，刷新后消息消失

**现象**：
1. 在 web-chat 输入消息，nanobot agent 正常执行（工具调用、回复等都能看到）
2. 执行完成后，切换 session 或刷新页面，所有消息消失
3. Session JSONL 文件中只有 metadata 行，没有任何消息记录
4. Worker 日志显示任务成功完成（如 `Task done: session=webchat:1772111064, steps=104`）

**根因**：
`AgentRunner.from_config()` 中 `SessionManager` 初始化路径错误：

```python
# 错误代码（sdk/runner.py）
sessions_dir = config.workspace_path / "sessions"   # ~/.nanobot/workspace/sessions
session_manager = SessionManager(sessions_dir)       # 传入 sessions_dir

# SessionManager.__init__（session/manager.py）
self.sessions_dir = ensure_dir(self.workspace / "sessions")
# 实际路径 = ~/.nanobot/workspace/sessions/sessions  ← 双重嵌套！
```

Gateway 创建 session 和读取消息都使用 `~/.nanobot/workspace/sessions/`（正确路径），但 Worker（通过 AgentRunner）写入消息到 `~/.nanobot/workspace/sessions/sessions/`（错误路径），导致 gateway 读不到消息。

**修复**：
```python
# 修复后
session_manager = SessionManager(config.workspace_path)  # 传入 workspace root
# SessionManager 内部: ~/.nanobot/workspace + /sessions = 正确路径
```

**影响范围**：
- 所有通过 SDK 模式（web-chat worker）执行的 session 数据受影响
- CLI 模式不受影响（CLI 直接使用 `SessionManager(workspace_path)`）
- Phase 24 SDK 化引入的回归 bug

**修复 Commit**：nanobot 核心 `aaaf81d` on local 分支

---

---

## 十九、迭代反馈 (v3.1)

> 2026-02-26 执行过程展示完整性优化

### Issue #24：Web UI 执行过程中工具调用结果不显示

**现象**：
1. 执行任务过程中，Web UI 的 ProgressIndicator 只显示：
   - 思考文本（如 "让我查看一下你明天的日程。"）
   - 工具调用提示（如 `exec("query_events.sh 2026...")`）— 参数截断到 40 字符
2. **不显示工具执行结果**，用户无法在执行过程中看到工具返回了什么
3. 命令行 CLI 虽然也只显示 `↳ progress` 行，但 Web UI 完成后的折叠视图会显示 `↳ tool_name → result_summary`，两者不一致

**根因**：
- Worker 的 `WorkerCallbacks.on_message()` 回调为空（`pass`），不处理 tool 消息
- `on_progress()` 只接收 agent loop 的思考文本和工具调用提示（`_tool_hint`），不包含工具执行结果
- 工具执行结果只通过 `on_message()` 传递，但 Worker 未将其转化为 SSE progress 事件

**期望**：
1. 执行过程中，每个工具执行完成后，立即显示 `↳ tool_name → result_summary`
2. 工具结果可点击展开查看完整输出（与最终折叠视图一致）
3. 执行完成后，照常从 JSONL 重载并折叠显示（现有行为不变）
4. 前置思考文本保持现有的 `↳ text` 显示

**渲染示例（执行过程中）**：
```
┌─────────────────────────────────────────────────────┐
│ 让我查看一下你明天的日程。                             │  ← 思考文本
│ ↳ read_file("/path/to/SKILL.md")                    │  ← 工具调用提示
│ ↳ read_file → # Calendar Reader Skill...            │  ← 工具结果（可展开）
│ ↳ exec("./query_events.sh 2026-02-27 1")            │  ← 工具调用提示
│ ↳ exec → 查询到 5 条日程: 09:00 团队周会...           │  ← 工具结果（可展开）
│ ● ● ●                                              │  ← 等待中
└─────────────────────────────────────────────────────┘
```

**实现方案**：
1. **Worker `on_message` 改造**：收到 `tool` 角色消息时，生成 `↳ tool_name → result_summary` 格式的 progress 事件，SSE 事件增加 `type` 字段区分（`tool_result` vs 普通 `progress`）
2. **前端 ProgressIndicator 增强**：支持工具结果类型的 progress step，可点击展开详情
3. **SSE 事件扩展**：progress 事件增加结构化数据（`type`, `name`, `content`），前端根据类型渲染

---

## 二十、工具调用间隙用户消息注入（原 Backlog #10）

> 2026-02-26 从 Backlog 提升为正式需求。探索性功能，需在独立分支验证后合并。

### Issue #25：任务执行过程中无法补充信息或纠正方向

**现象**：
1. 用户发送消息后，nanobot 开始执行工具调用循环（可能数十轮）
2. 执行过程中用户发现方向偏离预期，或需要补充关键信息
3. 当前只能等待任务完成或强制停止（Issue #8），无法在中途介入
4. 强制停止会丢失已执行的工具调用成果，浪费 token

**期望**：
1. 任务执行过程中，用户可以在输入框中输入补充信息
2. 输入的信息在**工具调用间隙**（当前轮次所有工具执行完毕、下一次 LLM 调用前）作为 `user` 消息插入到消息列表
3. LLM 在下一轮调用时看到这条补充信息，据此调整后续行为
4. 支持所有渠道：Web UI、CLI、IM（Telegram/Feishu 等）

**使用场景示例**：

```
用户: 帮我重构 utils.py，把所有函数加上类型注解
  ↳ read_file("utils.py")
  ↳ read_file → def parse_data(raw): ...
  ↳ write_file("utils.py")                    ← 用户发现在改错文件
  
用户(注入): 等一下，我说的是 src/utils.py 不是根目录的
  
  ↳ read_file("src/utils.py")                 ← LLM 看到补充信息后纠正
  ↳ ...
```

**交互设计（Web UI）**：

```
任务执行中的输入框状态：
┌─────────────────────────────────────────────┐
│  [输入补充信息...]          [📝 注入]  [■ 停止] │
└─────────────────────────────────────────────┘
```

- 任务执行中，输入框**不禁用**（当前行为是禁用）
- 发送按钮变为"📝 注入"按钮（区别于普通发送）
- 停止按钮保持不变
- 注入的消息在 ProgressIndicator 中显示为 `📝 用户补充: xxx`

**技术方案**：

#### 1. nanobot 核心层

**AgentCallbacks 新增方法**：
```python
async def check_user_input(self) -> str | None:
    """Check if user has pending input to inject.
    
    Called between tool execution rounds (after all tools in current round
    complete, before next LLM call). Must be non-blocking.
    Returns user text if available, None otherwise.
    """
    return None
```

**agent loop 改动**（`_run_agent_loop`）：
- 在每轮工具调用完成后、下一次 `provider.chat()` 前调用 `callbacks.check_user_input()`
- 如果返回非 None，将其作为 `user` 消息追加到 messages 列表
- 同步持久化到 JSONL + 通知 `on_progress`

#### 2. Worker 层

- `WorkerCallbacks` 实现 `check_user_input()`：从线程安全队列取消息
- 新增 `POST /tasks/<key>/inject` 端点：接收前端发送的用户注入消息，放入队列
- 新增 task 字段 `_inject_queue: queue.Queue`

#### 3. Gateway 层

- 新增 `POST /api/sessions/:id/task-inject` 路由：转发到 Worker

#### 4. 前端

- 任务执行中输入框可用，发送按钮变为"注入"模式
- 调用 `POST /api/sessions/:id/task-inject` 发送注入消息
- ProgressIndicator 显示注入消息

#### 5. IM 渠道适配

- IM 渠道（Telegram/Feishu）在任务执行中收到的新消息，通过 bus 的 inbound 队列缓冲
- agent loop 的 `check_user_input` 从 bus 队列中取消息
- 需要在 `_process_message` 中传递 bus 引用给 callbacks

**风险评估**：

| 风险 | 级别 | 说明 | 缓解措施 |
|------|------|------|----------|
| LLM 上下文混乱 | ⚠️ 中 | 工具调用中间插入 user 消息，LLM 可能困惑 | 消息内容加前缀标记如 `[用户补充]`，帮助 LLM 理解上下文 |
| 时序竞争 | ⚠️ 中 | 用户输入可能在工具执行中到达 | 使用队列缓冲，只在安全插入点（工具执行完毕后）检查 |
| 多条注入 | 🟡 低 | 用户可能连续注入多条消息 | 队列支持多条，每轮间隙全部取出合并 |
| JSONL 一致性 | 🟡 低 | 注入的 user 消息需要正确持久化 | 复用现有 `append_message` 机制 |
| Token 浪费 | 🟡 低 | 注入消息增加上下文长度 | 注入消息通常很短，影响可忽略 |

**实施策略**：
- nanobot 仓库: `feat/user-inject` 分支
- web-chat 仓库: `feat/user-inject` 分支
- 验证有效后合并回各自主分支

---

---

## 二十一、Worker 并发任务支持（原 Backlog #11）

> 2026-02-26 从 Backlog 提升为正式需求。

### Issue #26：Worker 不支持并发任务，前端全局单任务锁限制用户体验

**现象**：
1. 在 Session A 发送消息后，Session B 无法发送消息（输入框禁用，提示"其他对话正在执行任务"）
2. 用户必须等待 Session A 的任务完成后，才能在 Session B 中操作
3. 多个 Session 之间完全串行，无法并行工作

**根因**：
1. **Worker 层**：`AgentRunner` 是单例，其内部的 `AgentLoop` 实例共享工具上下文（`_set_tool_context` 设置 MessageTool/SpawnTool/CronTool 的 channel/chat_id），并发时上下文会互相覆盖
2. **前端层**：`messageStore` 使用全局 `sending` + `sendingSessionId` 作为单任务锁，任何 session 执行任务时其他 session 全部禁用

**目标**：
1. Worker 支持**多 session 并发**执行任务
2. 前端每个 session 独立管理任务状态，互不阻塞
3. 同一 session 内仍然是串行的（不允许一个 session 同时执行两个任务）

**技术方案**：

#### 1. Worker 层 — 每任务独立 AgentRunner

**问题分析**：
- `AgentRunner` 单例的 `AgentLoop` 内部工具实例（MessageTool、SpawnTool、CronTool）通过 `_set_tool_context()` 设置 per-request 上下文
- 在 asyncio 单线程 event loop 中，两个并发任务交替执行，`_set_tool_context` 设置的上下文会在 `await` 点被另一个任务覆盖
- `SessionManager._cache` 在 asyncio 单线程中安全，但并发写同一 session 的 JSONL 文件不安全

**解决方案**：
- 放弃 AgentRunner 单例模式，改为**每个任务创建独立的 AgentRunner 实例**
- 每个 AgentRunner 有独立的 AgentLoop → 独立的 ToolRegistry → 独立的工具上下文
- Config 加载结果可以缓存（`load_config()` 只调用一次），避免重复 IO
- MCP 连接每个 runner 独立建立（可接受的开销）

```python
# 改造前（单例）
_runner = None
def _get_runner():
    global _runner
    if _runner is None:
        _runner = AgentRunner.from_config()
    return _runner

# 改造后（每任务独立）
def _create_runner():
    return AgentRunner.from_config()
```

**并发安全**：
- 每个 AgentRunner 有独立的 SessionManager，但都读写同一 sessions 目录
- SessionManager 的 `append_message()` 使用 `open("a")` + `fsync()`，POSIX 保证 append 写入的原子性（单行 ≤ PIPE_BUF）
- 不同 session key 写不同文件，天然无冲突
- 同一 session key 的并发由 Worker 层的 task registry 保证串行

#### 2. Worker 层 — Task Registry 支持多任务

**改动**：
- `_tasks` 字典已经按 session_key 索引，天然支持多个 session 同时有任务
- `_handle_execute_stream` 中的"已有运行任务"检查改为**同 session 内串行**（现有行为），不再阻止不同 session 的并发

#### 3. 前端 — Per-Session 任务状态

**messageStore 改动**：
- 移除全局 `sending: boolean` 和 `sendingSessionId: string | null`
- 新增 `taskBySession: Record<string, SessionTask>`，每个 session 独立跟踪任务状态
  ```typescript
  interface SessionTask {
    sending: boolean;
    progressSteps: ProgressStep[];
    recovering: boolean;
    abortController: AbortController | null;
  }
  ```
- `sendMessage` 不再检查全局 `sending`，只检查当前 session 是否有任务
- `cancelTask` 接受 sessionId 参数
- `checkRunningTask` 只检查指定 session

**ChatInput 改动**：
- 移除 `isOtherSessionSending` 逻辑
- 只检查当前 session 是否在执行（`isCurrentSessionSending`）
- 其他 session 执行时当前 session 的输入框正常可用

**MessageList 改动**：
- ProgressIndicator 从 `taskBySession[activeSessionId]` 读取状态
- 不再依赖全局 `sending`

**风险评估**：

| 风险 | 级别 | 说明 | 缓解措施 |
|------|------|------|----------|
| 内存占用增加 | 🟡 低 | 每个并发任务创建独立 AgentRunner | 任务完成后 runner 可释放 |
| MCP 连接数增加 | 🟡 低 | 每个 runner 独立连接 MCP | 实际并发任务数通常 ≤ 3 |
| JSONL 并发写入 | 🟡 低 | 不同 session 写不同文件 | 同 session 由 task registry 串行保护 |
| LLM API 并发限制 | ⚠️ 中 | 多任务同时调用 LLM API | LLM provider 自带 rate limiting |

---

## 二十二、迭代反馈 (v3.2)

> 2026-02-27 用量统计增强 + 工具调用用量展示

### Issue #27：已删除 Session 的用量统计显示

**现象**：用量统计页面"按对话"表格中，session JSONL 文件可能被用户手动删除，但 SQLite 中的用量数据仍然保留。删除后这些 session 的用量在统计中仍然显示，但名称无法读取。

**解决方案**：
- 后端 `_enrich_session_summaries` 检测 JSONL 文件是否存在，不存在则标记 `deleted: true`
- 前端 UsagePage "按对话"表格中，将已删除的 session 聚合为一行 `🗑️ 已删除对话 (N)`
- 已删除行显示为灰色斜体样式，与正常 session 区分

### Issue #28：折叠工具调用展开后显示 Token 用量

**现象**：工具调用折叠区域展开后，只能看到工具调用的详情，无法了解这些调用消耗了多少 token。

**解决方案**：
- 前端 MessageList 获取当前 session 的 usage records
- 将 usage records 传递给 AssistantTurnGroup → ToolProcessCollapsible
- 通过消息时间戳与 usage record 的 `[started_at, finished_at]` 时间范围匹配
- 展开后在底部显示 `📊 XX tokens (XX 输入 / XX 输出) · N 次调用` 摘要

---

## 二十三、迭代反馈 (v3.3)

> 2026-02-27 Session 管理增强 — 文件名显示 + 删除 + 标题优化

### Issue #29：Session 列表显示文件名

**现象**：Session 列表只显示摘要标题和时间，用户无法直观知道对应的 JSONL 文件名。

**解决方案**：
- 后端 `GET /api/sessions` 返回新增 `filename` 和 `sessionKey` 字段
- 前端 SessionItem 底部以等宽小字显示文件名（如 `webchat_1772030778.jsonl`）
- 使用 monospace 字体，10px 大小，低透明度，不影响主视觉

### Issue #30：支持删除 Session

**现象**：Session 列表中无法删除不需要的对话（如测试 session），只能手动到文件系统删除。

**解决方案**：
- 后端新增 `DELETE /api/sessions/:id` — 删除 JSONL 文件
- 前端 SessionItem hover 时右上角显示 `×` 删除按钮
- 点击删除按钮弹出行内确认（"确认删除？[删除] [取消]"），防止误操作
- 删除后自动切换到列表中的下一个 session
- 注意：删除只移除 JSONL 文件，SQLite 中的 usage 数据保留（用量统计页面已有"已删除对话"聚合显示）

### Issue #31：Session 标题显示优化

**现象**：
1. 标题取第一条用户消息的前 80 字符，经常过长且包含换行
2. 当没有用户消息时，显示 session_id（如 `webchat_1772030778`），不够友好
3. 有自定义名称时显示正常

**解决方案**：
- 前端 `getDisplayTitle()` 函数智能生成标题：
  - 有自定义名称 → 直接使用
  - 有用户消息摘要 → 使用（已有逻辑）
  - 摘要等于 session_id → 根据前缀显示友好名称（`webchat_` → "新对话"，`cli_` → "CLI 对话"等）
- 标题单行显示，溢出用省略号截断
- 文件名作为副标题小字显示，提供精确识别

---

## 二十四、Web UI 自修改安全实践 (v3.4)

> 2026-02-27 从 Backlog #14 提升为正式需求。

### Issue #32：Web UI 执行涉及 worker.py 修改的任务时，kill worker = kill 自己

**现象**：
1. 通过 Web UI 发起需求（如 Phase 26 用户消息注入、Phase 27 Worker 并发任务）
2. nanobot agent 运行在 worker 进程内（SDK 模式）
3. 任务执行过程中需要修改 `worker.py` 并重启 worker
4. nanobot 尝试 kill worker 进程 → **杀死了自己** → 任务中断，消息丢失
5. 不得不切换到 CLI 模式恢复工作，重新完成未完成的任务

**历史事故记录**：

| 事故时间 | 涉及 Phase | 触发场景 | 后果 |
|----------|-----------|---------|------|
| 2026-02-25 23:50 | Phase 11 | 修改 gateway.py + 重启 | SSE 断开，任务中断 |
| 2026-02-26 ~23:15 | Phase 26 (webchat_1772116553) | 修改 worker.py + kill worker | nanobot 自杀，转 CLI 恢复 |
| 2026-02-26 ~23:42 | Phase 27 (webchat_1772119212) | 修改 worker.py + kill worker | nanobot 自杀，转 CLI 恢复 |

**根因分析**：

```
Web UI 任务执行链路：

浏览器 → gateway.py(:8081) → worker.py(:8082) → [AgentRunner in-process]
                                    ↑                      ↑
                              nanobot agent 在此进程内运行
                              kill worker = kill agent = 任务中断
```

Phase 24 SDK 化之后，nanobot agent 不再是独立子进程（subprocess），而是在 worker 进程内直接运行。这意味着：
- **修改 gateway.py**：kill gateway → SSE 断开，但 worker 内的 agent 继续运行（优雅降级已解决）
- **修改 worker.py**：kill worker → agent 被杀死 → **不可恢复** ← 核心问题
- **修改前端代码**：不需要重启任何进程，`vite build` 即可（安全）
- **修改 nanobot 核心代码**：需要重启 worker（同样危险）

**解决方案 — 分级实践规则**：

不引入新的架构改造，而是通过**明确的操作规范**避免问题：

#### 规则 1：任务分类 — 提前评估风险

在发起 Web UI 任务前，根据涉及的修改文件判断风险级别：

| 风险级别 | 涉及修改 | 推荐渠道 |
|----------|---------|---------|
| 🟢 安全 | 前端代码、文档、配置文件 | Web UI ✅ |
| 🟡 低风险 | gateway.py | Web UI ✅（优雅降级保护） |
| 🔴 高风险 | worker.py、nanobot 核心代码 | **CLI** ⚠️ |

#### 规则 2：高风险任务必须使用 CLI

涉及 `worker.py` 或 nanobot 核心代码修改的任务，**必须通过 CLI 发起**：

```bash
nanobot agent --session "feat-xxx"
```

CLI 模式下 nanobot 是独立进程，不依赖 worker/gateway，修改任何文件后可安全地用 `restart-gateway.sh` 重启服务。

#### 规则 3：nanobot（AI）自觉遵守

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

#### 规则 4：任务拆分策略

对于复杂的跨组件任务，拆分为多个安全步骤：

```
Step 1 (Web UI 安全执行):
  - 修改前端代码 + vite build + commit
  
Step 2 (Web UI 安全执行):
  - 修改 gateway.py + commit（不重启）
  
Step 3 (需要 CLI 或手动操作):
  - 修改 worker.py + commit
  - 用户手动: restart-gateway.sh all
  
Step 4 (Web UI 安全执行):
  - 验证 + 测试
```

---

## 二十五、迭代反馈 (v3.3.1)

> 2026-02-27 配置页面增强 + Session 管理增强

### Issue #33：配置页面不支持对象数组展示（多租户飞书配置）

**现象**：
1. 飞书配置从单对象改为多租户数组格式后（`feishu: [{name: "ST", ...}, {name: "lab", ...}]`）
2. 配置页面将整个数组 `JSON.stringify` 塞入一个 input 框，无法正常查看和编辑

**解决方案**：
- 新增 `isObjectArray()` 判断函数，区分简单数组（如 `allowFrom: []`）和对象数组（如多租户配置）
- `ConfigObject` 组件支持对象数组：每个数组元素展开为独立的可折叠子面板，标题取 `name` 字段
- `handleChange` 支持数组索引路径（如 `channels.feishu.0.appSecret`）
- 新增 `arrayBadge` 样式，数组标题旁显示 "N 项" 小标签

### Issue #34：Session 搜索功能

**现象**：Session 数量增多后，在列表中查找特定对话困难，需要逐个翻阅。

**解决方案**：
- 后端新增 `GET /api/sessions/search?q=keyword` — 搜索 session 标题和用户消息内容
  - 匹配标题（custom_name 或首条用户消息摘要）和用户消息内容
  - 返回匹配的 session 列表，每个包含最多 3 条匹配摘要
  - 标题匹配优先排序，最多返回 20 条结果
- 前端 Sidebar 新增搜索栏（在"新建对话"按钮下方）
  - 输入关键词后 300ms debounce 搜索
  - 搜索结果替代 session 列表显示
  - 点击搜索结果跳转到对应 session
  - 清除搜索恢复正常列表

### Issue #35：删除 Session 改为移入回收站

**现象**：删除 session 时直接删除 JSONL 文件，无法恢复误删的对话。

**解决方案**：
- 后端 `DELETE /api/sessions/:id` 改为将文件移入 `sessions/.trash/` 目录
- 同名文件已存在时自动添加时间戳后缀（如 `session_20260227145100.jsonl`）
- 日志记录移动操作，便于追溯

---

---

## 二十六、迭代反馈 (v3.5)

> 2026-02-27 命名优化 + URL 编码 Bug 修复

### Issue #36：Web Chat 的 gateway 与 nanobot 核心 gateway 命名混淆

**现象**：
1. Web Chat 项目中的 `gateway.py` 与 nanobot 核心仓库的 `gateway` 概念经常混淆
2. 日志文件 `/tmp/nanobot-gateway.log`、PID 文件 `/tmp/nanobot-gateway.pid`、重启脚本 `restart-gateway.sh` 等命名都使用 "gateway"
3. 在讨论和文档中需要额外说明"web-chat 的 gateway"还是"nanobot 的 gateway"

**解决方案**：
- 将 `gateway.py` 重命名为 `webserver.py`（Web Chat 的 HTTP 服务器 + API 网关 + 静态文件服务）
- `restart-gateway.sh` 重命名为 `restart.sh`
- 日志文件：`/tmp/nanobot-gateway.log` → `/tmp/nanobot-webserver.log`
- PID 文件：`/tmp/nanobot-gateway.pid` → `/tmp/nanobot-webserver.pid`
- 代码内部的 logger name、service name 等同步更新
- 更新所有文档中的引用

### Issue #37 (Bug)：文件名含 URL 编码字符的 Session 无法显示和删除

**现象**：
1. 文件名为 `test%3Ainject_e2e2.jsonl` 的 session 在列表中可见
2. 但点击后消息无法加载（显示 "Session not found"）
3. 删除操作也失败

**根因**：
- 后端 `_parse_path()` 不对 URL 路径做 decode
- 前端用 `encodeURIComponent("test%3Ainject_e2e2")` 发请求，`%` 被编码为 `%25`
- 后端收到 `test%253Ainject_e2e2`，与实际文件名 `test%3Ainject_e2e2` 不匹配
- 本质是**双重 URL 编码**问题

**修复方案**：
- 在 `_parse_path()` 中对 path 做 `urllib.parse.unquote()` 解码
- 这样无论前端是否编码，后端都能正确匹配文件名

---

---

## 二十七、图片输入功能 (v4.0)

> 2026-02-27 支持用户在 Web Chat 中发送图片，利用 Claude 多模态能力理解图片内容

### Issue #38：Web Chat 不支持图片输入

**现象**：
1. 用户在 Web Chat 中无法发送图片
2. Claude 模型本身支持多模态图片理解，但 Web Chat 前端没有图片上传入口
3. nanobot 核心的 `_build_user_content()` **已经支持** `media` 参数（本地文件路径列表），会自动读取、base64 编码、构建多模态消息
4. 但 SDK 层（`AgentRunner.run()` 和 `process_direct()`）未暴露 `media` 参数

**整体数据流**：

```
前端拖入/粘贴图片 → base64 预览 + 上传到 webserver → 保存到 uploads/ 目录
                                                    ↓
发送消息时 → POST {message, images: [path1, path2]} → webserver 转发给 worker
                                                       ↓
worker → AgentRunner.run(message, media=[path1, path2])
                                                       ↓
nanobot 核心 → _build_user_content() 已支持 base64 编码图片 ✅
                                                       ↓
Claude API → 多模态理解 → 回复
```

**需要改动的组件**：

| 组件 | 改动 | 风险 |
|------|------|------|
| **nanobot 核心** | `process_direct()` + `AgentRunner.run()` 增加 `media` 参数透传 | 🔴 高风险（需重启 worker） |
| **worker.py** | 接收 `images` 字段，传给 `runner.run(media=...)` | 🔴 高风险（需重启 worker） |
| **webserver.py** | 图片上传 API + 图片静态服务 + 转发 images 给 worker | 🟡 中风险 |
| **前端** | 拖拽/粘贴图片 + 缩略图预览 + 发送 + 消息中显示图片 | 🟢 安全 |

#### 图片存储方案

```
~/.nanobot/workspace/uploads/
  ├── 2026-02-27/
  │   ├── abc123.png
  │   ├── def456.jpg
  │   └── ...
  └── 2026-02-28/
      └── ...
```

- 按日期分目录，文件名用 UUID 避免冲突
- 上传时返回文件路径，发送消息时传路径给后端
- 图片通过 `/api/uploads/<date>/<filename>` 提供静态访问（消息中显示用）

#### 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | 上传图片，返回文件路径 |
| GET | `/api/uploads/<date>/<filename>` | 静态访问已上传图片 |

**POST /api/upload 请求**：
- Content-Type: `multipart/form-data`
- Body: `file` 字段（图片二进制）
- 响应: `{ "path": "/path/to/uploads/2026-02-27/abc123.png", "url": "/api/uploads/2026-02-27/abc123.png" }`

**Worker execute-stream 请求扩展**：
```json
{
  "session_key": "webchat:xxx",
  "message": "这张图片里有什么？",
  "images": ["/path/to/uploads/2026-02-27/abc123.png"]
}
```

#### 前端交互设计

**输入区域**：
```
┌──────────────────────────────────────────────────────┐
│ [📎 缩略图1] [📎 缩略图2] [× 移除]                    │  ← 图片预览区（有图片时显示）
├──────────────────────────────────────────────────────┤
│ [📎] 输入消息...                        [发送]        │  ← 添加图片按钮 + 输入框
└──────────────────────────────────────────────────────┘
```

**图片输入方式**：
1. 点击 📎 按钮选择文件
2. 拖拽图片到输入区域
3. 粘贴剪贴板中的图片（Ctrl/Cmd+V）

**图片预览**：
- 上传前使用 FileReader 读取 base64 本地预览
- 上传后替换为服务端 URL
- 缩略图固定高度（如 80px），可点击查看大图
- 每张图片右上角有 × 移除按钮

**消息中的图片显示**：
- 用户消息中的图片以缩略图形式显示
- 点击可查看大图（lightbox 或新标签页）
- 需要从 JSONL 中的 `content` 数组解析 `image` 类型项

#### nanobot 核心改动

**`process_direct()` 签名扩展**：
```python
async def process_direct(
    self,
    content: str,
    session_key: str = "cli:direct",
    channel: str = "cli",
    chat_id: str = "direct",
    media: list[str] | None = None,  # ← 新增
    on_progress: ...,
    callbacks: ...,
) -> str:
```

**`AgentRunner.run()` 签名扩展**：
```python
async def run(
    self,
    message: str,
    session_key: str,
    media: list[str] | None = None,  # ← 新增
    callbacks: ...,
) -> AgentResult:
```

#### 实施策略

由于涉及 worker.py 和 nanobot 核心修改（🔴高风险），按照 Issue #32 安全规则：
1. **前端 + webserver 改动**：可在 Web UI 中安全执行
2. **nanobot 核心 + worker.py 改动**：必须在 CLI 中执行，完成后手动 `restart.sh all`

---

## 二十八、Bug 修复 (v4.0.1)

> 2026-02-27 Web Chat 消息显示问题

### Issue #39：agent 使用 message 工具发送的内容在 Web Chat 中不显示

**现象**：
1. agent 在 web chat session 中调用 `message` 工具发送回复
2. 工具返回 "Message sent to web:xxx"（成功）
3. 但消息内容实际上没有到达前端
4. 前端只看到一个折叠的工具调用块（需展开才能看到 agent 的前置文本），最终回复为空

**根因**：
1. **Worker MessageBus 无 subscriber**：`AgentRunner.from_config()` 创建的 `MessageBus` 没有注册任何 outbound subscriber。`MessageTool` 通过 `bus.publish_outbound()` 发送消息，但无人接收，消息丢失。
2. **前端渲染**：最后一个 assistant turn 结构为 `[assistant(content+toolCalls), tool(result), assistant(null)]`。`finalReplyMsg` 查找逻辑要求 `content` 非空且无 `toolCalls`，最后一条 assistant 的 content 为 null 不匹配，导致整个 turn 只有折叠的工具调用区域。

**影响**：这不是新 bug，而是 web chat 设计上的盲区 — 未预期 agent 会在 web chat 中使用 `message` 工具。在 IM 渠道（Telegram/Feishu）中 message 工具正常工作。

**解决方案**（待定，优先级低）：
- 方案 A：Worker 注册 bus outbound subscriber，将 `message` 工具内容转发为 SSE 事件
- 方案 B：前端特殊处理 `message` 工具调用，将其 `arguments.content` 当作最终回复渲染
- 方案 C：在 web chat 的 system prompt 中提示 agent 不需要使用 message 工具（直接回复即可）

**状态**：已记录，暂不修复。图片功能开发优先。

---

---

## 二十九、斜杠命令系统 (v4.1)

> 2026-02-27 Web UI 支持斜杠命令，与 CLI/飞书/Telegram 行为一致

### Issue #40：Web UI 不支持斜杠命令

**现象**：
1. 在 CLI 和 Telegram 中输入 `/help` 可查看支持的命令，输入 `/new` 可开始新对话
2. 在 Web UI 中输入 `/help` 或 `/new` 会作为普通消息发送给 agent，浪费 token
3. Web UI 缺少 `/stop` 命令来中断正在执行的任务

**现有命令系统梳理**：

| 命令 | CLI | Telegram | 飞书 | Web UI | 处理层级 |
|------|-----|----------|------|--------|----------|
| `/help` | ❌ 不支持 | ✅ Telegram handler 直接回复 | ❌ | ❌ | Channel / Agent Loop |
| `/new` | ❌（用 exit 退出） | ✅ 转发到 agent loop | ❌ | ❌ | Agent Loop |
| `/stop` | Ctrl+C | ❌ | ❌ | ✅ 有停止按钮 | 前端 UI |
| `exit/quit/bye` | ✅ CLI 层处理 | ❌ | ❌ | ❌ | CLI 层 |

**nanobot 核心 agent loop 已支持的命令**（`loop.py` `_process_message`）：
- `/new` — 归档当前 session 历史，清空 session，返回 "New session started."
- `/help` — 返回命令列表

**设计方案 — 前端命令拦截 + 后端透传**：

Web UI 的斜杠命令分为两类：

#### 1. 前端本地命令（不发送到后端）

| 命令 | 行为 | 说明 |
|------|------|------|
| `/stop` | 中断当前任务 | 等价于点击停止按钮，调用 `cancelTask()` |
| `/help` | 显示命令帮助 | 在消息区域显示命令列表（不消耗 token） |

#### 2. 后端命令（发送到 agent loop 处理）

| 命令 | 行为 | 说明 |
|------|------|------|
| `/new` | 开始新对话 | 发送到后端，agent loop 归档历史并清空 session |

**前端实现方案**：

在 `messageStore.sendMessage()` 中拦截斜杠命令：

```typescript
// 命令检测
const trimmed = content.trim().toLowerCase();
if (trimmed.startsWith('/')) {
  const cmd = trimmed.split(/\s/)[0]; // 取第一个词
  switch (cmd) {
    case '/help':
      // 本地处理：插入系统消息显示帮助
      break;
    case '/stop':
      // 本地处理：调用 cancelTask()
      break;
    case '/new':
      // 发送到后端，agent loop 处理
      break;
    default:
      // 未知命令，显示提示
      break;
  }
}
```

**`/help` 显示内容**：

```
🐈 nanobot commands:
/new  — 开始新对话（归档当前历史）
/stop — 停止正在执行的任务
/help — 显示此帮助信息
```

**`/new` 流程**：
1. 前端发送 `/new` 作为消息到后端
2. Agent loop 执行 session 归档 + 清空
3. 返回 "New session started."
4. 前端收到响应后重新加载消息列表（应该为空）
5. 刷新 session 列表

**`/stop` 流程**：
1. 前端检测到 `/stop`
2. 如果当前 session 有正在执行的任务 → 调用 `cancelTask()`
3. 如果没有任务 → 显示提示 "没有正在执行的任务"

**消息显示**：
- 斜杠命令不作为 user 消息显示在消息列表中（不乐观更新）
- `/help` 的响应显示为系统消息（特殊样式）
- `/new` 的响应由后端返回，正常显示
- `/stop` 的响应作为系统提示显示

**系统消息样式**：
- 居中显示，灰色背景，圆角
- 与 user/assistant 消息视觉区分
- 不参与工具调用折叠逻辑

---

### Issue #41：Runtime Context 过滤逻辑统一收拢 ✅

**问题**：nanobot agent 在用户消息末尾追加 `[Runtime Context]` 元数据块（包含时间、channel、chat ID 等），这些内容不应在前端展示。之前在 webserver.py 的 5-6 处分散使用 `re.split()` 过滤，逻辑重复且不一致：
- session 列表 summary：先拼接 multimodal text blocks 再 strip，导致空格分隔时正则匹配失败
- 消息列表：每处重复写 string/list 两种格式的过滤逻辑
- 搜索、analytics 等处各自独立实现

**修复**：
1. 提取统一的 `strip_runtime_context(content)` 模块级函数，同时处理 string 和 multimodal list 两种格式
2. 使用预编译正则 `(?:^|\n)\s*\[Runtime Context\].*`（`re.DOTALL`），支持匹配字符串开头和换行后两种位置
3. 对 multimodal list：逐 block 清理 text 内容，纯 RC 的 text block 直接移除
4. 修复处理顺序：**先 strip 再 flatten**（先对原始 content 调用清理函数，再拼接 text），避免拼接后格式变化导致匹配失败
5. 所有 5 处读取用户消息内容的地方统一调用此函数

**影响范围**：
- `_handle_get_sessions` — session 列表 summary
- `_handle_get_messages` — 消息列表
- `_handle_search_sessions` — 搜索结果
- `_enrich_analytics_sessions` — analytics session 摘要

---

## 三十、Session 列表按来源分组 (v4.2)

> 2026-02-28 Session 管理体验优化

### Issue #42：Session 列表按来源分组显示

**现象**：Session 列表是平铺的，随着来源多样化（网页、命令行、飞书、Telegram 等），不同来源的 session 混在一起，查找不便。

**期望**：
1. **按来源分组**：根据 `sessionKey` 的冒号前缀（channel 类型）将 session 分组
2. **分组头标题**：每组显示带图标的分组标题（如 🌐 网页对话、💻 命令行、💬 飞书 等）
3. **组内排序**：每组内仍按最近活跃时间倒序
4. **分组顺序**：网页对话优先（最常用），其他按组内最新活跃时间排序
5. **可折叠**：每个分组可折叠/展开，节省空间

**来源分类规则**（从 `sessionKey` 冒号前提取 channel）：

| Channel 前缀 | 分组名 | 图标 |
|--------------|--------|------|
| `webchat` | 网页对话 | 🌐 |
| `cli` | 命令行 | 💻 |
| `feishu` / `feishu.*` | 飞书 | 💬 |
| `telegram` | Telegram | ✈️ |
| `discord` | Discord | 🎮 |
| `test` | 测试 | 🧪 |
| 其他 | 其他 | 📁 |

**渲染示例**：
```
┌──────────────────────┐
│ 🌐 网页对话 (15)      │  ← 分组头（可折叠）
│   新对话              │
│   帮我重构 utils.py   │
│   查看明天日程        │
│   ...                │
│                      │
│ 💬 飞书 (3)           │
│   飞书对话 1          │
│   飞书对话 2          │
│   ...                │
│                      │
│ 💻 命令行 (2)         │
│   CLI 对话            │
│   ...                │
└──────────────────────┘
```

**实现方案**：纯前端改动，不需要修改后端 API。
- `SessionList.tsx`：新增分组逻辑，从 `sessionKey` 提取 channel，分组渲染
- `Sidebar.module.css`：新增分组头样式

---

## 三十一、运行时 Provider 动态切换 (v4.3)

> 2026-03-01 运行时 Provider 切换，前后端联动
> 依赖：nanobot 核心 Phase 16 ProviderPool（已完成，详见 nanobot 核心仓库 `docs/REQUIREMENTS.md §十五`）
> 详细设计：[`PROVIDER_POOL_DESIGN.md`](PROVIDER_POOL_DESIGN.md)

### Issue #43：Web Chat 支持运行时 Provider 动态切换

**需求背景**：
- Agent token 消耗量大，需要根据任务难度切换不同 API 源控制成本
- nanobot 核心已实现 `ProviderPool` 类（commit `e31c837`），支持运行时切换 active provider + model
- Web Chat 需要在 Worker/Webserver/前端三层集成此功能

**功能描述**：
1. **Worker**：维护模块级 ProviderPool 单例，提供 `GET/PUT /provider` API 端点
2. **Webserver**：转发 `/api/provider` 请求到 Worker
3. **前端 `/provider` 斜杠命令**：查询当前状态或切换 provider
4. **前端 Provider 选择器 UI**：ChatInput 上方的 provider + model 选择器
5. **任务执行中保护**：前端 UI disabled + 斜杠命令提示 + Worker API 返回 409

**交互设计**：

Provider 选择器（ChatInput 上方）：
```
┌─────────────────────────────────────┐
│  🔌 anthropic / claude-opus-4-6  ▾ │  ← 点击展开下拉选择
├─────────────────────────────────────┤
│  [消息输入框]              [发送]    │
└─────────────────────────────────────┘
```

`/provider` 命令：
| 用法 | 效果 |
|------|------|
| `/provider` | 显示当前 active + 可用列表（system-local 消息） |
| `/provider <name> [model]` | 切换 provider（任务中拒绝） |

**后端 API**：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/provider` | 查询当前 active + available（转发到 Worker） |
| PUT | `/api/provider` | 切换 provider（转发到 Worker，任务中返回 409） |

**改动范围**：
| 文件 | 改动 |
|------|------|
| `worker.py` | 模块级 ProviderPool 单例 + GET/PUT /provider + _create_runner 改造 |
| `webserver.py` | 转发 GET/PUT /api/provider |
| `frontend/src/services/api.ts` | getProvider() / setProvider() |
| `frontend/src/store/providerStore.ts` | 新建 provider 状态管理 |
| `frontend/src/store/messageStore.ts` | /provider 斜杠命令 + /help 更新 |
| `frontend/src/pages/chat/ChatInput.tsx` | Provider 选择器 UI |
| `frontend/src/pages/chat/ChatInput.module.css` | 选择器样式 |

---

## 三十二、LLM 错误响应前端展示 (v4.4)

### 需求背景

nanobot core 合并 upstream 后，LLM API 返回 `finish_reason="error"` 时不再存储到 session JSONL。这导致 web-chat 前端无法显示错误信息，用户看到空白或 loading 状态。

Phase 23（nanobot core）已修复后端，将错误消息以 `"Error calling LLM: {text}"` 前缀存储到 JSONL，并通过 `callbacks.on_message()` + `on_progress()` 通知前端。

### 前端需求

1. 检测 assistant 消息中的 `"Error calling LLM:"` 前缀
2. 剥离前缀，显示干净的错误文本
3. 错误消息使用 ❌ 图标 + 红色调气泡样式，与正常消息区分
4. 在 `MessageItem`（独立消息）和 `AssistantTurnGroup`（工具调用+回复组）中均生效

### 改动范围

| 文件 | 改动 |
|------|------|
| `MessageItem.tsx` | `isErrorMessage()` / `getErrorText()` 辅助函数 + 错误样式应用 |
| `MessageList.module.css` | `.errorBubble` / `.errorIcon` / `.errorText` 样式 |

---

## 三十三、Provider 配置热加载 + 默认模型配置 (v4.5) ✅ 已完成

> 2026-03-04 Provider 管理增强 — Phase 40 实现

### Issue #44：新增 Provider 配置后 Web Chat 不显示

**现象**：
1. 在配置页面新增 `gemini` 和 `custom` provider 的 API Key 并保存
2. ChatInput 的 Provider 选择器下拉列表中不显示新增的 provider
3. 只有重启 Worker 服务后才能看到

**根因**：
- Worker 的 `_provider_pool` 是模块级单例，`_build_pool()` 只在首次调用时执行
- 配置保存后 Worker 不知道需要重新加载配置
- ProviderPool 一旦构建就不会自动更新

**解决方案**：
1. Worker 新增 `POST /provider/reload` 端点 — 重新从 config 构建 ProviderPool
2. Webserver 新增 `POST /api/provider/reload` 转发路由
3. Webserver 在 `PUT /api/config` 保存成功后自动调用 Worker reload
4. 前端 ConfigPage 保存成功后刷新 providerStore

### Issue #45：配置保存后不立即生效

**现象**：
1. 在配置页面修改 provider 的 API Key 或 API Base 后保存
2. 发送消息仍然使用旧的配置
3. 需要手动重启 Worker 才能生效

**解决方案**：
- 同 Issue #44，通过 reload 机制解决
- 保存配置后自动触发 Worker 重新加载 ProviderPool
- reload 时保持当前 active provider（如果仍然可用），否则切换到默认

### Issue #46：Provider 缺少可配置的默认优先模型

**现象**：
1. Provider 选择器中每个 provider 显示的 model 是硬编码的默认值（如 gemini 固定显示 `gemini-2.0-flash`）
2. 用户无法为每个 provider 配置自己偏好的默认模型
3. 切换 provider 时只能使用硬编码的默认模型

**解决方案**：
1. nanobot 核心 `ProviderConfig` schema 新增 `preferred_model` 字段（可选）
2. `_make_provider()` 构建 ProviderPool 时优先使用 `preferred_model`，fallback 到 `_PROVIDER_DEFAULT_MODELS` 硬编码值
3. 前端配置页面可编辑 `preferredModel` 字段
4. Provider 选择器下拉列表中显示配置的 preferred model

**技术方案**：

#### nanobot 核心改动

```python
# config/schema.py
class ProviderConfig(Base):
    api_key: str = ""
    api_base: str | None = None
    extra_headers: dict[str, str] | None = None
    preferred_model: str | None = None  # ← 新增：用户偏好的默认模型

# cli/commands.py _make_provider()
# 构建 pool_entries 时：
# model_for_entry = p.preferred_model or _default_model_for_provider(spec.name)
```

#### Worker 改动

```python
# POST /provider/reload — rebuild ProviderPool from config
def _handle_reload_provider(self):
    global _provider_pool
    with _pool_lock:
        if _has_running_tasks():
            return 409, {"error": "Tasks running, cannot reload"}
        old_active = _provider_pool.active_provider if _provider_pool else None
        _provider_pool = _build_pool()
        # Try to preserve active provider
        if old_active and old_active in [p['name'] for p in _provider_pool.available]:
            _provider_pool.switch(old_active)
    return 200, {"status": "reloaded", ...}
```

#### Webserver 改动

```python
# PUT /api/config 保存成功后：
# 自动调用 Worker POST /provider/reload

# POST /api/provider/reload 转发路由
```

#### 前端改动

- ConfigPage: 保存成功后调用 `providerStore.fetchProvider()` 刷新
- 无需新增 UI 组件

**改动范围**：

| 文件 | 改动 | 风险 |
|------|------|------|
| nanobot `config/schema.py` | ProviderConfig 新增 `preferred_model` | 🔴 高风险 |
| nanobot `cli/commands.py` | `_make_provider()` 使用 preferred_model | 🔴 高风险 |
| `worker.py` | POST /provider/reload 端点 | 🔴 高风险 |
| `webserver.py` | POST /api/provider/reload 转发 + config 保存后 reload | 🟡 中风险 |
| `frontend/src/pages/config/ConfigPage.tsx` | 保存后刷新 provider | 🟢 安全 |

---

---

## 三十四、API Session 前端辨识与树形管理 (v4.6~v4.7)

> 2026-03-06 从 Backlog #15 提升为正式需求（对应 eval-bench 改进需求 B5）

### 背景与现象

eval-bench 批量构造产生了大量 API 创建的 session（dispatch/worker/qa_r2_fix 等），与手动 session 混在 🌐 网页对话 分组中，存在两个层面的问题：

1. **辨识问题**：无法区分哪些是用户手动创建的、哪些是 API 程序化创建的，批量 session 淹没了日常对话
2. **层级问题**：API session 之间存在父子关系（dispatch → worker），平铺列表无法体现层级

### API Session 命名模式

| 模式 | 示例 | 说明 |
|------|------|------|
| `webchat:dispatch_*` | `webchat:dispatch_1772696251_gen1` | 调度 session |
| `webchat:worker_*` | `webchat:worker_1772696251_A10` | Worker session |
| `webchat:qa_r2_dispatch_*` | `webchat:qa_r2_dispatch_1` | QA 调度 session |
| `webchat:qa_r2_fix_*` | `webchat:qa_r2_fix_task-003` | QA 修复 session |
| `subagent:*` | `subagent:webchat_1772726793_abc123` | spawn 子 agent session |
| `webchat:<timestamp>` | `webchat:1772030778` | 手动创建（纯数字 timestamp） |

**识别规则**：webchat channel 下，session_key 冒号后部分如果是纯数字（timestamp），则为手动创建；否则为 API 创建。

### 解决方案

分两步实现：先区分手动/API session（子分组），再在 API session 内建立父子树形结构。

#### Phase 41: API Session 子分组（Issue #47）

在 🌐 网页对话 分组内，将 session 分为两个子组：
- **手动对话**：session_key 冒号后为纯数字，正常显示在分组头下方
- **🤖 自动任务**：session_key 冒号后包含非数字字符，收纳在可折叠的子分组内

**前端实现**（纯前端改动）：
- `isApiSession(sessionKey)` 辅助函数：冒号后非纯数字 → API session
- `ApiSessionSubgroup` 组件：🤖 图标 + 计数 + 折叠/展开
- 子分组头样式比 channel 分组头更小更紧凑

#### Phase 42: 父子关系树形展示（Issue #48）

API session 之间存在父子关系，需要树形展示。

**父子关系数据源**（三层，优先级递减）：
1. **映射文件** `session_parents.json`：手动标注的 `{ 子key: 父key }` 映射，通过后端 API 读取
2. **启发式规则 A**：`subagent:{parent_key_sanitized}_{task_id}` 自动提取 parent key
3. **启发式规则 B**：`webchat:<role>_<10位timestamp>_<detail>` 提取 timestamp → 在所有 session 中搜索以 `:<timestamp>` 结尾的 session 作为父节点（支持跨通道，如 `cli:xxx`、`feishu.lab:xxx`）

**后端 API**：
- `GET /api/sessions/parents` — 读取 `~/.nanobot/workspace/sessions/session_parents.json`
- `PUT /api/sessions/parents` — 写入映射文件（预留，暂未使用）

**前端实现**：
- `sessionStore` 加载 `parentMap`，与 session 列表同步拉取
- `buildSessionTree()` 函数：合并映射文件 + 启发式规则，构建 `TreeNode` 树
- 根 session 显示蓝色后代数量徽章（`childBadge`）
- 子 session 可折叠/展开面板（"收起/展开 N 个子 session"）
- 递归渲染支持多级嵌套
- 分组标题计数只数根节点（`group.roots.length`）

**UI 渲染示例**：
```
┌──────────────────────────────────────────┐
│ 🌐 网页对话 (15)                          │  ← 只数根节点
│   新对话                                  │
│   帮我重构 utils.py                       │
│                                          │
│   🤖 自动任务 ▾                           │
│     eval-bench 批量测例构造  [26]         │  ← 蓝色徽章
│       ▸ 收起 26 个子 session              │
│         dispatch_...gen1                 │
│         worker_...A10            [5]     │  ← 子 session 也可有后代
│         ...                              │
│     eval-bench QA R2 修复        [12]     │
│       ▸ 展开 12 个子 session              │
└──────────────────────────────────────────┘
```

### 改动范围（合并）

| 文件 | 改动 | Phase |
|------|------|-------|
| `webserver.py` | `GET/PUT /api/sessions/parents` 路由 | 42 |
| `frontend/src/services/api.ts` | `fetchSessionParents()` API | 42 |
| `frontend/src/store/sessionStore.ts` | `parentMap` 状态 + 加载逻辑 | 42 |
| `frontend/src/pages/chat/Sidebar/SessionList.tsx` | API 子分组 + 树形结构 + 徽章 + 折叠面板 | 41+42 |
| `frontend/src/pages/chat/Sidebar/Sidebar.module.css` | 子分组头 + 树形节点 + 徽章样式 | 41+42 |

### 已知设计决策

- **overflow 截断修复**：`sessionSummary` 的 `overflow:hidden` 会裁掉 `childBadge`，需用 `sessionSummaryText` span 包裹文本部分，徽章设 `flex-shrink: 0` 始终可见
- **计数规则**：channel 分组标题的总数只数根节点，不算子 session
- **映射文件兜底**：启发式规则无法覆盖的父子关系（如自定义命名的 session），通过 `session_parents.json` 手动标注

---

## 三十五、三级树状 Session 父子关系 (v4.8)

> 2026-03-06 从扁平化父子关系升级为三级树状结构

### Issue #49：batch 调度场景下 session 父子关系应体现三级树状结构

**现象**：
1. batch-orchestrator 场景下，调度 session 和 Worker session 都直接挂在主控 session 下（扁平化）
2. 无法区分哪些 Worker 属于哪个调度 session
3. 当有多代调度时（gen1, gen2），Worker 混在一起，管理困难

**期望**：体现三级树状结构：主控 → 调度 → Worker

```
主控 session (webchat:1772696251)
├── 调度 gen1 (webchat:dispatch_1772696251_1772700001)
│   ├── Worker task003 (webchat:worker_1772700001_task003)
│   └── Worker task005 (webchat:worker_1772700001_task005)
└── 调度 gen2 (webchat:dispatch_1772696251_1772700500)
    ├── Worker task017 (webchat:worker_1772700500_task017)
    └── Worker task020 (webchat:worker_1772700500_task020)
```

**解决方案**：

#### 命名规范变更

**调度 session**：key 中包含两个 10 位 timestamp
```
webchat:dispatch_<主控ts>_<调度自身ts>
```

**Worker session**：parent_ref 指向调度的 timestamp（而非主控的）
```
webchat:worker_<调度ts>_<detail>
```

#### 前端启发式规则 B 扩展

`resolveParent()` 提取第一个 10 位 timestamp 后，搜索顺序：
1. **精确匹配** `endsWith(':' + ts)` — 匹配根 session（如 `webchat:1772696251`）
2. **后缀匹配** `endsWith('_' + ts)` — 匹配调度等中间层 session（如 `webchat:dispatch_1772696251_1772700001`）

这样：
- 调度 `dispatch_1772696251_1772700001` 提取 `1772696251` → 精确匹配 `webchat:1772696251` ✓
- Worker `worker_1772700001_task003` 提取 `1772700001` → 精确无匹配 → 后缀匹配 `dispatch_..._1772700001` ✓

#### 向后兼容

- 旧的扁平命名（`worker_<主控ts>_xxx`）仍能被精确匹配到主控，只是显示为扁平（不报错）
- 新规则只是增加了 `endsWith('_' + ts)` 的备选搜索，不影响现有匹配

### 改动范围

| 文件/Skill | 改动 |
|-----------|------|
| `SessionList.tsx` `resolveParent()` | 扩展启发式规则 B：增加 `endsWith('_' + ts)` 备选搜索 |
| `skills/batch-orchestrator/SKILL.md` | 更新命名规范：调度 key 含双 timestamp，Worker parent_ref 指向调度 |
| `skills/web-subsession/SKILL.md` | 更新命名规范：三级树状结构说明、跨通道使用更新 |
| `MEMORY.md` | 更新启发式规则 B 描述 |

---

## 三十六、斜杠命令失败后输入回填 (v4.9)

> 2026-03-07 斜杠命令体验优化

### Issue #50：未知斜杠命令执行失败后输入框被清空，需重新输入

**现象**：
1. 用户在输入框中输入以 `/` 开头的非命令内容（如文件路径 `/Users/zhangxingcheng/...`）
2. 被斜杠命令系统识别为"未知命令"，显示错误提示 "未知命令: /users"
3. 但输入框已被 ChatInput 的 `handleSend()` 提前清空（`setDraft(activeSessionId, '')`）
4. 用户需要重新输入完整内容，体验不佳

**期望**：
1. 斜杠命令执行失败（未知命令）时，将原始输入内容**回填到输入框**
2. 用户可以直接在输入框中修改（如删掉开头的 `/`），而不是从头重新输入
3. 已知命令（`/help`, `/stop`, `/new`, `/flush`, `/provider`）执行成功后仍然清空输入框

**解决方案**：
- `messageStore.sendMessage()` 在 "Unknown slash command" 分支中，调用 `get().setDraft(sessionId, content)` 将原始输入回填到 draft
- ChatInput 已通过 `draftBySession` 绑定输入框内容，回填 draft 后输入框自动显示原始内容
- textarea 高度需要在回填后重新计算（通过 `adjustHeight()` 或 `requestAnimationFrame`）

**改动范围**：
| 文件 | 改动 | 风险 |
|------|------|------|
| `messageStore.ts` | unknown command 分支回填 draft | 🟢 安全 |
| `ChatInput.tsx` | draft 变化时重新计算 textarea 高度 | 🟢 安全 |

---

### 手动维护的 backlog

**note** 这个部分会手动添加希望增加的功能backlog，被任务激活后，参考下面的内容，按照合理逻辑更新前序需求文档说明，比如增加对应的需求描述章节，或者增加带编号的issue，并且推进对应的开发项。必要的时候，可以在交互过程中，跟澄清需求。对应的需求更新之后，从backlog中移除。

#### Backlog #17：API 子 Session 命名规范 Skill

**来源**: B5 开发过程中用户提出 (2026-03-06)

**背景**:
- 当前 API 创建的子 session 命名是约定俗成的（如 `webchat:dispatch_*`, `webchat:worker_*`）
- 缺少一个正式的 skill 来制定和强制执行命名规则
- 后续批量构造、调度等场景需要统一的命名规范

**需求**:
1. 创建一个 skill，定义通过 API 创建子 session 的命名规则
2. 规范格式：`webchat:<role>_<parent_ref>_<detail>`
3. 定义合法的 role 列表（dispatch, worker, review, fix 等）
4. 提供命名校验函数/工具

**优先级**: 低（B5 前端辨识完成后再制定）

#### Backlog #16：message tool 跨 Session 消息传递

**来源**: eval-bench 批量测例构造设计 (2026-03-05)

**背景**:
- 当前 message tool 只能向当前 session 的用户发送消息
- 调度 session / review session 完成后需要通知主 session
- 当前只能通过文件系统间接协调，主 session 需要手动检查进度

**需求**:
1. **扩展 message tool**: 增加 `target_session` 参数，支持向指定 session 发送跨 session 消息
2. **实现机制**: 通过 `MessageBus.publish_inbound(InboundMessage(channel="system"))` 注入目标 session
3. **安全限制**: `target_session` 只允许 `web:*` 和 `webchat:*` channel
4. **消息标识**: sender_id 标记来源 session，content 加前缀标识跨 session 消息
5. **代码改动**: `agent/tools/message.py` (~30行) + `agent/loop.py` (传入 bus 引用)

**涉及仓库**: nanobot 核心仓库 (非 web-chat)
**优先级**: 中（eval-bench 批量构造 Phase 3 迭代时实现）
**详细设计**: `eval-bench-data/batch_build/DESIGN.md` §4.2
