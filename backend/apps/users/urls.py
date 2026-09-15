# apps/users/urls.py
"""
User URLs configuration.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, NotificationViewSet
from .org_views import OrganizationViewSet, RoleViewSet
from .forest_zone_views import ForestZoneViewSet
from .duty_views import (
    DutyGroupViewSet,
    DutyShiftSlotViewSet,
    duty_roster_settings,
    duty_roster_current,
    duty_assignments,
)
from .settings_views import organization_settings, platform_settings

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'organizations', OrganizationViewSet, basename='organization')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'forest-zones', ForestZoneViewSet, basename='forest-zone')
router.register(r'duty-groups', DutyGroupViewSet, basename='duty-group')
router.register(r'duty-shifts', DutyShiftSlotViewSet, basename='duty-shift')

urlpatterns = [
    path('platform-settings/', platform_settings, name='platform-settings'),
    path('organization-settings/', organization_settings, name='organization-settings'),
    path('duty-roster/settings/', duty_roster_settings, name='duty-roster-settings'),
    path('duty-roster/current/', duty_roster_current, name='duty-roster-current'),
    path('duty-roster/assignments/', duty_assignments, name='duty-roster-assignments'),
    path('', include(router.urls)),
]
