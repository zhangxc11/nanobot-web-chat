# Issue: 飞书旧 session 的 sessionKey 重复导致列表渲染异常

## 1. 问题描述

飞书旧格式 session（如 `feishu.lab_ou_b0cea6afcbf1c8b1919c3105b3c1ebc9_1772196120.jsonl`）的 metadata key 只包含 `channel:user_id`，不含时间戳，导致同一用户的所有旧 session 共享相同的 `sessionKey`：

| 文件名 (id) | metadata key (sessionKey) |
|---|---|
| `feishu.lab_ou_b0cea6afcbf1c8b1919c3105b3c1ebc9_1772196120` | `feishu.lab:ou_b0cea6afcbf1c8b1919c3105b3c1ebc9` |
| `feishu.lab_ou_b0cea6afcbf1c8b1919c3105b3c1ebc9_1772307725` | `feishu.lab:ou_b0cea6afcbf1c8b1919c3105b3c1ebc9` |
| `feishu.lab_ou_b0cea6afcbf1c8b1919c3105b3c1ebc9_1772341100` | `feishu.lab:ou_b0cea6afcbf1c8b1919c3105b3c1ebc9` |
| ... (共 6 个) | 全部相同 |

新格式 session 不存在此问题（key 包含时间戳，如 `feishu.lab.1772376517`）。

### 导致的具体问题

1. **`nodeByKey` 只保留第一个**：`buildSessionTree()` 中 `nodeByKey` 用 `sessionKey` 做 Map key，6 个 session 共享同一 key 只保留首个
2. **React key 冲突**：`SessionTreeItem` 的 `key={node.session.sessionKey || node.session.id}` 产生重复 key
3. **点击指向同一 session**：所有重复 key 的 session 在树中指向同一个 node

---

## 2. 方案：全链路统一用 `id` 替代 `sessionKey`

### 2.1 核心思路

`session.id`（文件名，不含 `.jsonl`）天然全局唯一。将除 analytics DB 之外的所有地方统一用 `id` 作为标识。

`sessionKey`（metadata key）仅在两个场景保留：
- **analytics DB** 的 `session_key` 列（历史数据向前兼容）
- **worker 通信**（nanobot core 用 sessionKey 定位/创建 JSONL 文件）

### 2.2 `sessionKey` 与 `id` 的转换关系

```
sessionKey:  webchat:1772944924       feishu.lab.1772376517        feishu.lab:ou_b0cea...
     ↕          ↕                         ↕                            ↕
  id:        webchat_1772944924       feishu.lab.1772376517        feishu.lab_ou_b0cea..._1772196120
```

规则：`sessionKey` 中的 `:` 替换为 `_` 即得到 `id`。但旧飞书 session 的 `id` 比 `sessionKey` 多了尾部时间戳（这正是重复问题的根源——sessionKey 没有时间戳）。

**关键**：`id → sessionKey` 的转换已存在于后端 `_get_session_key()`（读 JSONL metadata），前端只需在调 worker 相关 API 时由后端自动转换。

---

## 3. 逐模块改动清单

### 3.1 前端改动

#### `SessionList.tsx`

| 位置 | 当前 | 改为 | 说明 |
|---|---|---|---|
| `buildSessionTree()` → `nodeByKey` key | `s.sessionKey \|\| s.id` | `s.id` | 🔴 核心修复 |
| `buildSessionTree()` → `allSessionKeys` | 收集 `sessionKey` | 收集 `id` | 启发式匹配改为基于 id |
| `buildSessionTree()` → `sessionByKey` | 双写 sessionKey+id | 只写 id | 简化 |
| `resolveParent()` → parentMap 查找 | 查 `sk` 和 `id` | 只查 `id` | parentMap 后端也改为 id |
| `resolveParent()` → 启发式规则 | 基于 sessionKey 格式 | 基于 id 格式 | 见下方详细分析 |
| `getChannel()` | 解析 sessionKey 的 `:`前缀 | 解析 id 的 `_` 前缀 | id 格式同样可解析频道 |
| `SessionTreeItem` → React key | `sessionKey \|\| id` | `id` | 保证唯一 |
| `ChildrenPanel` → React key | `sessionKey \|\| id` | `id` | 保证唯一 |
| `expandedKeys` | 用 `sessionKey \|\| id` | 用 `id` | 纯 UI 状态 |
| `tagsMap[key]` 查找 | 用 `sessionKey \|\| id` | 用 `id` | tagsMap 后端也改为 id |
| `filteredRoots` 过滤 | 用 `sessionKey \|\| id` | 用 `id` | 同上 |

#### `sessionStore.ts`

| 位置 | 当前 | 改为 | 说明 |
|---|---|---|---|
| `toggleDone()` → `key = session.sessionKey` | sessionKey | `session.id` | tagsMap 改用 id |
| `patchSessionTags(session.id, ...)` | 已经用 id | 不变 | ✅ |
| `setActiveSession(id)` | 已经用 id | 不变 | ✅ |
| `renameSession(id, ...)` | 已经用 id | 不变 | ✅ |
| `deleteSession(id)` | 已经用 id | 不变 | ✅ |

#### `MessageList.tsx`

| 位置 | 当前 | 改为 | 说明 |
|---|---|---|---|
| `fetchSessionUsage(key)` | 手动 `id → sessionKey` 转换 | **保留不变** | analytics DB 仍用 sessionKey |

### 3.2 后端改动

#### `webserver.py`

| 位置 | 当前 | 改为 | 说明 |
|---|---|---|---|
| `_handle_patch_tags()` | 读 metadata 得 sessionKey，用 sessionKey 存 tags | 直接用 `session_id` 存 tags | 简化逻辑 |
| `_handle_get_task_status()` | `_get_session_key()` 转换 | **不变** | worker 仍需 sessionKey |
| `_handle_kill_task()` | `_get_session_key()` 转换 | **不变** | worker 仍需 sessionKey |
| `_handle_send_message()` | `_get_session_key()` 转换 | **不变** | worker 仍需 sessionKey |
| `GET /api/sessions` | 返回 sessionKey | 仍返回（前端可能不再依赖，但保留兼容） | 低风险 |
| `GET /api/usage` | 用 sessionKey 查 DB | **不变** | analytics 保留 sessionKey |

#### 存储文件迁移

| 文件 | 当前格式 | 改为 | 迁移方式 |
|---|---|---|---|
| `session_tags.json` | key = sessionKey | key = id | 一次性脚本：sessionKey → id 映射 |
| `session_parents.json` | key/value = sessionKey | key/value = id | 一次性脚本：sessionKey → id 映射 |
| `session_names.json` | key = id | 不变 | ✅ 已经用 id |
| JSONL metadata `key` 字段 | sessionKey | **不改** | nanobot core 依赖此字段 |
| analytics DB | sessionKey | **不改** | 历史数据向前兼容 |

### 3.3 `resolveParent()` 启发式规则适配

启发式规则需要从基于 sessionKey 格式改为基于 id 格式。

**sessionKey 格式 vs id 格式对照**：

```
sessionKey: webchat:dispatch_1772696251_gen2     → id: webchat_dispatch_1772696251_gen2
sessionKey: webchat:worker_1772696251_B17        → id: webchat_worker_1772696251_B17
sessionKey: webchat:1772696251                   → id: webchat_1772696251
sessionKey: subagent:webchat_1772696251_abc123   → id: subagent_webchat_1772696251_abc123
sessionKey: feishu.lab.1772376517                → id: feishu.lab.1772376517 (相同！)
```

改动：

| 规则 | 当前（sessionKey） | 改为（id） |
|---|---|---|
| **手动 parentMap** | `parentMap[sk]` | `parentMap[id]` |
| **Subagent 启发式** | `sk.startsWith('subagent:')` → 解析 `:` 后的部分 | `id.startsWith('subagent_')` → 解析 `_` 后的部分，但需注意 `_` 在 id 中更常见 |
| **Webchat 启发式** | `sk.startsWith('webchat:')` → 提取时间戳 → 搜索 `endsWith(':'+ts)` 或 `endsWith('_'+ts)` | `id.startsWith('webchat_')` → 提取时间戳 → 搜索 `endsWith('_'+ts)` |
| **精确匹配** | `candidate.endsWith(':' + ts)` | `candidate.endsWith('_' + ts)` 且 `candidate` 格式为 `{channel}_{ts}`（无其他下划线） |

⚠️ **Subagent 启发式需要特别注意**：sessionKey 用 `:` 分隔 channel 和 payload，在 id 中变成 `_`。由于 `_` 在 id 中也用于其他分隔，需要更精确的解析。

例如：
- sessionKey `subagent:webchat_1772696251_abc123` → id `subagent_webchat_1772696251_abc123`
- 当前规则：取 `:` 后的 `webchat_1772696251_abc123`，匹配 `_[8hex]$` 后得到父 `webchat_1772696251`，再转为 `webchat:1772696251`
- 改为 id 后：取 `subagent_` 后的部分 → 同样的逻辑，但返回的父 key 也是 id 格式

**实际上 subagent session 都是 nanobot core 内部创建的**，其 id 和 sessionKey 的转换是确定的（`_` ↔ `:`），所以规则改写是可行的。

---

## 4. 风险评估

### ✅ 低风险

| 项目 | 原因 |
|---|---|
| React key 改用 id | 纯前端，id 唯一，零副作用 |
| nodeByKey 改用 id | 修复核心 bug，不依赖外部 |
| expandedKeys 改用 id | 纯 UI 状态，无持久化 |
| session_names.json | 已经用 id，无需改 |
| worker 通信 | 不改，后端 `_get_session_key()` 桥接 |
| analytics | 不改，MessageList 已有 id→sessionKey 转换 |

### ⚠️ 中等风险

| 项目 | 风险 | 缓解 |
|---|---|---|
| session_tags.json 迁移 | 旧 key 映射到 id 时，重复 sessionKey 对应多个 id | 旧飞书 session 共享同一 sessionKey 的 tags，迁移时每个 id 都继承相同 tags |
| session_parents.json 迁移 | 需要 sessionKey → id 的映射表 | 扫描所有 JSONL metadata 建立映射 |
| resolveParent 启发式改写 | `_` 在 id 中歧义（既是 channel 分隔符又是 payload 分隔符） | 精确匹配规则需要更严格的模式 |

### ⚠️ 需要注意的语义差异

**`getChannel()` 从 id 提取频道**：

```
id: webchat_1772944924         → channel: webchat  ✅
id: feishu.lab.1772376517      → channel: feishu   ✅
id: feishu.lab_ou_b0cea..._xxx → channel: feishu   ✅ (第一个 . 前)
id: subagent_webchat_xxx       → channel: subagent ✅
id: cli_xxx                    → channel: cli      ✅
```

从 id 提取频道：取第一个 `_` 或 `.` 之前的部分。这比从 sessionKey 提取（取 `:` 前）稍复杂，但完全可行。

---

## 5. 实施步骤

### Phase 1: 前端改动（立即修复 bug）

1. `SessionList.tsx`：
   - `buildSessionTree()` 中 `nodeByKey`、`allSessionKeys`、`childSessionKeys` 全部改用 `id`
   - `resolveParent()` 改为基于 id 格式的启发式
   - `getChannel()` 改为从 id 提取
   - 所有 React key 用 `session.id`
   - `tagsMap` 和 `expandedKeys` 查找用 `id`

2. `sessionStore.ts`：
   - `toggleDone()` 中 `key = session.id`（替代 `session.sessionKey`）

### Phase 2: 后端改动 + 数据迁移

1. `webserver.py` → `_handle_patch_tags()` 改为用 `session_id` 存 tags
2. 迁移脚本：
   - 扫描所有 JSONL 建立 `sessionKey → [id1, id2, ...]` 映射
   - `session_tags.json`：每个 sessionKey 的 tags 复制到对应的所有 id
   - `session_parents.json`：key 和 value 都从 sessionKey 转为 id

### Phase 3: 清理

1. 前端可以逐步移除对 `session.sessionKey` 的依赖（但保留字段，因为 MessageList usage 查询还需要）
2. 确认所有功能正常后，可以考虑后端 API 不再返回 `sessionKey`（可选，不急）

---

## 6. 结论

**方案可行，且比之前的方案 A/B/C 更彻底**。

核心优势：
- **统一心智模型**：全链路只有一个标识 `id`，不再有 sessionKey/id 混淆
- **根治重复问题**：id 天然唯一
- **改动量可控**：主要改前端 2 个文件 + 后端 1 个函数 + 2 个 JSON 迁移
- **向前兼容**：analytics DB 和 worker 通信不受影响（后端自动桥接）

唯一需要注意的是 `resolveParent()` 启发式规则的改写，因为 `_` 在 id 中的语义不如 `:` 在 sessionKey 中清晰。但通过更精确的正则匹配可以解决。
