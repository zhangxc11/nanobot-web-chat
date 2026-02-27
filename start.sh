#!/bin/bash
# nanobot Web Chat — Start webserver + worker
# Usage: ./start.sh [--webserver-port 8081] [--worker-port 8082]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBSERVER_PORT=8081
WORKER_PORT=8082

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --webserver-port) WEBSERVER_PORT="$2"; shift 2;;
        --worker-port) WORKER_PORT="$2"; shift 2;;
        *) echo "Unknown arg: $1"; exit 1;;
    esac
done

WORKER_URL="http://127.0.0.1:${WORKER_PORT}"

echo "🚀 Starting nanobot Web Chat..."
echo "   Webserver: http://127.0.0.1:${WEBSERVER_PORT}"
echo "   Worker:    ${WORKER_URL}"
echo ""

# Start worker in background
python3 "${SCRIPT_DIR}/worker.py" --port "${WORKER_PORT}" &
WORKER_PID=$!
echo "   Worker PID: ${WORKER_PID}"

# Give worker a moment to start
sleep 0.5

# Start webserver in foreground
python3 "${SCRIPT_DIR}/webserver.py" --port "${WEBSERVER_PORT}" --worker-url "${WORKER_URL}" &
WEBSERVER_PID=$!
echo "   Webserver PID: ${WEBSERVER_PID}"

echo ""
echo "✅ Both services started. Press Ctrl+C to stop."
echo ""

# Trap Ctrl+C to kill both
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill "${WEBSERVER_PID}" 2>/dev/null || true
    kill "${WORKER_PID}" 2>/dev/null || true
    wait "${WEBSERVER_PID}" 2>/dev/null || true
    wait "${WORKER_PID}" 2>/dev/null || true
    echo "👋 Done."
}
trap cleanup SIGINT SIGTERM

# Wait for either to exit
wait
