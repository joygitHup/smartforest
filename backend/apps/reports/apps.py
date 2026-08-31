# apps/reports/apps.py
from django.apps import AppConfig


class ReportsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.reports'
    verbose_name = '报表管理'

    def ready(self):
        """应用加载完成时的初始化"""
        try:
            import apps.reports.signals
        except ImportError:
            pass