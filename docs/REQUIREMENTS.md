# nanobot Web Chat UI 需求文档

<!-- 📖 文档组织说明
本需求文档采用"主文件 + 归档子文件"结构：
- **本文件（主文件）**：项目概述 + 全量需求索引表 + Backlog
- **requirements/ 子目录**：按编号分组的完整需求正文归档

🔍 如何查找需求：
1. 在下方"全量需求索引"表中按编号/标题找到对应的归档文件链接
2. 点击链接跳转到归档文件，每个归档文件头部也有本文件索引

📝 如何添加新需求：
1. 先在 Backlog 区域添加条目（`### Backlog #N: 标题`）
2. 决定开发时，分配 §编号，在**最新的归档文件末尾**追加完整需求正文
3. 在本文件的索引表中添加对应行
4. 从 Backlog 中删除该条目

⚠️ 维护规则：
- 索引表必须与归档文件内容保持同步
- 归档文件中的内容一旦写入不再删减，只追加
- Backlog 区域必须始终位于本文件最末尾
-->

> 完整需求详情见 `requirements/` 目录下的归档文件。
> 本文件保留全量需求索引和 Backlog。

---

## 全量需求索引

| 编号 | 标题 | 版本 | 状态 | 归档文件 |
|------|------|------|------|---------|
| §一 | 现有系统概述 | - | ✅ | [requirements/s01-s10.md](requirements/s01-s10.md) |
| §二 | 新功能需求 | - | ✅ | [requirements/s01-s10.md](requirements/s01-s10.md) |
| §三 | 需求确认记录 | - | ✅ | [requirements/s01-s10.md](requirements/s01-s10.md) |
| §四 | 技术决策 | - | ✅ | [requirements/s01-s10.md](requirements/s01-s10.md) |
| §五 | 参考项目 | - | ✅ | [requirements/s01-s10.md](requirements/s01-s10.md) |
| §六 | 迭代反馈 | v1.1 | ✅ | [requirements/s01-s10.md](requirements/s01-s10.md) |
| §七 | 迭代反馈 | v1.4 | ✅ | [requirements/s01-s10.md](requirements/s01-s10.md) |
| §八 | 迭代反馈 | v1.5 | ✅ | [requirements/s01-s10.md](requirements/s01-s10.md) |
| §九 | 迭代反馈 | v1.6 | ✅ | [requirements/s01-s10.md](requirements/s01-s10.md) |
| §十 | 功能模块实现 | v2.0 | ✅ | [requirements/s01-s10.md](requirements/s01-s10.md) |
| §十一 | 迭代反馈 | v2.1 | ✅ | [requirements/s11-s20.md](requirements/s11-s20.md) |
| §十二 | 迭代反馈 | v2.3 | ✅ | [requirements/s11-s20.md](requirements/s11-s20.md) |
| §十三 | 迭代反馈 | v2.4 | ✅ | [requirements/s11-s20.md](requirements/s11-s20.md) |
| §十四 | 迭代反馈 | v2.5 | ✅ | [requirements/s11-s20.md](requirements/s11-s20.md) |
| §十五 | nanobot SDK 化 | - | ✅ | [requirements/s11-s20.md](requirements/s11-s20.md) |
| §十六 | 实时 Session 持久化 | - | ✅ | [requirements/s11-s20.md](requirements/s11-s20.md) |
| §十七 | 统一 Token 用量记录 | - | ✅ | [requirements/s11-s20.md](requirements/s11-s20.md) |
| §十八 | Bug 修复 — Session 数据写入错误路径 | - | ✅ | [requirements/s11-s20.md](requirements/s11-s20.md) |
| §十九 | 迭代反馈 | v3.1 | ✅ | [requirements/s11-s20.md](requirements/s11-s20.md) |
| §二十 | 工具调用间隙用户消息注入 | - | ✅ | [requirements/s11-s20.md](requirements/s11-s20.md) |
| §二十一 | Worker 并发任务支持 | - | ✅ | [requirements/s21-s30.md](requirements/s21-s30.md) |
| §二十二 | 迭代反馈 | v3.2 | ✅ | [requirements/s21-s30.md](requirements/s21-s30.md) |
| §二十三 | 迭代反馈 | v3.3 | ✅ | [requirements/s21-s30.md](requirements/s21-s30.md) |
| §二十四 | Web UI 自修改安全实践 | v3.4 | ✅ | [requirements/s21-s30.md](requirements/s21-s30.md) |
| §二十五 | 迭代反馈 | v3.3.1 | ✅ | [requirements/s21-s30.md](requirements/s21-s30.md) |
| §二十六 | 迭代反馈 | v3.5 | ✅ | [requirements/s21-s30.md](requirements/s21-s30.md) |
| §二十七 | 图片输入功能 | v4.0 | ✅ | [requirements/s21-s30.md](requirements/s21-s30.md) |
| §二十八 | Bug 修复 | v4.0.1 | ✅ | [requirements/s21-s30.md](requirements/s21-s30.md) |
| §二十九 | 斜杠命令系统 | v4.1 | ✅ | [requirements/s21-s30.md](requirements/s21-s30.md) |
| §三十 | Session 列表按来源分组 | v4.2 | ✅ | [requirements/s21-s30.md](requirements/s21-s30.md) |
| §三十一 | 运行时 Provider 动态切换 | v4.3 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §三十二 | LLM 错误响应前端展示 | v4.4 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §三十三 | Provider 配置热加载 + 默认模型配置 | v4.5 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §三十四 | API Session 前端辨识与树形管理 | v4.6~v4.7 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §三十五 | 三级树状 Session 父子关系 | v4.8 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §三十六 | 斜杠命令失败后输入回填 | v4.9 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §三十七 | restart.sh 进程发现与健康检查修复 | v4.10 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §三十八 | Session Tag — done 标记与过滤 | v5.0 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §三十九（附） | Cache Usage 字段 + 上下文长度展示 | v5.0.1 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §三十九 | 全链路统一用 session.id 替代 sessionKey | v5.1 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §四十 | 用量统计页面增强 | v5.2 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §四十一 | System Inject 消息展示 | v5.3 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §四十二 | Subagent 消息 Role 适配 — 内容前缀识别 | v5.4 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §四十三 | 前端 Markdown 渲染修复与消息复制 | v5.5 | ✅ | [requirements/s31-s43.md](requirements/s31-s43.md) |
| §四十四 | subagent 返回内容前端隐藏 system prompt | v5.6 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §四十五 | SSE 刷新保持用户浏览位置 | v5.6 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §四十六 | /session 命令补充 cache 信息 + web 端支持 | v5.6 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §四十七 | web-subsession 父子关系注册 | v5.6 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §四十八 | Subagent 可见性 — 后端 API | v5.7 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §四十九 | Subagent 可见性 — 前端运行标识 | v5.7 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §五十 | Bug 修复 — Session 列表轮询闪烁 | v5.7.1 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §五十一 | 前端隐藏标记改为闭合标签 + 仅 user 消息生效 | v5.8 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §五十二 | Turn 结束后「滚动到底部」提示按钮 | v5.8 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §五十三 | 前端 cron 提醒消息展示卡片 | — | 🔧 | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §五十四 | Session 父子关系前端改为消费 API | — | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §五十五 | 并发 task 时用户消息丢失修复 | v5.9 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §五十六 | session 从 running 变为 idle 时前端最终刷新 | v5.9 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |
| §五十七 | 自动刷新时保持滚动位置 | v5.9 | ✅ | [requirements/s44-s56.md](requirements/s44-s56.md) |

---

<!-- ═══════════════════════════════════════════════════════════════════════
  ⚠️ BACKLOG 区域 — 必须始终位于本文件最末尾！

  ── 格式规范 ──
  - Backlog 条目使用 **三级标题**：`### Backlog #N: 标题`
  - 使用 `Backlog #N` 编号（非 §编号），N 从 1 递增
  - 条目内容只写：来源、问题描述、初步方案思路、优先级判断
  - **不写**完整的设计方案、影响范围表格、子需求拆解（这些属于正式需求）

  ── 生命周期 ──
  1. 新发现的待办 → 在此追加 `### Backlog #N: 标题`
  2. 决定开发 → 分配 §编号，写成 `## §xx 标题` 正式需求章节，
     插入到最新的归档文件末尾，并更新主文件索引表，
     然后从 BACKLOG 中删除该条目
  3. 开发完成 → 正式需求章节已在归档文件中，无需再动

  ── 禁止事项 ──
  - ❌ 不要在 BACKLOG 条目中使用 §编号（避免与正式需求混淆）
  - ❌ 不要在 BACKLOG 之后追加任何正式需求章节
  - ❌ 不要在 BACKLOG 中原地修改条目为正式需求（应挪出去）
  - ❌ 已完成的条目不要留在 BACKLOG 中（应已挪出或删除）
  ═══════════════════════════════════════════════════════════════════════ -->

## 📋 Backlog（手动维护）

> **⚠️ 本区域必须始终位于文件最末尾。**
>
> Backlog 条目格式：`### Backlog #N: 标题`（三级标题 + 序号，不使用 §编号）。
> 只记录问题描述和初步思路，不写完整设计方案。
> 决定开发时分配 §编号，转为正式需求追加到最新归档文件末尾，并更新索引表。

（暂无）

<!-- ⚠️ BACKLOG 结束 — 此行之后不得追加任何内容 -->
