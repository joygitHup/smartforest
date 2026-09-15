@echo off
REM Kafka consumer → Celery dispatch
cd /d %~dp0\..
python manage.py consume_kafka
