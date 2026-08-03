"""
Alert URLs configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AlertViewSet, AlertActionViewSet, FireTracingViewSet

router = DefaultRouter()
router.register(r'', AlertViewSet, basename='alert')
router.register(r'actions', AlertActionViewSet, basename='alert-action')
router.register(r'fire-tracing', FireTracingViewSet, basename='fire-tracing')

urlpatterns = [
    path('', include(router.urls)),
]
