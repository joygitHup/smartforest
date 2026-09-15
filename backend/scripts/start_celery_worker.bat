@echo off
REM Start Celery worker (Windows solo pool)
REM Must listen to telemetry/alerts/default (see CELERY_TASK_ROUTES)
cd /d %~dp0\..
python -m celery -A config worker -l info --pool=solo -Q telemetry,alerts,default
