# apps/devices/apps.py
from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)


class DeviceConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.devices'
    verbose_name = '设备管理'

    def ready(self):
        """应用加载完成时的初始化"""
        try:
            import apps.devices.signals
            logger.info('Device signals loaded successfully')
        except ImportError as e:
            logger.warning(f'Device signals not loaded: {e}')