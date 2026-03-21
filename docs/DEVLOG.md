# nanobot Web Chat — 开发工作日志

<!-- 📖 文档组织说明
本开发日志采用"主文件 + 归档子文件"结构：
- **本文件（主文件）**：项目状态总览 + 全量 Phase 索引 + 最近 3 个 Phase 完整正文
- **devlog/ 子目录**：按 Phase 编号分组的历史开发记录归档

🔍 如何查找历史 Phase：
1. 在"全量 Phase 索引"表中按编号/标题找到归档文件链接
2. 最近 3 个 Phase 的完整正文直接在本文件底部

📝 如何记录新 Phase：
1. 在本文件底部追加新 Phase 正文（保持最近 3 个 Phase 在主文件中）
2. 将第 4 旧的 Phase 移入最新的归档文件
3. 更新"全量 Phase 索引"表
4. 更新"项目状态总览"表

⚠️ 维护规则：
- 主文件始终只保留最近 3 个 Phase 的完整正文
- 归档文件中的内容一旦写入不再删减
- 新 Phase 完成后及时更新状态总览表（🔜 → ✅）
- 全量索引表必须涵盖所有 Phase，一个不漏
-->

> 本文件是开发过程的唯一真相源。每次新 session 从这里恢复上下文。
> 找到 🔜 标记的任务，直接继续执行。
> 历史 Phase 详情见 `devlog/` 目录下的归档文件。

---

## 项目状态总览

| 阶段 | 状态 | 分支 |
|------|------|------|
| Phase 1: 脚手架 & 基础布局 | ✅ 已完成 | merged to develop |
| Phase 2: 后端 API + Session 管理 | ✅ 已完成 | merged to develop |
| Phase 3: 交互完善 | ✅ 已完成 | merged to develop |
| Phase 4: Markdown & 代码高亮 | ✅ 已完成 | merged to develop |
| Phase 5: 完善 & 部署 | ✅ 已完成 | merged to main |
| Phase 6: 迭代优化 v1.1 | ✅ 已完成 | merged to main |
| Phase 7: Bug 修复 v1.2 | ✅ 已完成 | main |
| Phase 8: Bug 修复 + 架构拆分 v1.2 | ✅ 已完成 | main |
| Phase 9: 流式输出 (SSE Streaming) | ✅ 已完成 | main |
| Phase 10: 工具调用折叠优化 v1.4 | ✅ 已完成 | main |
| Phase 11: 自修改事故修复 + 日志 + Session 重命名 | ✅ 已完成 | main |
| Phase 12: 优雅降级 — Gateway 重启不中断任务 | ✅ 已完成 | main |
| Phase 13.1: Bug 修复 — Session 重命名后发消息被恢复 | ✅ 已完成 | main |
| Phase 14: 功能模块 v2.0 — 配置/记忆/Skill | ✅ 已完成 | main |
| Phase 15: Bug 修复 — SSE 断开后前端误判任务完成 | ✅ 已完成 | main |
| Phase 16: Bug 修复 — 消息 timestamp 不准确 | ✅ 已完成 | main (nanobot core) |
| Phase 17: 任务执行体验优化 (Issue #7/#8/#9) | ✅ 已完成 | main |
| Phase 18: Token 用量统计 (Issue #10) | ✅ 已完成 | nanobot: local 分支, web-chat: main |
| Phase 19: Token 用量 SQLite 独立存储 | ✅ 已完成 | web-chat: main, nanobot: local |
| Phase 22: Backlog 1-5 修复 | ✅ 已完成 | web-chat: main, nanobot: local |
| Phase 23: exec PIPE 卡死修复 + Usage 刷新 | ✅ 已完成 | web-chat: main, nanobot: local |
| Phase 24: SDK 化 + 实时持久化 + 统一 Token | ✅ 已完成 | nanobot: local, web-chat: main |
| Phase 25: 执行过程展示完整性优化 (Issue #24) | ✅ 已完成 | web-chat: main |
| Phase 26: 工具调用间隙用户消息注入 (Issue #25) | ✅ 已完成 | nanobot: local, web-chat: main |
| Phase 27: Worker 并发任务支持 (Issue #26) | ✅ 已完成 | web-chat: main |
| Phase 28: 用量统计增强 + 工具调用用量展示 (Issue #27/#28) | ✅ 已完成 | web-chat: main |
| Phase 29: Web UI 自修改安全实践 (Issue #32 / Backlog #14) | ✅ 已完成 | web-chat: main |
| Phase 30: 配置增强+搜索+回收站 (Issue #33/#34/#35) | ✅ 已完成 | web-chat: main |
| Phase 31: 改名 + URL 编码修复 (Issue #36/#37) | ✅ 已完成 | web-chat: main |
| Phase 32: 图片输入功能 (Issue #38) | ✅ 已完成 | web-chat: main, nanobot: local |
| Phase 33: 斜杠命令系统 (Issue #40) | ✅ 已完成 | web-chat: main |
| Phase 34: Runtime Context 过滤统一收拢 (Issue #41) | ✅ 已完成 | web-chat: main |
| Phase 35: Session 列表按来源分组 (Issue #42) | ✅ 已完成 | web-chat: main |
| Phase 36: ProviderPool — Web Chat Provider 切换 (Issue #43) | ✅ 已完成 | fix/sse-freeze |
| Phase 37: Bug 修复 — SSE 流中断导致前端卡死 | ✅ 已完成 | fix/sse-freeze |
| Phase 38: LLM 错误响应前端展示 | ✅ 已完成 | main |
| Phase 39: Message 工具 fallback 显示 + 项目清理 | ✅ 已完成 | main |
| Phase 40: Provider 配置热加载 + 默认模型配置 (Issue #44/#45/#46) | ✅ 已完成 | main |
| Phase 41: API Session 前端辨识 (Issue #47 / Backlog #15 → B5) | ✅ 已完成 | main |
| Phase 42: Session 树形结构 (§三十四 Issue #48) | ✅ 已完成 | main |
| Phase 43: 三级树状父子关系 (§三十五 Issue #49) | ✅ 已完成 | main |
| Phase 44: 斜杠命令失败后输入回填 (§三十六 Issue #50) | ✅ 已完成 | main |
| Phase 45: restart.sh 进程发现与健康检查修复 (§三十七 Issue #51) | ✅ 已完成 | main |
| Phase 46: Session Tag — done 标记与过滤 (§三十八 Issue #52) | ✅ 已完成 | main |
| Phase 47: Bug 修复 — 后端不可达时消息静默丢失 | ✅ 已完成 | main |
| Phase 47.5: Cache Usage 字段 + 上下文长度展示 (§三十九附) | ✅ 已完成 | main |
| Phase 48: 全链路统一用 session.id 替代 sessionKey (§三十九 Issue #53) | ✅ 已完成 | main |
| Phase 49: 用量统计页面增强 (§四十 Issue #54) | ✅ 已完成 | main |
| Phase 50: System Inject 消息展示 (§四十一 Issue #55) | ✅ 已完成 | main |
| Phase 51: Subagent 消息 Role 适配 (§四十二) | ✅ 已完成 | main |
| Phase 52: REQUIREMENTS.md Backlog 区域重构 | ✅ 已完成 | main |
| Phase 53: 日志路径统一迁移 — /tmp → ~/.nanobot/logs/ | ✅ 已完成 | main |
| Phase 54: 前端 Markdown 渲染修复与消息复制 (§四十三) | ✅ 已完成 | main |
| Phase 55: SubagentManager 单例化 (nanobot §40) | ✅ 已完成 | main |
| Phase 56: Web-chat 基础改动 (§四十四~§四十七) | ✅ 已完成 | main |
| Phase 57: Subagent 可见性 — 运行标识与进度 (§四十八~§五十) | ✅ 已完成 | main |
| Phase 58: 闭合标签 + 滚动按钮 (§五十一~§五十二) | ✅ 已完成 | main |
| Phase 58 Hotfix: 标签泄露 + 滚动修复 | ✅ 已完成 | main |
| Phase 59: Plan D Hotfix — 并发消息丢失 + 前端最终刷新 + 滚动保持 (§五十五~§五十七) | ✅ 已完成 | feat/batch-20260313-plan-web-frontend |
| Phase 59 Hotfix: Subagent Session 滚动位置保持修复 | ✅ 已完成 | feat/batch-20260313-plan-web-frontend |

---

## ⚠️ 重要约束

1. **不破坏现有服务**：`server.py` + `index.html` 是旧版 UI（已弃用）。新架构使用 `gateway.py` (:8081) + `worker.py` (:8082)。
2. **每次 session 只做 1 个小任务**：找到 🔜，做完标 ✅，标下一个 🔜，commit。
3. **Vite proxy 指向 gateway.py (8081)**。

---

## 全量 Phase 索引

| Phase | 标题 | 状态 | 归档文件 |
|-------|------|------|---------|
| 2 | 后端 API + 前端 Session 管理 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 3 | 交互完善 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 4 | Markdown 渲染 & 代码高亮 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 5 | 完善 & 部署 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 6 | 迭代优化 v1.1（用户反馈修复） | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| — | 完成记录 | — | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 7 | Bug 修复 v1.2 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 8 | Bug 修复 + 架构拆分 v1.2 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 10 | 工具调用折叠优化 v1.4 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 11 | 自修改事故修复 + 日志 + Session 重命名 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 12 | 优雅降级 — Gateway 重启不中断任务 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 13 | 工具调用折叠优化 — 前置文本一起折叠 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 13.1 | Bug 修复 — Session 重命名发消息后被恢复 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 16 | Bug 修复 — 消息 timestamp 不准确 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 15 | Bug 修复 — SSE 断开后前端误判任务完成 | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 14 | 功能模块 v2.0 — 配置/记忆/Skill | ✅ | [devlog/phase-02-14.md](devlog/phase-02-14.md) |
| 17 | 任务执行体验优化 (Issue #7/#8/#9) | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 18 | Token 用量统计 (Issue #10) | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 19 | Token 用量 — SQLite 独立存储 (Issue #10 续) | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 20 | Usage 数据流重构 — 移除 JSONL 依赖 | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 21 | 用量统计增强 — Session 用量 + 全局看板 | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 22 | Backlog 1-5 修复 | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 23 | exec 工具 PIPE 卡死修复 + Usage 刷新 | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 24 | nanobot SDK 化 + 实时持久化 + 统一 Token 记录 | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| — | Bug Fix: Session 数据写入错误路径 | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 25 | 执行过程展示完整性优化 (Issue #24) | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 26 | 工具调用间隙用户消息注入 (Issue #25) | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 27 | Worker 并发任务支持 (Issue #26) | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 28 | 用量统计增强 + 工具调用用量展示 (Issue #27/#28) | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 29 | Session 管理增强 — 文件名显示 + 删除 + 标题优化 (Issue #29/#30/#31) | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 29 | Web UI 自修改安全实践 (Issue #32 / Backlog #14) | ✅ | [devlog/phase-15-29.md](devlog/phase-15-29.md) |
| 30 | 配置页面增强 + Session 搜索 + 删除回收站 (Issue #33/#34/#35) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 32 | 图片输入功能 (Issue #38) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 33 | 斜杠命令系统 (Issue #40) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 44 | 斜杠命令失败后输入回填 (Issue #50) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 47 | Bug 修复 — 后端不可达时消息静默丢失 | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 47.5 | Cache Usage 字段 + 上下文长度展示 (§三十九附) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 48 | 全链路统一用 session.id 替代 sessionKey (§三十九 Issue #53) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 34 | Runtime Context 过滤统一收拢 (Issue #41) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 31 | Gateway 改名 Webserver + URL 编码 Bug 修复 (Issue #36/#37) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 35 | Session 列表按来源分组 (Issue #42) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 36 | ProviderPool — Web Chat Provider 切换 (Issue #43) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 37 | Bug 修复 — SSE 流中断导致前端卡死 | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 38 | LLM 错误响应显示 | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 39 | Message 工具 fallback 显示 + 项目清理 | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 40 | Provider 配置热加载 + 默认模型配置 (Issue #44/#45/#46) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 41 | API Session 前端辨识 (Issue #47 / B5) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 42 | Session 树形结构 — 父子关系 + 折叠面板 + 徽章 (§三十四 Issue #48) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 42.7 | 启发式规则 B 跨通道父子关系匹配 | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 43 | 三级树状 Session 父子关系 (Issue #49) | ✅ | [devlog/phase-30-43.md](devlog/phase-30-43.md) |
| 45 | restart.sh 进程发现与健康检查修复 (Issue #51) | ✅ | [devlog/phase-44-54.md](devlog/phase-44-54.md) |
| 46.0 | Session 重命名存储重构 — session_names.json | ✅ | [devlog/phase-44-54.md](devlog/phase-44-54.md) |
| 46 | Session Tag — done 标记与过滤 | ✅ | [devlog/phase-44-54.md](devlog/phase-44-54.md) |
| 49 | 用量统计页面增强 (§四十 Issue #54) | ✅ | [devlog/phase-44-54.md](devlog/phase-44-54.md) |
| 50 | System Inject 消息展示 (§四十一 Issue #55) | ✅ | [devlog/phase-44-54.md](devlog/phase-44-54.md) |
| 51 | Subagent 消息 Role 适配 — 内容前缀识别 (§四十二) | ✅ | [devlog/phase-44-54.md](devlog/phase-44-54.md) |
| 52 | REQUIREMENTS.md Backlog 区域重构 (文档维护) | ✅ | [devlog/phase-44-54.md](devlog/phase-44-54.md) + (本文件) |
| 53 | 日志路径统一迁移 — /tmp → ~/.nanobot/logs/ | ✅ | [devlog/phase-44-54.md](devlog/phase-44-54.md) + (本文件) |
| 54 | 前端 Markdown 渲染修复与消息复制 (v5.5) | ✅ | [devlog/phase-44-54.md](devlog/phase-44-54.md) + (本文件) |
| 55 | SubagentManager 单例化 (nanobot §40) | ✅ | (本文件) |
| 56 | Web-chat 基础改动 (§四十四~§四十七) | ✅ | (本文件) |

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

---

## Phase 55: SubagentManager 单例化 (nanobot §40) ✅

**日期**: 2026-03-11
**需求**: nanobot 核心 §40（`requirements/s40-s49.md`）

### 背景

Web worker 模式下，每次 HTTP 请求创建新的 `AgentLoop → SubagentManager`，turn 结束后被 GC。导致跨 turn 的 `follow_up`/`status`/`stop`/`list` 全部失效。

### 改动

- `worker.py`: 新增 `_get_subagent_manager()` 模块级单例工厂（double-checked locking）
- `worker.py`: `_create_runner()` 透传 `subagent_manager=_get_subagent_manager()` 给 AgentLoop

### Hotfix: subagent usage_recorder 丢失 (2026-03-11)

**根因**: `_get_subagent_manager()` 初始版本未传 `usage_recorder`，singleton 的 `usage_recorder=None`，导致所有 subagent 的 usage 数据不再记录到 SQLite。

**修复**: 传入 `usage_recorder=UsageRecorder()`。

**配套（nanobot 核心）**:
- `loop.py`: 外部传入 `subagent_manager` 且 `usage_recorder=None` 时打 warning 日志
- `test_spawn_singleton.py`: 新增 4 项测试（25→29），覆盖 usage_recorder 在 singleton/默认两种模式下的传递

### 影响文件

| 文件 | 改动 |
|------|------|
| `worker.py` | `_get_subagent_manager()` 单例 + `_create_runner()` 透传 |

---

## Phase 56: Web-chat 基础改动 (§四十四~§四十七) ✅

**日期**: 2026-03-11
**需求**: §四十四~§四十七

### 任务清单

- [x] §四十四 subagent 返回内容前端隐藏 system prompt
- [x] §四十五 SSE 刷新保持用户浏览位置
- [x] §四十六 /session 命令补充 cache 信息 + web 端支持
- [x] §四十七 web-subsession 父子关系注册

### §四十四 实现

- `MessageItem.tsx`: 新增 `stripSystemMarker()` 函数，检测 `<!-- nanobot:system -->` 标记并截断
- 应用于 `getTextContent()`（影响显示和复制）、`AssistantTurnGroup` 的 finalReplyText 和 copyText

### §四十五 实现

- `MessageList.tsx`: 新增 `isNearBottom()` 辅助函数和 `userSentRef` ref
- 用户发送消息时设置 `userSentRef.current = true`，滚动时总是滚到底部
- SSE 推送/progress 更新时，仅在用户处于底部附近（150px 阈值）时自动跟随

### §四十六 实现

- `nanobot/usage/recorder.py`: `get_session_usage()` 增加 cache_creation_input_tokens 和 cache_read_input_tokens 字段
- `nanobot/agent/loop.py`: `/session` 命令 token_line 追加 cache 行
- `messageStore.ts`: 新增 `/session` slash 命令，通过 API 获取 session usage 并显示

### §四十七 实现

- `webserver.py`: `do_POST` 新增 `POST /api/sessions/parents` 路由 + `_handle_post_session_parent()` 方法（文件锁）
- `create_subsession.sh`: 新增 `--parent` 参数，创建 session 后 curl POST 注册
- `skills/web-subsession/SKILL.md`: 文档更新 --parent 参数说明
- `skills/batch-orchestrator/SKILL.md`: Worker Prompt 模板加入 --parent 说明

### 改动文件汇总

| 文件 | 改动 |
|------|------|
| `frontend/src/pages/chat/MessageItem.tsx` | `stripSystemMarker()` 截断 system 标记 |
| `frontend/src/pages/chat/MessageList.tsx` | 智能滚动：底部跟随 + 历史浏览不打断 |
| `frontend/src/store/messageStore.ts` | `/session` slash 命令 |
| `webserver.py` | `POST /api/sessions/parents` 单条追加 API |
| `nanobot/usage/recorder.py` | `get_session_usage()` 增加 cache 字段 |
| `nanobot/agent/loop.py` | `/session` 命令增加 cache 信息 |
| `skills/web-subsession/scripts/create_subsession.sh` | `--parent` 参数 |
| `skills/web-subsession/SKILL.md` | 文档更新 |
| `skills/batch-orchestrator/SKILL.md` | 文档更新 |

---

## Phase 57: Subagent 可见性 — 运行标识与进度 (§四十八~§四十九) ✅

**日期**: 2026-03-11
**需求**: §四十八~§四十九

### 任务清单

- [x] §四十八 Subagent 可见性后端 API（worker + webserver proxy）
- [x] §四十九 前端运行标识（绿点动画 + subagent 进度）

### §四十八 实现

- `worker.py`: 新增 `WorkerSubagentCallback` 类，实现 SubagentEventCallback 协议
  - `_registry` 字典跟踪 subagent 全生命周期（spawned/progress/retry/done）
  - `get_all_running_session_keys()` 合并 regular tasks + subagent tasks
  - `get_subagents_for_parent()` 按父 session key 查询
  - 注册为 `SubagentManager` 的 `event_callback`
- `worker.py`: 新增 HTTP 端点 `GET /sessions/running` 和 `GET /subagents/<parent_key>`
- `webserver.py`: 新增 proxy 方法 `_handle_proxy_running_sessions()` 和 `_handle_proxy_subagents()`

### §四十九 实现

- `frontend/src/services/api.ts`: 新增 `fetchRunningSessions()` 和 `fetchSubagents()` API 函数
- `frontend/src/hooks/useRunningSessions.ts`: 轮询运行状态（10s），检测变化触发 session list 刷新
- `frontend/src/hooks/useSubagentStatus.ts`: 轮询 subagent 进度（5s），仅在有运行 session 时激活
- `frontend/src/pages/chat/Sidebar/SessionList.tsx`:
  - 集成两个 hook，传递 runningKeys/subagentMap 到所有层级组件
  - SessionItem/ChildrenPanel 显示绿色脉冲点（运行中）和进度行（⚙️ 5/30 · tool_name）
- `frontend/src/pages/chat/Sidebar/Sidebar.module.css`: 新增 `.runningIndicator`、`.runningIndicatorSmall`、`.subagentStatus`、`.subagentStatusSmall` 样式 + pulse 动画

### 改动文件汇总

| 文件 | 改动 |
|------|------|
| `worker.py` | WorkerSubagentCallback + HTTP 端点 |
| `webserver.py` | proxy 方法 _handle_proxy_running_sessions / _handle_proxy_subagents |
| `frontend/src/services/api.ts` | fetchRunningSessions / fetchSubagents |
| `frontend/src/hooks/useRunningSessions.ts` | 新文件：运行状态轮询 hook |
| `frontend/src/hooks/useSubagentStatus.ts` | 新文件：subagent 进度轮询 hook |
| `frontend/src/pages/chat/Sidebar/SessionList.tsx` | 集成 hooks，显示运行标识和进度 |
| `frontend/src/pages/chat/Sidebar/Sidebar.module.css` | 脉冲绿点动画 + 进度文字样式 |

---

## Phase 57 Hotfix: Session 列表轮询闪烁修复 (§五十) ✅

**日期**: 2026-03-11
**需求**: §五十
**Commits**: `66cd02a` (源码修复) + 手动 `npm run build` (dist 重构建)

### 问题现象

§四十八~§四十九 引入 `useRunningSessions`（10s 轮询）和 `useSubagentStatus`（5s 轮询）后，session 列表在任务执行期间每 10 秒闪烁一次（列表消失再出现）。

### 根因

1. **引用不稳定**：两个 hook 每次轮询无条件创建新 Set/Map 引用 → React 认为 state 变化 → 触发重渲染
2. **loading 门控**：`fetchSessions()` 无条件设 `loading: true` → `Sidebar.tsx` 根据 loading 隐藏 SessionList → 闪烁
3. **dist 未重构建**：66cd02a 修改源码后未执行 `npm run build`，浏览器仍加载旧 bundle

### 修复内容

| 文件 | 改动 |
|------|------|
| `frontend/src/hooks/useRunningSessions.ts` | `setRunningKeys()` 移到 changed 判断内部 |
| `frontend/src/hooks/useSubagentStatus.ts` | 新增 `mapsEqual()` 深比较，仅变化时 setState |
| `frontend/src/store/sessionStore.ts` | `fetchSessions()` 已有数据时静默刷新（不设 loading） |
| `frontend/src/pages/chat/Sidebar/Sidebar.tsx` | 移除 loading 门控，SessionList 始终渲染 |

### 经验教训

- **前端修复必须包含 `npm run build`**：源码修改不等于生效，dist 中的 bundle 才是浏览器加载的文件
- **轮询 hook 必须做引用稳定性检查**：React state 更新基于引用比较，每次创建新对象即使内容相同也会触发重渲染
- **loading 状态应区分首次加载与后台刷新**：首次加载可以显示 skeleton/loading，后台静默刷新不应影响已渲染的 UI

---

## Phase 58: 闭合标签 + 滚动按钮 (§五十一~§五十二) ✅

**日期**: 2026-03-11
**需求**: §五十一（前端隐藏标记改为闭合标签 + 仅 user 消息生效）、§五十二（Turn 结束后「滚动到底部」提示按钮）

### 任务清单

- [x] §五十一：`stripSystemMarker` 改为闭合标签对算法，`getTextContent` 增加 role 过滤
- [x] §五十二：MessageList 添加 ScrollToBottomButton，turn 结束时提示

### 改动文件汇总

| 文件 | 改动 |
|------|------|
| `frontend/src/pages/chat/MessageItem.tsx` | 闭合标签常量 + 新 stripSystemMarker 算法 + getTextContent role 参数 |
| `frontend/src/pages/chat/MessageList.tsx` | ScrollToBottomButton 组件 + turn 结束检测 + 滚动位置监听 |
| `frontend/src/pages/chat/MessageList.module.css` | 滚动按钮样式 + 出现/消失动画 |
| `docs/REQUIREMENTS.md` | 索引表新增 §五十一、§五十二 |
| `docs/requirements/s44-s56.md` | §五十一、§五十二 正文 |
| `docs/DEVLOG.md` | Phase 58 记录 |

---

## Phase 58 Hotfix: SystemInjectCard 标签泄露 + Turn 结束自动滚动 ✅

**日期**: 2026-03-12
**Commits**: `67a80d9` (标签泄露) + `0045a71` (滚动修复)

### Bug 1: SystemInjectCard 中 `<!-- nanobot:system -->` 内容未隐藏

**现象**: 展开 subagent 结果卡片时，`<!-- nanobot:system -->` 标签及其内部的系统引导文本直接暴露给用户。

**根因**: `SystemInjectCard` 组件调用 `getTextContent(message.content)` 时没有传 `role` 参数，导致 `shouldStrip = undefined === 'user'` → `false`，`stripSystemMarker` 未执行。

**修复**: 改为 `getTextContent(message.content, 'user')`，确保 system marker 被 strip。

| 文件 | 改动 |
|------|------|
| `frontend/src/pages/chat/MessageItem.tsx` | `SystemInjectCard` 中 `getTextContent` 传入 `'user'` role |

### Bug 2: Turn 结束后直接滚动到底部，不显示"新消息"按钮

**现象**: Turn 结束后页面直接跳到底部，§五十二 的 ScrollToBottomButton 从未出现。

**根因**: Turn 进行中 progress indicator 持续 auto-scroll 把用户拉到底部。Turn 结束时 `_reloadMessages` 同时更新 `messages` + `sending=false`（同一个 `set()` 调用）。React 批量处理后，messages useEffect **先于** turn-end useEffect 执行：
1. messages useEffect: `isNearBottom()=true`（刚被 progress scroll 到底）→ 直接 `scrollIntoView`
2. turn-end useEffect: `!isNearBottom()=false`（刚被第 1 步 scroll 到底）→ 不显示按钮

**修复**: 在 messages auto-scroll useEffect 中新增 turn-end 检测 `prevSendingRef.current && !isCurrentSessionSending`。利用 React useEffect 声明顺序保证：messages useEffect 先执行时 `prevSendingRef` 尚未被 turn-end useEffect 更新，仍为 `true`。当检测到 turn-end 时跳过 auto-scroll，交由 turn-end useEffect 通过 `requestAnimationFrame` 决定是否显示按钮。

| 文件 | 改动 |
|------|------|
| `frontend/src/pages/chat/MessageList.tsx` | auto-scroll useEffect 增加 `isTurnEnd` 判断跳过滚动 |

---

## Phase 59: Plan D Hotfix — 并发消息丢失 + 前端最终刷新 + 滚动保持 (§五十五~§五十七) ✅

**日期**: 2026-03-17
**需求**: §五十五（并发 task 时用户消息丢失修复）、§五十六（session 从 running 变为 idle 时前端最终刷新）、§五十七（自动刷新时保持滚动位置）
**来源**: Plan B R2 验收 G2 / G6 + Plan D 验收反馈

### 任务清单

- [x] G2 修复: `worker.py` `_handle_execute_stream()` — 并发 task 时 inject 用户消息而非丢弃
- [x] G6 修复: `MessageList.tsx` — 追踪 running→idle 状态变化，做最终刷新
- [x] G6 配套: `messageStore.ts` — 新增 `refreshMessages()` 方法（不清空消息列表的刷新）
- [x] G6 配套: `MessageItem.tsx` — 展开/折叠状态持久化（`usePersistedExpand` hook）
- [x] §五十七: `MessageList.tsx` — auto-refresh 滚动逻辑改进：isNearBottom 检查，远离底部时保持 scrollTop
- [x] 前端构建: `npm run build` 通过
- [x] 文档补齐: 需求文档 + DEVLOG

### 改动文件汇总

| 文件 | 改动 |
|------|------|
| `worker.py` | `_handle_execute_stream()`: 并发 task 时 inject 用户消息到 `_inject_queue` |
| `frontend/src/pages/chat/MessageList.tsx` | `wasRunningRef` + running→idle 最终刷新 + 轮询改用 `refreshMessages` + §五十七 滚动保持 |
| `frontend/src/store/messageStore.ts` | 新增 `refreshMessages()` 方法 |
| `frontend/src/pages/chat/MessageItem.tsx` | `usePersistedExpand` hook + 展开状态持久化 |
| `docs/REQUIREMENTS.md` | 索引表新增 §五十五~§五十七 |
| `docs/requirements/s44-s56.md` | §五十五~§五十七 正文 |
| `docs/DEVLOG.md` | Phase 59 记录 |

### Commits

- `a541dd2` — 代码修复: inject user message on concurrent task (G2) + final refresh on task end (G6)
- `84ba96b` — 文档补齐: G2/G6 需求 (§五十五~§五十六) + Phase 59 DEVLOG

---

## Phase 60: 自动刷新时保持滚动位置 (§五十七) ✅

**日期**: 2026-03-17

### 问题

subagent session 的 auto-refresh 5s 轮询会强制把页面滚到底部，用户无法向上浏览历史。

### 根因（两层）

**第一层 — scroll 事件监听器从未绑定**：

`useEffect([], [])` 在组件首次 render 时执行，但此时 MessageList 处于 loading/empty 的 early-return 状态，`scrollContainerRef.current` 为 `null`。scroll/wheel/pointer 事件监听器从未被 attach，`userScrolledAwayRef` 永远保持初始值 `false`。

**第二层 — subagent session 无 SSE/attach**：

subagent task 不在 worker `_tasks` 中（由 parent task 内部 `SubagentManager.spawn()` 创建，不经 `/execute` 端点）。`checkRunningTask` 的 `fetchTaskStatus` 返回 `{status: 'unknown'}`，不设 `sending=true`。auto-refresh interval 从 session 打开起就在运行，但因 `userScrolledAwayRef` 永远为 `false`，每次 tick 都执行 refresh + scrollIntoView → 用户被强制拉回底部。

### 修复方案

**1. callback ref 绑定事件监听（核心修复）**

用 `scrollContainerCallbackRef` + `useState<HTMLDivElement | null>` 替代直接 `ref={scrollContainerRef}`。useEffect 依赖 `[scrollContainer]`，当 DOM 节点在 early-return 条件消除后出现时，重新执行并正确绑定事件监听器。

**2. userScrolledAwayRef 粘性标志**

用户滚离底部（>300px）时锁定为 `true`，只在用户主动交互（wheel/touch/pointer）回到底部时重置为 `false`。不受 DOM 高度变化、layout-driven scroll 影响。

**3. userInteractingRef 交互检测**

通过 wheel/touchstart/pointerdown 事件标记用户主动操作，区分用户滚动 vs 程序/布局触发的 scroll 事件。150ms 延迟清除，确保后续 scroll 事件能看到交互标记。

**4. auto-refresh interval 使用粘性标志**

检查 `userScrolledAwayRef.current` 而非调用 `isNearBottom()`。用户滚离时完全跳过 refresh（零 re-render = 零干扰），标记 `pendingRefreshRef` 待用户滚回底部后补刷。

### 改动文件

| 文件 | 改动 |
|------|------|
| `frontend/src/pages/chat/MessageList.tsx` | callback ref + scroll 事件监听 + `userScrolledAwayRef`/`userInteractingRef` + auto-refresh 使用粘性标志 |
| `docs/REQUIREMENTS.md` | 索引表新增 §五十七 |
| `docs/requirements/s44-s56.md` | §五十七 需求正文 |

### 验证

- `npm run build` ✅ 通过
- dev 环境实测 ✅：DevTools console 日志确认 scroll listener 正确绑定，向上滚动后 auto-refresh 跳过刷新

---

## §五十九 Session 列表时间显示改用文件 mtime ✅

**日期**: 2026-03-17

### 问题

`follow_up` 恢复的 subagent 完成后，父 session 的 `lastActiveAt` 不更新。

**根因**: `list_sessions()` 优先读 JSONL 第一行 metadata 的 `updated_at`，但 `append_message()` 只追加消息不重写 metadata 行，导致 `updated_at` 停留在 session 创建/上次 `save()` 的时间。

### 修复

`webserver.py` 第 392-396 行：去掉 `metadata.get('updated_at')` 的优先判断，始终使用 `os.path.getmtime(filepath)` 作为 `last_active`。文件 mtime 在每次 `append_message()` 写入时自动更新，天然反映最新活动时间。

| 文件 | 变更 |
|------|------|
| `webserver.py` L392-396 | 移除 `metadata.get('updated_at')` fallback，始终用 `os.path.getmtime()` |

---

## Phase 61: 轮询效率修复 — subagent N+1 + 双重 useRunningSessions (§五十八) ✅

**日期**: 2026-03-17

### 问题

1. **subagent 轮询 N+1 请求**: `useSubagentStatus` 的 `activeParents` 过滤逻辑 bug — 只要有任意 running session 就对所有有子 session 的 parent 发请求
2. **useRunningSessions 双重轮询**: `Sidebar` 传入 `runningKeys`，但 `SessionList` 内部又无条件调用 `useRunningSessions()`，两个独立 interval 同时轮询

### 修复

1. `SessionList.tsx`: 计算 `activeParentKeys` 只保留有 running child 的 parent
2. `useSubagentStatus.ts`: 简化 `activeParents` 过滤，直接使用传入的 keys
3. `useRunningSessions.ts`: 新增 `enabled` 参数，`SessionList` 在有外部传入时传 `enabled=false`

### 改动文件

| 文件 | 改动 |
|------|------|
| `frontend/src/hooks/useSubagentStatus.ts` | 简化 `activeParents` 过滤 |
| `frontend/src/hooks/useRunningSessions.ts` | 新增 `enabled` 参数 |
| `frontend/src/pages/chat/Sidebar/SessionList.tsx` | `activeParentKeys` 过滤 + `enabled=false` |
| `docs/REQUIREMENTS.md` | 索引表新增 §五十八 |
| `docs/requirements/s44-s56.md` | §五十八 需求正文 |
| `docs/DEVLOG.md` | Phase 61 记录 |

---

## Phase 62: 修复 session 切换时误显示"新消息"浮标 (§五十九) ✅

**日期**: 2026-03-17

### 问题

从一个正在 running 的 session 切换到另一个 session 时，底部中间会错误出现"新消息 ↓"浮标。

### 根因

`prevSendingRef` 是组件级 `useRef`，跨 session 共享，session 切换时未重置。

**触发链路**：
1. Session A running → `prevSendingRef.current = true`
2. 切换到 idle 的 Session B → `isCurrentSessionSending = false`
3. turn-end effect 检测到 `wasSending=true && !isCurrentSessionSending` → 误判为 turn 结束
4. `requestAnimationFrame` 延迟执行 `setShowScrollToBottom(true)`，绕过了 session 切换 effect 中的同步 `setShowScrollToBottom(false)` 清理

**加剧因素**：turn-end effect 使用 `requestAnimationFrame`，回调在下一帧执行，时序上晚于 session 切换 effect 的同步清理。

### 修复

在 session 切换 effect（`activeSessionId` 变化）中重置两个 ref：
- `prevSendingRef.current = false` — 防止误触发 "turn end" 浮标
- `wasRunningRef.current = false` — 防止误触发 "task completed" 刷新

### 改动文件

| 文件 | 改动 |
|------|------|
| `frontend/src/pages/chat/MessageList.tsx` | session 切换 effect 中重置 `prevSendingRef` 和 `wasRunningRef` |
| `docs/DEVLOG.md` | Phase 62 记录 |

---

## Phase 63: 修复 restart.sh 进程隔离 — 防止 dev/prod 互杀 ✅

**日期**: 2026-03-18

### 问题

dev 环境执行 `restart.sh stop` 时，会误杀 prod 环境的 webserver/worker 进程（反之亦然）。

### 根因

`find_pids()` 函数在精确路径匹配失败后，fallback 到宽泛模式 `pgrep -f "[Pp]ython[3]?.*${script_name}"`，该模式匹配所有环境中同名的 Python 进程（如 `webserver.py`、`worker.py`），不区分 dev/prod。

### 修复

去掉 `find_pids()` 中的宽泛 fallback，只保留精确 `SCRIPT_DIR` 路径匹配：

```bash
pids=$(pgrep -f "${SCRIPT_DIR}/${script_name}" 2>/dev/null || true)
```

端口级兜底（`find_pid_on_port`）在 `stop_service` 中单独使用，不受影响。

### 改动文件

| 文件 | 改动 |
|------|------|
| `restart.sh` | `find_pids()` 去掉宽泛 pgrep fallback，只保留精确 SCRIPT_DIR 路径匹配 |
| `docs/DEVLOG.md` | Phase 63 记录 |

---

## Phase 61: Integration Tests — Worker / Cron / Webserver (batch-20260320 plan-test) ✅

**日期**: 2026-03-20 ~ 2026-03-21

### 概要

为 web-chat 后端添加全面的集成测试，覆盖 worker layer、cron 功能、webserver 路由。总计 155 个测试用例全部通过。

### 测试覆盖

| 模块 | 文件 | 测试数 | 覆盖内容 |
|------|------|--------|----------|
| Worker | `test_worker_integration.py` | ~60 | session lifecycle, message handling, subagent management |
| Cron | `test_cron_integration.py` | ~50 | scheduler, job execution, error handling |
| Webserver | `test_webserver_integration.py` | ~20 | API routes, auth, error responses |
| Analytics | `test_analytics.py` | ~25 | usage stats, cache fields, daily aggregation |

### 改动文件

| 文件 | 改动 |
|------|------|
| `tests/conftest.py` | 新增：共享 fixtures |
| `tests/test_worker_integration.py` | 新增：worker 集成测试 |
| `tests/test_cron_integration.py` | 新增：cron 集成测试 |
| `tests/test_webserver_integration.py` | 新增：webserver 集成测试 |
| `tests/test_analytics.py` | 修复：相对日期替代硬编码日期 |
| `tests/README.md` | 更新：测试文档 |

### Commits

- `0c5f800` feat(Phase 61): add integration tests for worker layer and cron functionality
- `ebf1ca2` fix(test): use relative date in test_daily_usage_includes_cache_fields
- `c51f005` Merge feat/batch-20260320-plan-test: integration tests
