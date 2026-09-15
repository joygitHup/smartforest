@echo off
REM MQTT device simulator → EMQX → (mqtt_client) → Kafka → Celery → DB
cd /d %~dp0\..

echo Registering simulator devices and starting publisher...
echo Make sure these are running:
echo   1) EMQX (localhost:1883)
echo   2) python manage.py mqtt_client
echo   3) python manage.py consume_kafka
echo   4) Celery worker
echo.

python manage.py simulate_mqtt_devices --interval 5 %*
