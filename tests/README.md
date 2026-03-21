# Web Chat Tests

## 测试结构

```
tests/
├── README.md                     # 本文件
├── conftest.py                   # 共享 fixtures（event loop、mock executor、temp dirs）
├── test_analytics.py             # Token 用量 SQLite 存储测试 (26 tests)
├── test_worker_config.py         # Worker 配置对齐测试 (5 tests)
├── test_cron_integration.py      # Cron 功能集成测试 (43 tests) ⭐ 优先覆盖
├── test_worker_integration.py    # Worker 层集成测试 (41 tests)
└── test_webserver_integration.py # Webserver 集成测试 (18 tests)
```

## 运行测试

```bash
cd ~/.nanobot/workspace/web-chat

# 运行所有测试
python3 -m pytest tests/ -v

# 运行新增的集成测试
python3 -m pytest tests/test_cron_integration.py tests/test_worker_integration.py tests/test_webserver_integration.py -v

# 运行单个测试文件
python3 -m pytest tests/test_cron_integration.py -v

# 运行单个测试类
python3 -m pytest tests/test_cron_integration.py::TestJobCRUD -v
```

## 依赖

```bash
pip install pytest pytest-asyncio
```

## 测试覆盖范围

### test_cron_integration.py (43 tests) — 优先级 1

| 测试类 | 用例数 | 说明 |
|--------|--------|------|
| TestComputeNextRun | 11 | 调度计算：at/every/cron 三种类型、边界条件 |
| TestJobCRUD | 8 | 任务增删改查：add/list/remove/enable/disable |
| TestFilePersistence | 4 | 文件持久化：round-trip、JSON 结构、外部修改检测 |
| TestJobExecution | 7 | 任务执行：executor 协议、target_session 路由、异常处理 |
| TestScheduleAdvancement | 3 | 调度推进：one-shot 禁用/删除、recurring 重算 |
| TestTimerAndDueJobs | 4 | 定时器：到期任务检测、未来任务跳过 |
| TestServiceLifecycle | 4 | 服务生命周期：start/stop、状态报告 |
| TestScheduleValidation | 2 | 输入校验：tz 限制、无效时区 |

### test_worker_integration.py (41 tests) — 优先级 2

| 测试类 | 用例数 | 说明 |
|--------|--------|------|
| TestWorkerCronExecutor | 2 | CronExecutor 协议：消息格式、session key 格式 |
| TestWorkerSubagentCallback | 10 | 子 agent 生命周期：spawn/progress/retry/done、查询、线程安全 |
| TestTruncateToolOutput | 6 | 工具输出截断：空值、长文本、多行 |
| TestCleanupOldTasks | 2 | 任务清理：过期删除、运行中保留 |
| TestSSENotification | 2 | SSE 推送：多客户端、断连清理 |
| TestInjectQueue | 4 | 消息注入队列：FIFO、dict 格式 |
| TestWorkerRouting | 14 | HTTP 路由：所有端点、URL 编码 |
| TestTaskStructure | 4 | 任务字典：必需字段、状态转换、usage 记录 |
| TestSessionMessengerLogic | 3 | 会话消息：前缀格式、注入逻辑 |

### test_webserver_integration.py (18 tests) — 优先级 3

| 测试类 | 用例数 | 说明 |
|--------|--------|------|
| TestStripRuntimeContext | 8 | Runtime Context 剥离：字符串、多模态、边界 |
| TestSessionKeyConversion | 7 | Session ID ↔ Key 转换：各种格式 |
| TestAnalyticsIntegration | 3 | 用量分析：记录查询、session 查询、日聚合 |

## 环境隔离策略

### CronService 隔离

- **临时目录**：每个测试通过 `tmp_dir` fixture 获得独立目录
- **Mock Executor**：使用 `AsyncMock` 模拟执行器，不触发真实 LLM 调用
- **Timer 隔离**：`cron_svc` fixture 用 stub 替换 `_arm_timer()`，避免需要 asyncio event loop
- **Scheduler Lock**：每个测试使用独立的临时 lock 文件

### Worker 组件隔离

- **不导入 worker.py 模块**：worker.py 有重量级的模块级副作用（import nanobot core），测试通过重新实现关键类来测试逻辑
- **Mock Task Registry**：通过 `mock_task` fixture 创建标准任务字典
- **线程安全测试**：使用真实的 `threading.Thread` 验证并发安全

### 数据库隔离

- **内存数据库**：Analytics 测试使用 SQLite `:memory:`
- **无生产数据访问**：所有测试完全独立

## 注意事项

1. **不要在测试中使用生产数据库路径** — 始终通过参数注入测试路径
2. **CronService 的 _arm_timer 需要 event loop** — 同步测试必须 stub 掉
3. **worker.py 不可直接 import** — 模块级代码会触发 nanobot config 加载
