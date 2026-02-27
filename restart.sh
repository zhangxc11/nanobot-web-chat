#!/bin/bash
# restart.sh — Stop and restart webserver + worker services.
#
# Usage:
#   ./restart.sh              # restart both webserver and worker
#   ./restart.sh webserver    # restart webserver only
#   ./restart.sh worker       # restart worker only
#   ./restart.sh stop         # stop both
#   ./restart.sh status       # show status
#
# This script handles daemonization properly, safe to call from nanobot exec tool.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBSERVER_PORT="${WEBSERVER_PORT:-8081}"
WORKER_PORT="${WORKER_PORT:-8082}"
WORKER_URL="http://127.0.0.1:${WORKER_PORT}"

# Use nanobot's venv python (requires 3.10+)
PYTHON="${NANOBOT_PYTHON:-/Users/zhangxingcheng/Documents/code/workspace/nanobot/venv311/bin/python3}"

stop_webserver() {
    local pids
    pids=$(pgrep -f "webserver.py.*--port ${WEBSERVER_PORT}" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Stopping webserver (pid: $pids)..."
        echo "$pids" | xargs kill 2>/dev/null || true
        sleep 0.5
        # Force kill if still running
        pids=$(pgrep -f "webserver.py.*--port ${WEBSERVER_PORT}" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    else
        echo "Webserver not running."
    fi
}

stop_worker() {
    local pids
    pids=$(pgrep -f "worker.py.*--port ${WORKER_PORT}" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Stopping worker (pid: $pids)..."
        echo "$pids" | xargs kill 2>/dev/null || true
        sleep 0.5
        pids=$(pgrep -f "worker.py.*--port ${WORKER_PORT}" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    else
        echo "Worker not running."
    fi
}

start_webserver() {
    echo "Starting webserver on port ${WEBSERVER_PORT}..."
    cd "$SCRIPT_DIR"
    $PYTHON webserver.py --port "$WEBSERVER_PORT" --worker-url "$WORKER_URL" --daemonize
    sleep 0.5
    if curl -s "http://127.0.0.1:${WEBSERVER_PORT}/api/health" >/dev/null 2>&1; then
        echo "✅ Webserver healthy at http://127.0.0.1:${WEBSERVER_PORT}"
    else
        echo "⚠️  Webserver started but health check failed (may need a moment)"
    fi
}

start_worker() {
    echo "Starting worker on port ${WORKER_PORT}..."
    cd "$SCRIPT_DIR"
    $PYTHON worker.py --port "$WORKER_PORT" --daemonize
    sleep 0.5
    if curl -s "http://127.0.0.1:${WORKER_PORT}/health" >/dev/null 2>&1; then
        echo "✅ Worker healthy at http://127.0.0.1:${WORKER_PORT}"
    else
        echo "⚠️  Worker started but health check failed (may need a moment)"
    fi
}

show_status() {
    echo "=== nanobot Web Chat Services ==="
    local ws_pids worker_pids
    ws_pids=$(pgrep -f "webserver.py.*--port ${WEBSERVER_PORT}" 2>/dev/null || true)
    worker_pids=$(pgrep -f "worker.py.*--port ${WORKER_PORT}" 2>/dev/null || true)

    if [ -n "$ws_pids" ]; then
        echo "Webserver: ✅ running (pid: $ws_pids, port: ${WEBSERVER_PORT})"
    else
        echo "Webserver: ❌ stopped"
    fi

    if [ -n "$worker_pids" ]; then
        echo "Worker:    ✅ running (pid: $worker_pids, port: ${WORKER_PORT})"
    else
        echo "Worker:    ❌ stopped"
    fi
}

case "${1:-all}" in
    webserver)
        stop_webserver
        start_webserver
        ;;
    worker)
        stop_worker
        start_worker
        ;;
    stop)
        stop_webserver
        stop_worker
        ;;
    status)
        show_status
        ;;
    all|restart)
        stop_worker
        stop_webserver
        start_worker
        start_webserver
        ;;
    *)
        echo "Usage: $0 [all|webserver|worker|stop|status]"
        exit 1
        ;;
esac
