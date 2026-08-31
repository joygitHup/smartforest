# apps/users/filters.py
"""
User filters for API.
"""
from django_filters import rest_framework as filters
from django.contrib.auth import get_user_model
from .models import Notification

# ✅ 使用 get_user_model() 获取用户模型
User = get_user_model()


class UserFilter(filters.FilterSet):
    """用户过滤器"""
    class Meta:
        model = User  # ✅ 使用 get_user_model() 获取的 User
        fields = {
            'username': ['icontains'],
            'first_name': ['icontains'],
            'last_name': ['icontains'],
            'email': ['icontains'],
            'phone': ['icontains'],
            'role': ['exact'],
            'department': ['exact', 'icontains'],
            'region': ['exact', 'icontains'],
            'is_active': ['exact'],
            'is_staff': ['exact'],
            'is_superuser': ['exact'],
            'date_joined': ['gte', 'lte'],
            'last_login': ['gte', 'lte'],
        }


class NotificationFilter(filters.FilterSet):
    """通知过滤器"""
    class Meta:
        model = Notification
        fields = {
            'user': ['exact'],
            'notification_type': ['exact'],
            'is_read': ['exact'],
            'alert_id': ['exact', 'icontains'],
            'device_id': ['exact', 'icontains'],
            'created_at': ['gte', 'lte'],
        }