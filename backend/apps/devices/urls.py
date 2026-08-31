# apps/devices/urls.py
"""
Device URLs configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DeviceViewSet, DeviceTelemetryViewSet, DeviceCommandViewSet

# 创建路由器
router = DefaultRouter()

# 注册视图集
router.register(r'devices', DeviceViewSet, basename='device')
router.register(r'telemetry', DeviceTelemetryViewSet, basename='device-telemetry')
router.register(r'commands', DeviceCommandViewSet, basename='device-command')

# URL 模式
urlpatterns = [
    path('', include(router.urls)),
]