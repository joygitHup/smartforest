# apps/alerts/urls.py
"""
Alert URLs configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AlertViewSet,
    AlertActionViewSet,
    FireTracingViewSet,
    AlertRuleViewSet,
    AlertReinforcementViewSet,
    WorkOrderViewSet,
)

router = DefaultRouter()
router.register(r'alerts', AlertViewSet, basename='alert')
router.register(r'actions', AlertActionViewSet, basename='alert-action')
router.register(r'fire-tracing', FireTracingViewSet, basename='fire-tracing')
router.register(r'rules', AlertRuleViewSet, basename='alert-rule')
router.register(r'reinforcements', AlertReinforcementViewSet, basename='alert-reinforcement')
router.register(r'work-orders', WorkOrderViewSet, basename='work-order')


urlpatterns = [
    path('', include(router.urls)),
]
