# Web Chat Dev 环境说明

本文档说明 web-chat 在 dev 环境下的配置和使用方式。

## 环境变量

web-chat 的 worker.py 和 webserver.py 支持以下环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NANOBOT_LOG_DIR` | `~/.nanobot/logs/` | 日志输出目录 |
| `WEBSERVER_PORT` | `8081` | webserver 监听端口 |
| `WORKER_PORT` | `8082` | worker 监听端口 |

Dev 环境典型配置：
```bash
export NANOBOT_LOG_DIR=~/.nanobot/logs-dev/
export WEBSERVER_PORT=9081
export WORKER_PORT=9082
export PYTHONPATH=~/.nanobot/workspace/dev-workdir/nanobot:$PYTHONPATH
```

## 使用 nanobot-dev.sh（推荐）

统一管理脚本 `~/.nanobot/workspace/dev-workdir/nanobot-dev.sh` 会自动设置上述所有环境变量并启动 dev webserver/worker。

```bash
cd ~/.nanobot/workspace/dev-workdir
./nanobot-dev.sh start all        # 启动 dev 全部组件
./nanobot-dev.sh restart worker   # 只重启 dev worker
./nanobot-dev.sh status           # 查看 prod + dev 状态
```

详见 `~/.nanobot/workspace/dev-workdir/nanobot/docs/dev-environment.md`。

## 直接使用 restart.sh（不推荐）

⚠️ **restart.sh 不会自动设置 PYTHONPATH**——直接运行会加载 pip 安装的 prod nanobot 代码。

⚠️ **restart.sh 默认端口是 8081/8082**——不设环境变量会杀掉 prod 进程。

如必须直接使用 restart.sh：
```bash
cd ~/.nanobot/workspace/dev-workdir/web-chat
PYTHONPATH=$HOME/.nanobot/workspace/dev-workdir/nanobot:$PYTHONPATH \
NANOBOT_LOG_DIR=$HOME/.nanobot/logs-dev \
WEBSERVER_PORT=9081 WORKER_PORT=9082 \
./restart.sh all
```

## Dev Worker API

- **端点**: `http://127.0.0.1:9082/execute-stream`
- **参数**: 使用 `session_key`（不是 `session_id`）
- **模式**: 建议 fire-and-forget（不用 `--wait`），避免阻塞

## 进程隔离

restart.sh 中的 `find_pids()` 使用精确 `SCRIPT_DIR` 路径匹配，确保 dev 和 prod 的 restart.sh 互不干扰：
- dev restart.sh 只匹配 `dev-workdir/web-chat/` 路径下的进程
- prod restart.sh 只匹配 `workspace/web-chat/` 路径下的进程
