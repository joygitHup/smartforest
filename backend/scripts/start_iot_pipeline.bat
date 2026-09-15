@echo off
REM IoT pipeline helpers:
REM   1) ensure topics
REM   2) smoke publish (optional)
REM Start mqtt bridge + kafka consumer in separate windows.
cd /d %~dp0\..

echo === Ensuring Kafka topics ===
python manage.py ensure_kafka_topics
if errorlevel 1 (
  echo [ERROR] Cannot reach Kafka. Is broker running on localhost:9092?
  pause
  exit /b 1
)

echo === Kafka health / smoke publish ===
python manage.py kafka_smoke
if errorlevel 1 (
  echo [WARN] Smoke publish failed
)

echo.
echo Starting MQTT bridge window...
start "smartforest-mqtt-bridge" cmd /k "cd /d %~dp0\.. && python manage.py mqtt_client"

echo Starting Kafka consumer window...
start "smartforest-kafka-consumer" cmd /k "cd /d %~dp0\.. && python manage.py consume_kafka"

echo.
echo Pipeline windows started.
echo   MQTT bridge: Device -^> EMQX -^> Kafka
echo   Kafka consumer: Kafka -^> Celery -^> DB
echo Make sure Celery worker is also running: scripts\start_celery_worker.bat
echo.
pause
