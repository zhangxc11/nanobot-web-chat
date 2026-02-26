# Web Chat Tests

## 测试结构

```
tests/
├── README.md                 # 本文件
├── test_analytics.py         # Token 用量 SQLite 存储测试
└── (future test files)
```

## 运行测试

```bash
cd ~/.nanobot/workspace/web-chat

# 运行所有测试
python3 -m pytest tests/ -v

# 运行单个测试文件
python3 -m pytest tests/test_analytics.py -v

# 运行单个测试类
python3 -m pytest tests/test_analytics.py::TestMigrateFromJsonl -v

# 运行单个测试用例
python3 -m pytest tests/test_analytics.py::TestMigrateFromJsonl::test_idempotent_migration -v
```

## 依赖

```bash
pip install pytest
```

## 环境隔离策略

### 数据库隔离

- **测试数据库**：使用 SQLite `:memory:` 内存数据库（通过 `AnalyticsDB(db_path=":memory:")` 注入）
- **生产数据库**：`~/.nanobot/workspace/analytics.db`
- **隔离机制**：每个测试用例通过 pytest fixture 获得独立的内存数据库实例，测试结束后自动销毁
- **文件测试**：`test_file_based_db` 使用 `tempfile.TemporaryDirectory` 创建临时文件，测试后自动清理

### JSONL 迁移测试

- 使用 `tempfile.TemporaryDirectory` 创建临时 JSONL 文件
- 不读取任何生产 session 数据
- 测试后自动清理

## 测试用例说明

### test_analytics.py

| 测试类 | 用例数 | 说明 |
|--------|--------|------|
| TestSchema | 3 | 表创建、索引创建、幂等性 |
| TestRecordUsage | 3 | 插入返回 ID、自增、字段完整性 |
| TestGetGlobalUsage | 5 | 空库、总计、按模型、按 session、last_used |
| TestGetSessionUsage | 2 | 存在的 session、不存在的 session |
| TestGetDailyUsage | 2 | 按天聚合、空库 |
| TestMigrateFromJsonl | 7 | 基本迁移、新格式、旧格式兜底、幂等、多 session、不存在目录、跳过非 usage |
| TestEdgeCases | 4 | 批量写入、文件 DB 持久化、Unicode、零值 |
| **合计** | **26** | |

## 注意事项

1. **不要在测试中使用生产数据库路径** — 始终通过参数注入测试路径
2. **`:memory:` 的特殊行为** — 每次 `sqlite3.connect(":memory:")` 创建独立的空数据库，`AnalyticsDB` 内部对此做了特殊处理（复用持久连接）
3. **迁移测试的幂等性** — `test_idempotent_migration` 验证重复迁移不产生重复记录，这是生产环境安全运行迁移的前提
