#!/usr/bin/env bash
# 林智 SmartForest — 一键启动本地开发所需服务（Linux / macOS）
# 用法:
#   ./scripts/start-all.sh
#   ./scripts/start-all.sh --no-iot --no-frontend
#   ./scripts/start-all.sh --infra-only
#   ./scripts/start-all.sh --with-simulator
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
LOG_DIR="$ROOT/.run-logs"
mkdir -p "$LOG_DIR"

DO_DOCKER=1
DO_IOT=1
DO_FRONTEND=1
DO_APPS=1
DO_SIM=0
DO_MIGRATE=1

usage() {
  cat <<'EOF'
SmartForest start-all options:
  --skip-docker      不启动 Docker 中间件
  --no-iot           不启动 MQTT / Kafka 管道
  --no-frontend      不启动 Next.js
  --infra-only       仅启动 Docker 中间件
  --with-simulator   额外启动 MQTT 设备模拟器
  --skip-migrate     跳过 migrate
  -h, --help         显示帮助
EOF
}

for arg in "$@"; do
  case "$arg" in
    --skip-docker) DO_DOCKER=0 ;;
    --no-iot) DO_IOT=0 ;;
    --no-frontend) DO_FRONTEND=0 ;;
    --infra-only) DO_APPS=0; DO_IOT=0; DO_FRONTEND=0 ;;
    --with-simulator) DO_SIM=1 ;;
    --skip-migrate) DO_MIGRATE=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

PY=python3
if [[ -x "$BACKEND/venv/bin/python" ]]; then
  PY="$BACKEND/venv/bin/python"
elif command -v python >/dev/null 2>&1; then
  PY=python
fi

echo "============================================================"
echo " 林智 SmartForest 一键启动"
echo " ROOT=$ROOT"
echo "============================================================"

if [[ ! -f "$BACKEND/.env" && -f "$BACKEND/.env.example" ]]; then
  echo "[INFO] 复制 backend/.env.example -> backend/.env"
  cp "$BACKEND/.env.example" "$BACKEND/.env"
fi

wait_port() {
  local host="$1" port="$2" max="${3:-60}" n=0
  while (( n < max )); do
    if command -v nc >/dev/null 2>&1 && nc -z "$host" "$port" >/dev/null 2>&1; then
      echo "      OK ${host}:${port}"
      return 0
    fi
    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      echo "      OK ${host}:${port}"
      return 0
    fi
    n=$((n + 1))
    sleep 1
  done
  echo "      [WARN] 等待 ${host}:${port} 超时，继续启动..."
}

start_named() {
  local name="$1"
  local workdir="$2"
  shift 2
  local log="$LOG_DIR/${name}.log"
  local pidfile="$LOG_DIR/${name}.pid"
  if [[ -f "$pidfile" ]]; then
    local old
    old="$(cat "$pidfile" || true)"
    if [[ -n "${old:-}" ]] && kill -0 "$old" 2>/dev/null; then
      echo "[INFO] $name 已在运行 (pid=$old)，跳过"
      return 0
    fi
  fi
  echo "[INFO] start $name -> $log"
  (
    cd "$workdir"
    nohup "$@" >"$log" 2>&1 &
    echo $! >"$pidfile"
  )
}

if [[ "$DO_DOCKER" == "1" ]]; then
  echo "[1/5] 启动 Docker 中间件..."
  if command -v docker >/dev/null 2>&1; then
    pushd "$BACKEND" >/dev/null
    if docker compose version >/dev/null 2>&1; then
      docker compose up -d postgres redis emqx tdengine minio rabbitmq zookeeper kafka
    else
      docker-compose up -d postgres redis emqx tdengine minio rabbitmq zookeeper kafka
    fi
    popd >/dev/null
    wait_port 127.0.0.1 5432 60
    wait_port 127.0.0.1 6379 40
  else
    echo "[WARN] 未找到 docker，跳过中间件"
  fi
else
  echo "[1/5] 跳过 Docker"
fi

if [[ "$DO_APPS" == "0" ]]; then
  echo "[DONE] 仅中间件模式完成。"
  exit 0
fi

if [[ "$DO_MIGRATE" == "1" ]]; then
  echo "[2/5] migrate..."
  (cd "$BACKEND" && "$PY" manage.py migrate --noinput) || echo "[WARN] migrate 失败"
else
  echo "[2/5] 跳过 migrate"
fi

echo "[3/5] Django / Celery..."
start_named django "$BACKEND" "$PY" manage.py runserver 127.0.0.1:8000
sleep 1
start_named celery "$BACKEND" "$PY" -m celery -A config worker -l info -Q telemetry,alerts,default

if [[ "$DO_IOT" == "1" ]]; then
  echo "[4/5] IoT 管道..."
  sleep 2
  (cd "$BACKEND" && "$PY" manage.py ensure_kafka_topics) || echo "[WARN] Kafka topics 未就绪"
  start_named mqtt-bridge "$BACKEND" "$PY" manage.py mqtt_client
  start_named kafka-consumer "$BACKEND" "$PY" manage.py consume_kafka
  if [[ "$DO_SIM" == "1" ]]; then
    start_named mqtt-simulator "$BACKEND" "$PY" manage.py simulate_mqtt_devices
  fi
else
  echo "[4/5] 跳过 IoT"
fi

if [[ "$DO_FRONTEND" == "1" ]]; then
  echo "[5/5] 前端..."
  if command -v pnpm >/dev/null 2>&1; then
    [[ -d "$ROOT/node_modules" ]] || (cd "$ROOT" && pnpm install)
    start_named frontend "$ROOT" pnpm dev
  else
    echo "[WARN] 未找到 pnpm，跳过前端"
  fi
else
  echo "[5/5] 跳过前端"
fi

cat <<EOF

============================================================
 启动完成。日志与 PID: $LOG_DIR
------------------------------------------------------------
 前端:     http://127.0.0.1:5000
 后端 API: http://127.0.0.1:8000
 Swagger:  http://127.0.0.1:8000/api/docs/
------------------------------------------------------------
 停止: ./scripts/stop-all.sh
============================================================
EOF
