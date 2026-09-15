@echo off
REM MQTT bridge: Device → EMQX → Kafka (or Celery fallback)
cd /d %~dp0\..
echo Ensuring Kafka topics...
python manage.py ensure_kafka_topics
echo Starting MQTT client bridge...
python manage.py mqtt_client
