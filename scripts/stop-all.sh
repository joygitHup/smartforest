#!/usr/bin/env bash
# 停止 start-all.sh 拉起的本地进程；可选停止 Docker 中间件
# 用法: ./scripts/stop-all.sh [--with-docker]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
LOG_DIR="$ROOT/.run-logs"
STOP_DOCKER=0

if [[ "${1:-}" == "--with-docker" || "${1:-}" == "--docker" ]]; then
  STOP_DOCKER=1
fi

stop_named() {
  local name="$1"
  local pidfile="$LOG_DIR/${name}.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile" || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "停止 $name (pid=$pid)"
      kill "$pid" 2>/dev/null || true
      sleep 0.5
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

echo "停止本地应用进程..."
stop_named django
stop_named celery
stop_named mqtt-bridge
stop_named kafka-consumer
stop_named mqtt-simulator
stop_named frontend

if [[ "$STOP_DOCKER" == "1" ]]; then
  echo "停止 Docker 中间件..."
  if command -v docker >/dev/null 2>&1; then
    pushd "$BACKEND" >/dev/null
    if docker compose version >/dev/null 2>&1; then
      docker compose stop postgres redis emqx influxdb minio rabbitmq zookeeper kafka || true
    else
      docker-compose stop postgres redis emqx influxdb minio rabbitmq zookeeper kafka || true
    fi
    popd >/dev/null
  fi
else
  echo "Docker 中间件保持运行（加 --with-docker 可一并停止）"
fi

echo "[DONE]"
