# apps/users/filters.py
"""
User filters for API.
"""
from django_filters import rest_framework as filters
from django.contrib.auth import get_user_model
from .models import Notification, Organization, Role, ForestZone

User = get_user_model()


class UserFilter(filters.FilterSet):
    organization = filters.NumberFilter(field_name='organization_id')
    role_ref = filters.NumberFilter(field_name='role_ref_id')

    class Meta:
        model = User
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


class OrganizationFilter(filters.FilterSet):
    name = filters.CharFilter(field_name='name', lookup_expr='icontains')
    code = filters.CharFilter(field_name='code', lookup_expr='icontains')
    region = filters.CharFilter(field_name='region', lookup_expr='icontains')
    org_type = filters.CharFilter(field_name='org_type')
    is_active = filters.BooleanFilter(field_name='is_active')
    parent = filters.NumberFilter(field_name='parent_id')

    class Meta:
        model = Organization
        fields = ['org_type', 'is_active', 'parent']


class ForestZoneFilter(filters.FilterSet):
    name = filters.CharFilter(field_name='name', lookup_expr='icontains')
    code = filters.CharFilter(field_name='code', lookup_expr='icontains')
    region = filters.CharFilter(field_name='region', lookup_expr='icontains')
    organization = filters.NumberFilter(field_name='organization_id')
    is_active = filters.BooleanFilter(field_name='is_active')

    class Meta:
        model = ForestZone
        fields = ['organization', 'is_active', 'region']


class RoleFilter(filters.FilterSet):
    name = filters.CharFilter(field_name='name', lookup_expr='icontains')
    code = filters.CharFilter(field_name='code', lookup_expr='icontains')
    is_enabled = filters.BooleanFilter(field_name='is_enabled')
    is_system = filters.BooleanFilter(field_name='is_system')

    class Meta:
        model = Role
        fields = ['is_enabled', 'is_system']


class NotificationFilter(filters.FilterSet):
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
