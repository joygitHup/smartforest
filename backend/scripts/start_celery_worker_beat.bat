@echo off
cd /d d:\pythonDev\smartforest\backend
start "smartforest-celery" /D "d:\pythonDev\smartforest\backend" cmd /k "python -m celery -A config worker -l info --pool=solo -Q telemetry,alerts,default"
start "smartforest-celery-beat" /D "d:\pythonDev\smartforest\backend" cmd /k "python -m celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler"
echo started worker + beat
