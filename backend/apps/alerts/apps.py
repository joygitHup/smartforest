# apps/alerts/apps.py
from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)


class AlertsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.alerts'
    verbose_name = '告警管理'

    def ready(self):
        try:
            import apps.alerts.signals
        except ImportError:
            pass