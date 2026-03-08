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
# Auto-detect from `which nanobot` if NANOBOT_PYTHON is not set
if [ -z "$NANOBOT_PYTHON" ]; then
    NANOBOT_BIN=$(which nanobot 2>/dev/null)
    if [ -n "$NANOBOT_BIN" ]; then
        NANOBOT_PYTHON="$(dirname "$NANOBOT_BIN")/python3"
    fi
fi
PYTHON="${NANOBOT_PYTHON:-python3}"

# Max age in seconds for a process to be considered "newly started"
NEW_PROCESS_MAX_AGE=15

# --- Process discovery (robust matching) ---
# Match any python process running webserver.py or worker.py under SCRIPT_DIR,
# regardless of whether --port was passed on the command line.
find_pids() {
    local script_name="$1"
    # pgrep -f matches the full command line; we match the script path or just the name
    # Use lsof as fallback to find who's listening on the port
    local pids
    pids=$(pgrep -f "${SCRIPT_DIR}/${script_name}" 2>/dev/null || true)
    if [ -z "$pids" ]; then
        # Fallback: match just the script name (for cases launched from the dir)
        pids=$(pgrep -f "[Pp]ython[3]?.*${script_name}" 2>/dev/null || true)
    fi
    echo "$pids"
}

# Find PID listening on a specific port (via lsof)
find_pid_on_port() {
    local port="$1"
    lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null || true
}

# Get process elapsed time in seconds (macOS compatible)
get_process_age_seconds() {
    local pid="$1"
    # macOS ps etime format: [[dd-]hh:]mm:ss
    local etime
    etime=$(ps -o etime= -p "$pid" 2>/dev/null | xargs) || return 1
    [ -z "$etime" ] && return 1

    local days=0 hours=0 minutes=0 seconds=0
    # Remove leading/trailing whitespace
    etime="${etime// /}"

    if [[ "$etime" == *-* ]]; then
        days="${etime%%-*}"
        etime="${etime#*-}"
    fi

    # Split by ':'
    IFS=':' read -ra parts <<< "$etime"
    local n=${#parts[@]}
    if [ "$n" -eq 3 ]; then
        hours=$((10#${parts[0]}))
        minutes=$((10#${parts[1]}))
        seconds=$((10#${parts[2]}))
    elif [ "$n" -eq 2 ]; then
        minutes=$((10#${parts[0]}))
        seconds=$((10#${parts[1]}))
    elif [ "$n" -eq 1 ]; then
        seconds=$((10#${parts[0]}))
    fi

    echo $(( days*86400 + hours*3600 + minutes*60 + seconds ))
}

stop_service() {
    local name="$1"       # "webserver" or "worker"
    local script="$2"     # "webserver.py" or "worker.py"
    local port="$3"

    # Strategy: find by process name first, then by port as fallback
    local pids
    pids=$(find_pids "$script")

    # Also check who's listening on the port
    local port_pids
    port_pids=$(find_pid_on_port "$port")

    # Merge and deduplicate
    local all_pids
    all_pids=$(echo -e "${pids}\n${port_pids}" | sort -u | grep -v '^$' || true)

    if [ -n "$all_pids" ]; then
        echo "Stopping ${name} (pids: $(echo $all_pids | tr '\n' ' '))..."
        echo "$all_pids" | xargs kill 2>/dev/null || true
        sleep 0.5

        # Force kill if still running
        local remaining
        remaining=$(echo "$all_pids" | while read -r p; do
            kill -0 "$p" 2>/dev/null && echo "$p"
        done || true)
        if [ -n "$remaining" ]; then
            echo "Force killing remaining: $remaining"
            echo "$remaining" | xargs kill -9 2>/dev/null || true
            sleep 0.3
        fi

        # Final verification: is the port free now?
        local still_on_port
        still_on_port=$(find_pid_on_port "$port")
        if [ -n "$still_on_port" ]; then
            echo "❌ ERROR: Port ${port} still occupied by pid ${still_on_port} after kill!"
            echo "   Command: $(ps -o command= -p $still_on_port 2>/dev/null || echo 'unknown')"
            echo "   You may need to manually kill it: kill -9 ${still_on_port}"
            return 1
        fi
        echo "${name} stopped."
    else
        echo "${name} not running."
    fi
}

stop_webserver() {
    stop_service "Webserver" "webserver.py" "$WEBSERVER_PORT"
}

stop_worker() {
    stop_service "Worker" "worker.py" "$WORKER_PORT"
}

# Health check with process age verification
# Ensures the healthy endpoint is served by a NEWLY started process, not a stale one.
verify_health() {
    local name="$1"
    local port="$2"
    local health_path="$3"
    local max_wait=12
    local waited=0

    while [ "$waited" -lt "$max_wait" ]; do
        if curl -s "http://127.0.0.1:${port}${health_path}" >/dev/null 2>&1; then
            # Health endpoint responded — now verify it's a NEW process
            local pid_on_port
            pid_on_port=$(find_pid_on_port "$port")
            if [ -n "$pid_on_port" ]; then
                # Check each PID's age (there might be multiple from lsof)
                local first_pid
                first_pid=$(echo "$pid_on_port" | head -1)
                local age
                age=$(get_process_age_seconds "$first_pid" 2>/dev/null || echo "unknown")

                if [ "$age" = "unknown" ]; then
                    echo "✅ ${name} healthy at port ${port} (pid: ${first_pid}, age: unknown)"
                    return 0
                elif [ "$age" -le "$NEW_PROCESS_MAX_AGE" ]; then
                    echo "✅ ${name} healthy at port ${port} (pid: ${first_pid}, age: ${age}s)"
                    return 0
                else
                    echo "❌ ERROR: Port ${port} responds but process is OLD (pid: ${first_pid}, age: ${age}s)"
                    echo "   This means the new process failed to start (port already occupied by stale process)."
                    echo "   Run '$0 stop' first, then retry."
                    return 1
                fi
            fi
            # No PID found on port but curl succeeded? Unlikely, but accept it
            echo "✅ ${name} healthy at port ${port}"
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done

    echo "⚠️  ${name} started but health check failed after ${max_wait}s"
    return 1
}

start_webserver() {
    echo "Starting webserver on port ${WEBSERVER_PORT}..."
    cd "$SCRIPT_DIR"
    $PYTHON webserver.py --port "$WEBSERVER_PORT" --worker-url "$WORKER_URL" --daemonize
    sleep 0.5
    verify_health "Webserver" "$WEBSERVER_PORT" "/api/health"
}

start_worker() {
    echo "Starting worker on port ${WORKER_PORT}..."
    cd "$SCRIPT_DIR"
    $PYTHON worker.py --port "$WORKER_PORT" --daemonize
    sleep 0.5
    verify_health "Worker" "$WORKER_PORT" "/health"
}

show_status() {
    echo "=== nanobot Web Chat Services ==="

    for entry in "Webserver:webserver.py:${WEBSERVER_PORT}" "Worker:worker.py:${WORKER_PORT}"; do
        IFS=':' read -r name script port <<< "$entry"
        local pids port_pid age_info=""

        pids=$(find_pids "$script")
        port_pid=$(find_pid_on_port "$port")

        # Merge
        local all_pids
        all_pids=$(echo -e "${pids}\n${port_pid}" | sort -u | grep -v '^$' || true)

        if [ -n "$all_pids" ]; then
            local first_pid
            first_pid=$(echo "$all_pids" | head -1)
            local age
            age=$(get_process_age_seconds "$first_pid" 2>/dev/null || echo "?")
            local cmd
            cmd=$(ps -o command= -p "$first_pid" 2>/dev/null | head -c 80 || echo "?")
            echo "${name}: ✅ running (pid: $(echo $all_pids | tr '\n' ' '), port: ${port}, age: ${age}s)"
            echo "         cmd: ${cmd}"
        else
            echo "${name}: ❌ stopped"
        fi
    done
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
