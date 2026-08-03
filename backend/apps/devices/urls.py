"""
Device URLs configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DeviceViewSet, DeviceTelemetryViewSet, DeviceCommandViewSet

router = DefaultRouter()
router.register(r'', DeviceViewSet, basename='device')
router.register(r'telemetry', DeviceTelemetryViewSet, basename='device-telemetry')
router.register(r'commands', DeviceCommandViewSet, basename='device-command')

urlpatterns = [
    path('', include(router.urls)),
]
