# nanobot Web Chat UI 需求文档

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

---

## 📋 Backlog（手动维护）

> **⚠️ 本区域必须始终位于文件最末尾。新增正式需求章节请插入到本区域之前的 `---` 分隔线上方。**
>
> 这里手动添加希望增加的功能 backlog。被任务激活后，参考下面的内容，按照合理逻辑更新前序需求文档说明（如增加对应的需求描述章节或带编号的 issue），并推进对应的开发项。必要时可在交互过程中澄清需求。对应的需求更新之后，从 backlog 中移除。

（暂无）

<!-- ⚠️ BACKLOG 结束 — 此行之后不得追加任何内容 -->
