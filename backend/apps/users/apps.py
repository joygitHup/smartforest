# apps/users/apps.py
"""
User app configuration.
"""
from django.apps import AppConfig


class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.users'
    verbose_name = '用户管理'

    def ready(self):
        """应用加载完成时的初始化"""
        try:
            import apps.users.signals
        except ImportError:
            pass