"""
WebSocket routing configuration.
"""
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/dashboard/$', consumers.DashboardConsumer.as_asgi()),
    re_path(r'ws/device/(?P<device_id>[^/]+)/$', consumers.DeviceCommandConsumer.as_asgi()),
]
