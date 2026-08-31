# apps/reports/urls.py
"""
Report URLs configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DailyReportViewSet, DeviceStatisticsViewSet,
    EnvironmentalDataViewSet
)

# 创建路由器
router = DefaultRouter()

# 注册视图集
router.register(r'daily-reports', DailyReportViewSet, basename='daily-report')
router.register(r'device-statistics', DeviceStatisticsViewSet, basename='device-statistics')
router.register(r'environmental', EnvironmentalDataViewSet, basename='environmental-data')

# URL 模式
urlpatterns = [
    path('', include(router.urls)),
]