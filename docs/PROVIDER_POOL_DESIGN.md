# Provider Pool 架构设计 v2

> 更新于 2026-03-01，基于最新需求对齐。

## 需求

1. 在 `config.json` 中新增 `anthropic_proxy` provider 配置槽位
2. 引入 **ProviderPool** 运行时管理多个 provider 实例，支持动态切换 active provider + model
3. 前端 UI 可选择当前使用的 provider + model（空闲时）
4. 新增 `/provider` 斜杠命令，全 channel 可用（webchat 前端、命令行、gateway）
5. **不修改 config.json 来切换** — config 只声明可用 API 源池，切换是纯运行时状态
6. **各 channel 独立** — webchat worker、gateway、命令行各自维护独立的 ProviderPool 状态
7. **任务执行中禁止切换** — 前端 UI disabled + 后端 API 拒绝 + 斜杠命令提示

## 现状分析

### 当前调用链

```
config.json
  ├── agents.defaults.model = "claude-opus-4-6"
  └── providers.anthropic = { apiKey, apiBase }

_make_provider(config)
  → Config._match_provider(model) → (ProviderConfig, "anthropic")
  → LiteLLMProvider(api_key, api_base, model, ...)

AgentLoop.__init__(provider=provider)
  → self.provider = provider    ← 整个 loop 生命周期不变
  → self.model = model          ← 固定

_run_agent_loop() while loop:
  → self.provider.chat(messages, model=self.model)
```

### 核心问题

- `LiteLLMProvider` 构造时绑定 `api_key` + `api_base`，之后不可变
- `AgentLoop.model` 也是构造时固定
- 要实现运行时切换，需要在 `.chat()` 前能切换 provider + model

## 设计方案

### 核心思想

引入 **ProviderPool**：实现 `LLMProvider` 接口的代理类，内部持有多个 provider 实例。
AgentLoop 无感知，仍然调用 `self.provider.chat()`，Pool 内部路由到当前 active provider。

### 架构图

```
config.json (静态声明)
  └── providers
        ├── anthropic       = { apiKey, apiBase }
        ├── anthropic_proxy = { apiKey, apiBase }
        ├── deepseek        = { apiKey }
        └── ...

启动时:
  _make_provider(config)
    → 遍历所有 providers，为每个有 apiKey 的构建 LLMProvider 实例
    → ProviderPool(
        providers={
          "anthropic": (LiteLLMProvider(...), "claude-opus-4-6"),
          "deepseek":  (LiteLLMProvider(...), "deepseek-chat"),
          ...
        },
        active_provider="anthropic",
        active_model="claude-opus-4-6",
      )

AgentLoop.__init__(provider=pool)
  → self.provider = pool        ← AgentLoop 不感知 Pool
  → self.model = pool.active_model  ← 从 pool 获取

_run_agent_loop() while loop:
  → self.provider.chat(messages, model=self.model)
    → pool 内部: providers[active_provider].chat(messages, model=active_model)
```

### ProviderPool 类设计

```python
class ProviderPool(LLMProvider):
    """代理类：持有多个 LLMProvider，支持运行时切换。

    每个 entry 是 (provider_instance, default_model)，
    因为不同 provider 可能对应不同的模型。
    """

    def __init__(
        self,
        providers: dict[str, tuple[LLMProvider, str]],  # name → (instance, default_model)
        active_provider: str,
        active_model: str,
    ):
        super().__init__()
        self._providers = providers
        self._active_provider = active_provider
        self._active_model = active_model

    # ── 状态查询 ──

    @property
    def active_provider(self) -> str:
        return self._active_provider

    @property
    def active_model(self) -> str:
        return self._active_model

    @property
    def available(self) -> list[dict]:
        """返回所有可用 provider 及其默认 model。"""
        return [
            {"name": name, "model": model}
            for name, (_, model) in self._providers.items()
        ]

    # ── 切换 ──

    def switch(self, provider: str, model: str | None = None) -> None:
        """切换 active provider 和 model。

        Args:
            provider: provider 名称
            model: 可选，不指定则使用该 provider 的默认 model
        """
        if provider not in self._providers:
            raise ValueError(f"Unknown provider: {provider}. Available: {list(self._providers.keys())}")
        self._active_provider = provider
        _, default_model = self._providers[provider]
        self._active_model = model or default_model

    # ── LLMProvider 接口 ──

    async def chat(self, messages, tools=None, model=None, max_tokens=4096, temperature=0.7):
        provider, _ = self._providers[self._active_provider]
        # 使用 active_model，除非调用方显式指定了 model
        effective_model = model or self._active_model
        return await provider.chat(messages, tools, effective_model, max_tokens, temperature)

    def get_default_model(self) -> str:
        return self._active_model
```

### AgentLoop 集成

AgentLoop 需要感知 model 可能变化（因为 ProviderPool.active_model 可以被外部修改）：

- `self.model` 仍然在 `__init__` 时从 `provider.get_default_model()` 获取
- 但 `_run_agent_loop` 每轮调用时使用 `self.provider.get_default_model()` 获取最新 model
  （或者让 pool.chat() 内部处理，调用方传 `model=self.model` 时 pool 用 active_model 覆盖）

**选择方案**：Pool 的 `chat()` 忽略调用方传入的 model，始终使用 `self._active_model`。
这样 AgentLoop 代码零改动，model 切换完全由 Pool 控制。

> 注意：这意味着 `model` 参数在 Pool 模式下被忽略。这是合理的，因为切换 provider 时
> model 也一起切换了。如果未来需要同一 provider 下切换 model，可以扩展 Pool 接口。

### `/provider` 斜杠命令

#### AgentLoop 中处理（命令行 + gateway）

在 `_process_message` 的 slash commands 区域新增：

```python
if cmd.startswith("/provider"):
    return self._handle_provider_command(msg, cmd)
```

```python
def _handle_provider_command(self, msg, cmd):
    pool = self.provider  # 可能不是 ProviderPool（向后兼容）
    if not isinstance(pool, ProviderPool):
        return OutboundMessage(..., content="Provider switching not available (single provider mode)")

    parts = cmd.strip().split()
    if len(parts) == 1:
        # /provider — 显示状态
        lines = [f"🔌 当前: {pool.active_provider} / {pool.active_model}"]
        lines.append("可用:")
        for item in pool.available:
            marker = " ←" if item["name"] == pool.active_provider else ""
            lines.append(f"  • {item['name']} ({item['model']}){marker}")
        return OutboundMessage(..., content="\n".join(lines))
    else:
        # /provider <name> [model] — 切换
        provider_name = parts[1]
        model = parts[2] if len(parts) > 2 else None
        try:
            pool.switch(provider_name, model)
            return OutboundMessage(..., content=f"✅ 已切换到 {pool.active_provider} / {pool.active_model}")
        except ValueError as e:
            return OutboundMessage(..., content=f"❌ {e}")
```

#### webchat 前端处理

前端本地拦截 `/provider`，调 worker API 实现：

- `/provider` → `GET /api/provider` → 显示状态
- `/provider <name> [model]` → `PUT /api/provider` → 切换

### webchat 数据流

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
  → AgentLoop /provider 命令: 在 _process_message 中检测任务状态
```

### Worker 中 ProviderPool 的生命周期

**关键问题**：当前 worker 每次任务创建新的 AgentRunner（`_create_runner()`），
意味着每次任务都有新的 ProviderPool 实例。

**解决方案**：Worker 维护一个**模块级 ProviderPool 单例**：

```python
# worker.py 模块级
_provider_pool: ProviderPool | None = None
_pool_lock = threading.Lock()

def _get_pool() -> ProviderPool:
    global _provider_pool
    if _provider_pool is None:
        with _pool_lock:
            if _provider_pool is None:
                _provider_pool = _build_pool_from_config()
    return _provider_pool
```

然后 `_create_runner()` 从这个单例 Pool 获取当前 active provider 来构建 runner：

```python
def _create_runner():
    pool = _get_pool()
    # 用 pool 的 active provider 构建 runner
    runner = AgentRunner.from_config_with_provider(pool)
    return runner
```

**但这样有并发问题**：如果两个任务同时运行，它们共享同一个 Pool。

**更好的方案**：Pool 是模块级单例，但 runner 创建时**克隆**当前 active 状态：

- Pool 单例只负责维护 "当前选择的 provider + model" 状态
- `_create_runner()` 读取 Pool 状态，创建对应的单 provider runner
- 切换 Pool 状态不影响已创建的 runner

这样：
1. 空闲时切换 Pool → 下次创建 runner 用新 provider
2. 执行中的 runner 不受影响
3. 执行中禁止切换（前后端都拦截）

## 改动清单

### Phase 1: nanobot 核心

| 文件 | 改动 |
|------|------|
| `providers/registry.py` | 新增 `anthropic_proxy` ProviderSpec |
| `config/schema.py` | `ProvidersConfig` 增加 `anthropic_proxy` 字段 |
| `providers/pool.py` | **新建** ProviderPool 类 |
| `providers/__init__.py` | 导出 ProviderPool |
| `cli/commands.py` | `_make_provider` → `_make_provider_pool`，构建 ProviderPool |
| `agent/loop.py` | 新增 `/provider` 斜杠命令处理 |

### Phase 2: web-chat Worker

| 文件 | 改动 |
|------|------|
| `worker.py` | 模块级 ProviderPool 单例；`GET/PUT /provider` 端点；任务执行中 PUT 返回 409；`_create_runner()` 基于 Pool 状态构建 |

### Phase 3: web-chat Webserver

| 文件 | 改动 |
|------|------|
| `webserver.py` | 转发 `GET/PUT /api/provider` 到 worker |

### Phase 4: web-chat 前端

| 文件 | 改动 |
|------|------|
| `services/api.ts` | 新增 `getProvider()` / `setProvider()` |
| `store/messageStore.ts` | `/provider` 斜杠命令本地处理 |
| `pages/chat/ChatInput.tsx` | provider + model 选择器 UI |
| `pages/chat/ChatInput.module.css` | 选择器样式 |
| `store/providerStore.ts` | **新建** provider 状态管理 |

## API 设计

### Worker API

```
GET /provider
Response: {
  "active": { "provider": "anthropic", "model": "claude-opus-4-6" },
  "available": [
    { "name": "anthropic", "model": "claude-opus-4-6" },
    { "name": "anthropic_proxy", "model": "claude-opus-4-6" },
    { "name": "deepseek", "model": "deepseek-chat" },
  ]
}

PUT /provider
Body: { "provider": "anthropic_proxy", "model": "claude-opus-4-6" }
Response (success): { "active": { "provider": "anthropic_proxy", "model": "claude-opus-4-6" } }
Response (busy): 409 { "error": "Task running, cannot switch provider" }
Response (invalid): 400 { "error": "Unknown provider: xxx" }
```

### Webserver API (转发)

```
GET /api/provider  → proxy to worker GET /provider
PUT /api/provider  → proxy to worker PUT /provider
```

## 前端交互

### Provider 选择器

在 ChatInput 输入框上方显示：

```
┌─────────────────────────────────────┐
│  🔌 anthropic / claude-opus-4-6  ▾ │
├─────────────────────────────────────┤
│  [消息输入框]              [发送]    │
└─────────────────────────────────────┘
```

- 点击展开下拉，显示所有可用 provider + model
- 任务执行中整个选择器 disabled（灰色不可点）
- 切换后调 `PUT /api/provider`

### `/provider` 命令

| 用法 | 效果 |
|------|------|
| `/provider` | 显示当前 active + 可用列表 |
| `/provider <name> [model]` | 切换 provider（任务中拒绝） |
