"""
Celery configuration for forest_monitor project.
"""
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('forest_monitor')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks(['apps.devices', 'apps.alerts', 'apps.reports','apps.users'])


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task for testing Celery."""
    print(f'Request: {self.request!r}')
