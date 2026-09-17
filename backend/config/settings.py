"""
Django settings for forest_monitor project.
"""
import sys
from pathlib import Path
from decouple import config
import os



# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
# ✅ 将 apps 目录添加到 Python 路径
# APPS_DIR = BASE_DIR / 'apps'
# if str(APPS_DIR) not in sys.path:
#     sys.path.insert(0, str(APPS_DIR))
# print(APPS_DIR)


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-me-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')

# Application definition
INSTALLED_APPS = [
    'daphne',  # ASGI server
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    'channels',
    'django_celery_beat',
    'django_celery_results',
    'drf_spectacular',
    'django_prometheus',
    
    # Local apps
    'core',  # MQTT / Kafka / MinIO / InfluxDB management commands
    'apps.core',
    'apps.devices',
    'apps.alerts',
    'apps.reports',
    'apps.users',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django_prometheus.middleware.PrometheusBeforeMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'django_prometheus.middleware.PrometheusAfterMiddleware',

]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

AUTH_USER_MODEL = 'users.User'

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DATABASE_NAME', default='forest_monitor'),
        'USER': config('DATABASE_USER', default='postgres'),
        'PASSWORD': config('DATABASE_PASSWORD', default='123456'),
        'HOST': config('DATABASE_HOST', default='localhost'),
        'PORT': config('DATABASE_PORT', default='5432'),

    }
}

# InfluxDB 2.x Configuration
INFLUXDB_CONFIG = {
    'URL': config('INFLUXDB_URL', default='http://localhost:8086'),
    'TOKEN': config('INFLUXDB_TOKEN', default='forest-influxdb-super-token-2026'),
    'ORG': config('INFLUXDB_ORG', default='forest'),
    'BUCKET': config('INFLUXDB_BUCKET', default='forest_monitor'),
}

# Cache
REDIS_URL = config('REDIS_URL', default='redis://localhost:6379/0')
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': REDIS_URL,
    }
}


def _redis_major_version(url: str) -> int | None:
    """探测 Redis 主版本；失败返回 None。"""
    try:
        import redis as redis_lib

        info = redis_lib.Redis.from_url(url).info('server')
        version = str(info.get('redis_version') or '0')
        return int(version.split('.')[0])
    except Exception:
        return None


# Channel Layers (WebSocket)
# channels-redis 4.x 需要 Redis >= 5（BZPOPMIN）。本机若仍是 Windows Redis 3.2，回退内存层。
_CHANNEL_REDIS_URL = config('CHANNEL_REDIS_URL', default=REDIS_URL)
_redis_major = _redis_major_version(_CHANNEL_REDIS_URL)
if _redis_major is not None and _redis_major >= 5:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [_CHANNEL_REDIS_URL],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }
    if DEBUG:
        import logging

        logging.getLogger(__name__).warning(
            'Redis %s 不支持 channels-redis（需 >=5，BZPOPMIN）。'
            'WebSocket 已回退 InMemoryChannelLayer。建议：docker run -d -p 6380:6379 redis:7-alpine '
            '并设置 CHANNEL_REDIS_URL=redis://localhost:6380/0',
            f'{_redis_major}.x' if _redis_major is not None else '不可用/过旧',
        )

# Celery Configuration
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://localhost:6379/1')
CELERY_RESULT_BACKEND = 'django-db'
CELERY_CACHE_BACKEND = 'default'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Asia/Shanghai'
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

# 本地运行日志路径（供每日归档到 MinIO）
DJANGO_LOG_FILE = BASE_DIR / 'logs' / 'django.log'
LOG_ARCHIVE_MINIO_PREFIX = config('LOG_ARCHIVE_MINIO_PREFIX', default='log')

# MQTT Configuration
MQTT_CONFIG = {
    'BROKER_HOST': config('MQTT_BROKER_HOST', default='localhost'),
    'BROKER_PORT': config('MQTT_BROKER_PORT', default=1883, cast=int),
    'USERNAME': config('MQTT_USERNAME', default='admin'),
    'PASSWORD': config('MQTT_PASSWORD', default='public'),
    'CLIENT_ID': 'forest_monitor_backend',
    'QOS': 1,
}

# RabbitMQ Configuration
RABBITMQ_URL = config('RABBITMQ_URL', default='amqp://admin:admin@localhost:5672/')

# Kafka Configuration
KAFKA_BOOTSTRAP_SERVERS = config('KAFKA_BOOTSTRAP_SERVERS', default='localhost:9092').split(',')
KAFKA_CONSUMER_GROUP = config('KAFKA_CONSUMER_GROUP', default='forest-monitor-ingest')
KAFKA_AUTO_OFFSET_RESET = config('KAFKA_AUTO_OFFSET_RESET', default='latest')
# True: MQTT → Kafka → Celery；False: MQTT 直接投递 Celery
USE_KAFKA_PIPELINE = config('USE_KAFKA_PIPELINE', default=True, cast=bool)
KAFKA_NUM_PARTITIONS = config('KAFKA_NUM_PARTITIONS', default=6, cast=int)
KAFKA_REPLICATION_FACTOR = config('KAFKA_REPLICATION_FACTOR', default=1, cast=int)
KAFKA_PRODUCER_ACKS = config('KAFKA_PRODUCER_ACKS', default='1')
KAFKA_PRODUCER_LINGER_MS = config('KAFKA_PRODUCER_LINGER_MS', default=50, cast=int)
KAFKA_PRODUCER_BATCH_SIZE = config('KAFKA_PRODUCER_BATCH_SIZE', default=32768, cast=int)
KAFKA_COMPRESSION_TYPE = config('KAFKA_COMPRESSION_TYPE', default='lz4')
KAFKA_SHARED_PRODUCER = config('KAFKA_SHARED_PRODUCER', default=True, cast=bool)
KAFKA_MAX_POLL_RECORDS = config('KAFKA_MAX_POLL_RECORDS', default=100, cast=int)
TELEMETRY_INGEST_MIN_INTERVAL = config('TELEMETRY_INGEST_MIN_INTERVAL', default=1.0, cast=float)
ALERT_RULE_DEDUP_SECONDS = config('ALERT_RULE_DEDUP_SECONDS', default=300, cast=int)

# Celery 任务路由：遥测 / 告警分流（worker 需监听 telemetry,alerts,default）
CELERY_TASK_ROUTES = {
    'apps.devices.tasks.process_device_telemetry': {'queue': 'telemetry'},
    'apps.devices.tasks.flush_influxdb_telemetry_batch': {'queue': 'telemetry'},
    'apps.devices.tasks.update_device_status': {'queue': 'telemetry'},
    'apps.devices.tasks.dispatch_kafka_message': {'queue': 'telemetry'},
    'apps.alerts.tasks.process_alert': {'queue': 'alerts'},
    'apps.alerts.tasks.evaluate_telemetry_rules_task': {'queue': 'alerts'},
    'apps.alerts.tasks.run_fire_tracing': {'queue': 'alerts'},
    'apps.alerts.tasks.send_notification': {'queue': 'alerts'},
}
CELERY_TASK_DEFAULT_QUEUE = 'default'
CELERY_WORKER_PREFETCH_MULTIPLIER = config('CELERY_WORKER_PREFETCH_MULTIPLIER', default=4, cast=int)

# 未知 MQTT device_id 是否自动写入 devices 表（便于本地模拟器接入）
MQTT_AUTO_REGISTER_DEVICES = config('MQTT_AUTO_REGISTER_DEVICES', default=True, cast=bool)

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'zh-hans'
TIME_ZONE = 'Asia/Shanghai'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']

# Media files
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# File Storage (OSS/MinIO)
DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
# MinIO / S3（本地默认 MinIO）
AWS_ACCESS_KEY_ID = config('AWS_ACCESS_KEY_ID', default='minioadmin')
AWS_SECRET_ACCESS_KEY = config('AWS_SECRET_ACCESS_KEY', default='minioadmin')
AWS_STORAGE_BUCKET_NAME = config('AWS_STORAGE_BUCKET_NAME', default='forest-monitor')
AWS_S3_ENDPOINT_URL = config('AWS_S3_ENDPOINT_URL', default='http://127.0.0.1:9000')
AWS_S3_REGION_NAME = config('AWS_S3_REGION_NAME', default='us-east-1')
MINIO_CONSOLE_URL = config('MINIO_CONSOLE_URL', default='http://127.0.0.1:9001')

# Prometheus（Docker 映射一般为 9090；9000/9001 为 MinIO）
PROMETHEUS_URL = config('PROMETHEUS_URL', default='http://127.0.0.1:9090')
DJANGO_METRICS_URL = config('DJANGO_METRICS_URL', default='http://127.0.0.1:8000/metrics')
AWS_DEFAULT_ACL = 'private'
AWS_S3_OBJECT_PARAMETERS = {'CacheControl': 'max-age=86400'}

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# JWT Settings
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    # 未安装 rest_framework_simplejwt.token_blacklist 时不可开启，否则 refresh 会失败
    'BLACKLIST_AFTER_ROTATION': False,
}

# CORS Settings
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://172.20.128.1:3000',
]
CORS_ALLOW_CREDENTIALS = True
# ✅ 开发环境下允许所有来源（仅用于开发）
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
# DRF Spectacular (API Documentation)
SPECTACULAR_SETTINGS = {
    'TITLE': '林智森林智能监控平台 API',
    'DESCRIPTION': '森林智能监控平台后端 API 文档',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

# Logging Configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'django.log',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}

# Create logs directory
os.makedirs(BASE_DIR / 'logs', exist_ok=True)
# ✅ 确保使用 Django 的 WSGI 处理请求
ASGI_APPLICATION = 'config.asgi.application'
# 同时保留 WSGI
WSGI_APPLICATION = 'config.wsgi.application'
