# Provider Pool — Web Chat 集成设计

> 更新于 2026-03-01
> **nanobot 核心设计**：见 nanobot 核心仓库 `docs/REQUIREMENTS.md §十五` 和 `docs/ARCHITECTURE.md §七`

## 概述

本文档描述 Web Chat 侧如何集成 nanobot 核心的 ProviderPool 功能，实现前端 UI 的 provider 动态切换。

**nanobot 核心已完成的工作**（commit `e31c837`）：
- `ProviderPool` 类（`providers/pool.py`）：实现 `LLMProvider` 接口的代理类，内部持有多个 provider 实例
- `_make_provider(config)` 返回 `ProviderPool` 实例（包含所有已配置的 provider）
- `/provider` 斜杠命令（AgentLoop 层，CLI + Gateway 可用）
- `anthropic_proxy` provider 配置槽位

## Web Chat 需要做的事

### 1. Worker — ProviderPool 单例 + API 端点

**关键问题**：Worker 每次任务创建新的 AgentRunner（`_create_runner()`），但 ProviderPool 状态需要跨任务持久化。

**解决方案**：模块级 ProviderPool 单例。

```python
# worker.py 模块级
_provider_pool = None
_pool_lock = threading.Lock()

def _get_pool() -> ProviderPool:
    """构建或获取 ProviderPool 单例。"""
    global _provider_pool
    if _provider_pool is None:
        with _pool_lock:
            if _provider_pool is None:
                _provider_pool = _build_pool()
    return _provider_pool

def _build_pool():
    """从 nanobot config 构建 ProviderPool。"""
    from nanobot.config.loader import load_config
    from nanobot.cli.commands import _make_provider
    config = load_config()
    return _make_provider(config)
```

**_create_runner() 改造**：从 Pool 获取当前 active 状态构建 runner，将 Pool 作为 provider 传入 AgentLoop。

**API 端点**：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/provider` | 返回 active + available |
| PUT | `/provider` | 切换 provider（任务执行中返回 409） |

```
GET /provider
Response: {
  "active": { "provider": "anthropic", "model": "claude-opus-4-6" },
  "available": [
    { "name": "anthropic", "model": "claude-opus-4-6" },
    { "name": "deepseek", "model": "deepseek-chat" }
  ]
}

PUT /provider
Body: { "provider": "deepseek", "model": "deepseek-chat" }
Response (success): { "active": { "provider": "deepseek", "model": "deepseek-chat" } }
Response (busy): 409 { "error": "Task running, cannot switch provider" }
Response (invalid): 400 { "error": "Unknown provider: xxx" }
```

### 2. Webserver — 转发 `/api/provider`

| 方法 | 前端路径 | Worker 路径 |
|------|---------|------------|
| GET | `/api/provider` | → `GET /provider` |
| PUT | `/api/provider` | → `PUT /provider` |

### 3. 前端 — Provider API + Store + UI

#### API 层 (`services/api.ts`)
- `getProvider()`: GET /api/provider
- `setProvider(provider, model?)`: PUT /api/provider

#### 状态管理 (`store/providerStore.ts`)
- `active`: 当前 provider + model
- `available`: 所有可用 provider 列表
- `fetchProvider()`: 获取状态
- `switchProvider(name, model?)`: 切换

#### 斜杠命令 (`store/messageStore.ts`)
- `/provider`: 调 API 查询，显示 system-local 消息
- `/provider <name> [model]`: 调 API 切换
- 任务执行中提示无法切换

#### Provider 选择器 UI (`pages/chat/ChatInput.tsx`)

```
┌─────────────────────────────────────┐
│  🔌 anthropic / claude-opus-4-6  ▾ │  ← Provider 选择器
├─────────────────────────────────────┤
│  [消息输入框]              [发送]    │
└─────────────────────────────────────┘
```

- 点击展开下拉，显示所有可用 provider + model
- 任务执行中整个选择器 disabled（灰色不可点）
- 切换后调 `PUT /api/provider`

## 数据流

```
前端 UI / 斜杠命令
  → webserver /api/provider
    → worker /provider
      → 修改 ProviderPool 内存状态
      → 下次 .chat() 使用新 provider + model

任务执行中:
  → 前端 UI: provider 选择器 disabled
  → 前端 /provider 命令: 本地提示 "任务执行中，无法切换"
  → Worker API PUT /provider: 返回 409
```

## 任务执行中的保护

| 层级 | 保护方式 |
|------|---------|
| 前端 UI | 选择器 disabled |
| 前端 /provider 命令 | 本地 system-local 消息提示 |
| Worker PUT /provider | 检查 _has_running_tasks()，返回 409 |

## 改动清单

| 文件 | 改动 |
|------|------|
| `worker.py` | 模块级 ProviderPool 单例；`GET/PUT /provider` 端点；`_create_runner()` 基于 Pool 状态构建 |
| `webserver.py` | 转发 `GET/PUT /api/provider` 到 worker |
| `frontend/src/services/api.ts` | 新增 `getProvider()` / `setProvider()` |
| `frontend/src/store/providerStore.ts` | **新建** provider 状态管理 |
| `frontend/src/store/messageStore.ts` | `/provider` 斜杠命令 + `/help` 更新 |
| `frontend/src/pages/chat/ChatInput.tsx` | provider 选择器 UI |
| `frontend/src/pages/chat/ChatInput.module.css` | 选择器样式 |
