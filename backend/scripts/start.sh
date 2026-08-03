#!/bin/bash
set -e

echo "Starting Forest Monitor Backend..."

# 初始化数据库
bash scripts/init_db.sh

# 启动 MQTT 客户端
echo "Starting MQTT client..."
python manage.py mqtt_client &

# 启动 Daphne (ASGI server)
echo "Starting Daphne..."
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
