"""
URL configuration for forest_monitor project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView

from core.dashboard_views import DashboardOverviewView, DashboardRegionsView
from core.pipeline_views import PipelineHealthView, PipelineKafkaPublishView
from core.ops_views import OpsOverviewView, OpsMetricsQueryView, OpsDiagnosticsView

urlpatterns = [
    path('admin/', admin.site.urls),

    # API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # JWT Authentication
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/token/verify/', TokenVerifyView.as_view(), name='token_verify'),

    # 指挥中心
    path('api/dashboard/overview/', DashboardOverviewView.as_view(), name='dashboard-overview'),
    path('api/dashboard/regions/', DashboardRegionsView.as_view(), name='dashboard-regions'),

    # IoT / Kafka 管线
    path('api/pipeline/health/', PipelineHealthView.as_view(), name='pipeline-health'),
    path('api/pipeline/kafka/publish/', PipelineKafkaPublishView.as_view(), name='pipeline-kafka-publish'),

    # 系统运维
    path('api/ops/overview/', OpsOverviewView.as_view(), name='ops-overview'),
    path('api/ops/metrics/query/', OpsMetricsQueryView.as_view(), name='ops-metrics-query'),
    path('api/ops/diagnostics/', OpsDiagnosticsView.as_view(), name='ops-diagnostics'),

    # API Endpoints
    path('api/alerts/', include('apps.alerts.urls')),
    path('api/devices/', include('apps.devices.urls')),
    path('api/reports/', include('apps.reports.urls')),
    path('api/users/', include('apps.users.urls')),

    # Prometheus Metrics（django_prometheus 自带 path: metrics → /metrics）
    path('', include('django_prometheus.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
