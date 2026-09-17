from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
    label = 'forest_core'
    verbose_name = 'Core (MQTT/Kafka/MinIO/InfluxDB)'
