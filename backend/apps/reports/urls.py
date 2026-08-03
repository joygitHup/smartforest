"""
Report URLs configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DailyReportViewSet, DeviceStatisticsViewSet, EnvironmentalDataViewSet

router = DefaultRouter()
router.register(r'daily', DailyReportViewSet, basename='daily-report')
router.register(r'device-stats', DeviceStatisticsViewSet, basename='device-statistics')
router.register(r'environmental', EnvironmentalDataViewSet, basename='environmental-data')

urlpatterns = [
    path('', include(router.urls)),
]
