# apps/alerts/filters.py
"""
Alert filters for API.
"""
from django.db.models import Q
from django_filters import rest_framework as filters
from .models import Alert, AlertAction, FireTracing, AlertRule, AlertReinforcement, WorkOrder


class AlertFilter(filters.FilterSet):
    """?????"""
    is_unresolved = filters.BooleanFilter(method='filter_is_unresolved')
    is_fire = filters.BooleanFilter(method='filter_is_fire')
    is_high_level = filters.BooleanFilter(method='filter_is_high_level')

    min_confidence = filters.NumberFilter(field_name='ai_confidence', lookup_expr='gte')
    max_confidence = filters.NumberFilter(field_name='ai_confidence', lookup_expr='lte')
    occurred_after = filters.DateTimeFilter(field_name='occurred_at', lookup_expr='gte')
    occurred_before = filters.DateTimeFilter(field_name='occurred_at', lookup_expr='lte')

    device__device_id = filters.CharFilter(field_name='device__device_id', lookup_expr='icontains')
    device__device_name = filters.CharFilter(field_name='device__device_name', lookup_expr='icontains')
    device__region = filters.CharFilter(field_name='device__region', lookup_expr='icontains')
    # 林区 / 片区可同时传入，二者 AND
    region = filters.CharFilter(method='filter_area_region')
    forest_zone = filters.CharFilter(method='filter_forest_zone_name')

    class Meta:
        model = Alert
        fields = {
            'alert_type': ['exact'],
            'alert_level': ['exact'],
            'status': ['exact'],
            'ai_confidence': ['gte', 'lte'],
            'occurred_at': ['gte', 'lte'],
        }

    def filter_forest_zone_name(self, queryset, name, value):
        zone = (value or '').strip()
        if not zone:
            return queryset
        return queryset.filter(
            Q(forest_zone__icontains=zone)
            | Q(forest_zone_ref__name__icontains=zone)
            | Q(device__forest_zone__icontains=zone)
            | Q(device__forest_zone_ref__name__icontains=zone)
        )

    def filter_area_region(self, queryset, name, value):
        area = (value or '').strip()
        if not area:
            return queryset
        return queryset.filter(
            Q(region__icontains=area) | Q(device__region__icontains=area)
        )

    def filter_zone_or_region(self, queryset, name, value):
        zone = (value or '').strip()
        if not zone:
            return queryset
        return queryset.filter(
            Q(forest_zone__icontains=zone)
            | Q(forest_zone_ref__name__icontains=zone)
            | Q(region__icontains=zone)
            | Q(device__forest_zone__icontains=zone)
            | Q(device__forest_zone_ref__name__icontains=zone)
            | Q(device__region__icontains=zone)
        )

    def filter_is_unresolved(self, queryset, name, value):
        if value:
            return queryset.exclude(status__in=['resolved', 'false_alarm'])
        return queryset.filter(status__in=['resolved', 'false_alarm'])

    def filter_is_fire(self, queryset, name, value):
        if value:
            return queryset.filter(alert_type__in=['fire', 'smoke'])
        return queryset.exclude(alert_type__in=['fire', 'smoke'])

    def filter_is_high_level(self, queryset, name, value):
        if value:
            return queryset.filter(alert_level__in=['level_1', 'level_2'])
        return queryset.exclude(alert_level__in=['level_1', 'level_2'])


class AlertActionFilter(filters.FilterSet):
    """?????????"""
    alert__alert_id = filters.CharFilter(field_name='alert__alert_id', lookup_expr='icontains')
    action_type = filters.CharFilter(field_name='action_type')
    operator = filters.CharFilter(field_name='operator', lookup_expr='icontains')
    created_after = filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = AlertAction
        fields = ['alert', 'action_type', 'operator']


class FireTracingFilter(filters.FilterSet):
    """??????"""
    alert__alert_id = filters.CharFilter(field_name='alert__alert_id', lookup_expr='icontains')
    algorithm = filters.CharFilter(field_name='algorithm')
    alert_level = filters.CharFilter(field_name='alert__alert_level')
    alert_status = filters.CharFilter(field_name='alert__status')
    alert_type = filters.CharFilter(field_name='alert__alert_type')
    region = filters.CharFilter(method='filter_area_region')
    forest_zone = filters.CharFilter(method='filter_forest_zone_name')
    origin_confidence__gte = filters.NumberFilter(field_name='origin_confidence', lookup_expr='gte')
    origin_confidence__lte = filters.NumberFilter(field_name='origin_confidence', lookup_expr='lte')
    created_after = filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = FireTracing
        fields = ['alert', 'algorithm', 'alert_level', 'alert_status', 'alert_type']

    def filter_forest_zone_name(self, queryset, name, value):
        zone = (value or '').strip()
        if not zone:
            return queryset
        return queryset.filter(
            Q(alert__forest_zone__icontains=zone)
            | Q(alert__forest_zone_ref__name__icontains=zone)
            | Q(alert__device__forest_zone__icontains=zone)
            | Q(alert__device__forest_zone_ref__name__icontains=zone)
        )

    def filter_area_region(self, queryset, name, value):
        area = (value or '').strip()
        if not area:
            return queryset
        return queryset.filter(
            Q(alert__region__icontains=area) | Q(alert__device__region__icontains=area)
        )

    def filter_zone_or_region(self, queryset, name, value):
        zone = (value or '').strip()
        if not zone:
            return queryset
        return queryset.filter(
            Q(alert__forest_zone__icontains=zone)
            | Q(alert__forest_zone_ref__name__icontains=zone)
            | Q(alert__region__icontains=zone)
            | Q(alert__device__forest_zone__icontains=zone)
            | Q(alert__device__forest_zone_ref__name__icontains=zone)
            | Q(alert__device__region__icontains=zone)
        )


class AlertRuleFilter(filters.FilterSet):
    """????????????????"""
    name = filters.CharFilter(field_name='name', lookup_expr='icontains')
    alert_type = filters.CharFilter(field_name='alert_type')
    alert_level = filters.CharFilter(field_name='alert_level')
    is_enabled = filters.BooleanFilter(field_name='is_enabled')
    is_system = filters.BooleanFilter(field_name='is_system')
    region = filters.CharFilter(field_name='region', lookup_expr='icontains')
    forest_zone = filters.CharFilter(method='filter_forest_zone')
    apply_scope = filters.CharFilter(field_name='apply_scope')
    device_type = filters.CharFilter(field_name='device_type')

    class Meta:
        model = AlertRule
        fields = ['alert_type', 'alert_level', 'is_enabled', 'is_system', 'apply_scope', 'device_type']

    def filter_forest_zone(self, queryset, name, value):
        """??????????????????/???????????"""
        zone = (value or '').strip()
        if not zone:
            return queryset
        return queryset.filter(
            Q(apply_scope='global')
            | Q(forest_zone_ref__name=zone)
            | Q(region=zone)
            | Q(
                apply_scope='device_type',
                region='',
                forest_zone_ref__isnull=True,
            )
        )


class AlertReinforcementFilter(filters.FilterSet):
    """????"""
    alert = filters.NumberFilter(field_name='alert')
    status = filters.CharFilter(field_name='status')
    requester = filters.CharFilter(field_name='requester', lookup_expr='icontains')
    alert__alert_id = filters.CharFilter(field_name='alert__alert_id', lookup_expr='icontains')

    class Meta:
        model = AlertReinforcement
        fields = ['alert', 'status', 'requester']


class WorkOrderFilter(filters.FilterSet):
    """????"""
    status = filters.CharFilter(field_name='status')
    priority = filters.CharFilter(field_name='priority')
    assignee = filters.NumberFilter(field_name='assignee')
    assignee_name = filters.CharFilter(field_name='assignee_name', lookup_expr='icontains')
    alert = filters.NumberFilter(field_name='alert')
    alert__alert_id = filters.CharFilter(field_name='alert__alert_id', lookup_expr='icontains')
    region = filters.CharFilter(field_name='region', lookup_expr='icontains')
    forest_zone = filters.CharFilter(field_name='forest_zone', lookup_expr='icontains')
    created_after = filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    mine = filters.BooleanFilter(method='filter_mine')
    is_open = filters.BooleanFilter(method='filter_is_open')

    class Meta:
        model = WorkOrder
        fields = ['status', 'priority', 'assignee', 'alert']

    def filter_mine(self, queryset, name, value):
        request = getattr(self, 'request', None)
        user = getattr(request, 'user', None) if request else None
        if value and user and user.is_authenticated:
            return queryset.filter(assignee=user)
        return queryset

    def filter_is_open(self, queryset, name, value):
        open_statuses = ['pending', 'accepted', 'in_progress']
        if value:
            return queryset.filter(status__in=open_statuses)
        return queryset.exclude(status__in=open_statuses)
