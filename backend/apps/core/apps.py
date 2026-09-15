from django.apps import AppConfig


class AppsCoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'
    label = 'apps_core'
    verbose_name = 'Shared Core Utilities'
