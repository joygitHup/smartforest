# apps/users/urls.py
"""
User URLs configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, NotificationViewSet

# 创建路由器
router = DefaultRouter()

# 注册视图集
router.register(r'users', UserViewSet, basename='user')
router.register(r'notifications', NotificationViewSet, basename='notification')

# URL 模式
urlpatterns = [
    path('', include(router.urls)),
]