#!/bin/bash
# restart-gateway.sh — Stop and restart gateway + worker services.
#
# Usage:
#   ./restart-gateway.sh              # restart both gateway and worker
#   ./restart-gateway.sh gateway      # restart gateway only
#   ./restart-gateway.sh worker       # restart worker only
#   ./restart-gateway.sh stop         # stop both
#   ./restart-gateway.sh status       # show status
#
# This script handles daemonization properly, safe to call from nanobot exec tool.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GATEWAY_PORT="${GATEWAY_PORT:-8081}"
WORKER_PORT="${WORKER_PORT:-8082}"
WORKER_URL="http://127.0.0.1:${WORKER_PORT}"

stop_gateway() {
    local pids
    pids=$(pgrep -f "gateway.py.*--port ${GATEWAY_PORT}" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Stopping gateway (pid: $pids)..."
        echo "$pids" | xargs kill 2>/dev/null || true
        sleep 0.5
        # Force kill if still running
        pids=$(pgrep -f "gateway.py.*--port ${GATEWAY_PORT}" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    else
        echo "Gateway not running."
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

start_gateway() {
    echo "Starting gateway on port ${GATEWAY_PORT}..."
    cd "$SCRIPT_DIR"
    python3 gateway.py --port "$GATEWAY_PORT" --worker-url "$WORKER_URL" --daemonize
    sleep 0.5
    if curl -s "http://127.0.0.1:${GATEWAY_PORT}/api/health" >/dev/null 2>&1; then
        echo "✅ Gateway healthy at http://127.0.0.1:${GATEWAY_PORT}"
    else
        echo "⚠️  Gateway started but health check failed (may need a moment)"
    fi
}

start_worker() {
    echo "Starting worker on port ${WORKER_PORT}..."
    cd "$SCRIPT_DIR"
    python3 worker.py --port "$WORKER_PORT" --daemonize
    sleep 0.5
    if curl -s "http://127.0.0.1:${WORKER_PORT}/health" >/dev/null 2>&1; then
        echo "✅ Worker healthy at http://127.0.0.1:${WORKER_PORT}"
    else
        echo "⚠️  Worker started but health check failed (may need a moment)"
    fi
}

show_status() {
    echo "=== nanobot Web Chat Services ==="
    local gw_pids worker_pids
    gw_pids=$(pgrep -f "gateway.py.*--port ${GATEWAY_PORT}" 2>/dev/null || true)
    worker_pids=$(pgrep -f "worker.py.*--port ${WORKER_PORT}" 2>/dev/null || true)

    if [ -n "$gw_pids" ]; then
        echo "Gateway:  ✅ running (pid: $gw_pids, port: ${GATEWAY_PORT})"
    else
        echo "Gateway:  ❌ stopped"
    fi

    if [ -n "$worker_pids" ]; then
        echo "Worker:   ✅ running (pid: $worker_pids, port: ${WORKER_PORT})"
    else
        echo "Worker:   ❌ stopped"
    fi
}

case "${1:-all}" in
    gateway)
        stop_gateway
        start_gateway
        ;;
    worker)
        stop_worker
        start_worker
        ;;
    stop)
        stop_gateway
        stop_worker
        ;;
    status)
        show_status
        ;;
    all|restart)
        stop_worker
        stop_gateway
        start_worker
        start_gateway
        ;;
    *)
        echo "Usage: $0 [all|gateway|worker|stop|status]"
        exit 1
        ;;
esac
