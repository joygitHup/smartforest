# apps/alerts/filters.py
"""
Alert filters for API.
"""
from django_filters import rest_framework as filters
from .models import Alert, AlertAction, FireTracing


class AlertFilter(filters.FilterSet):
    """告警过滤器"""
    # 自定义过滤器
    is_unresolved = filters.BooleanFilter(method='filter_is_unresolved')
    is_fire = filters.BooleanFilter(method='filter_is_fire')
    is_high_level = filters.BooleanFilter(method='filter_is_high_level')
    
    # 范围过滤器
    min_confidence = filters.NumberFilter(field_name='ai_confidence', lookup_expr='gte')
    max_confidence = filters.NumberFilter(field_name='ai_confidence', lookup_expr='lte')
    occurred_after = filters.DateTimeFilter(field_name='occurred_at', lookup_expr='gte')
    occurred_before = filters.DateTimeFilter(field_name='occurred_at', lookup_expr='lte')
    
    # 关联设备过滤
    device__device_id = filters.CharFilter(field_name='device__device_id', lookup_expr='icontains')
    device__device_name = filters.CharFilter(field_name='device__device_name', lookup_expr='icontains')
    device__region = filters.CharFilter(field_name='device__region', lookup_expr='icontains')
    
    class Meta:
        model = Alert
        fields = {
            'alert_type': ['exact'],
            'alert_level': ['exact'],
            'status': ['exact'],
            'region': ['exact', 'icontains'],
            'forest_zone': ['exact', 'icontains'],
            'ai_confidence': ['gte', 'lte'],
            'occurred_at': ['gte', 'lte'],
        }
    
    def filter_is_unresolved(self, queryset, name, value):
        """过滤未处置告警"""
        if value:
            return queryset.exclude(status__in=['resolved', 'false_alarm'])
        return queryset.filter(status__in=['resolved', 'false_alarm'])
    
    def filter_is_fire(self, queryset, name, value):
        """过滤火情告警"""
        if value:
            return queryset.filter(alert_type__in=['fire', 'smoke'])
        return queryset.exclude(alert_type__in=['fire', 'smoke'])
    
    def filter_is_high_level(self, queryset, name, value):
        """过滤高级别告警（一级和二级）"""
        if value:
            return queryset.filter(alert_level__in=['level_1', 'level_2'])
        return queryset.exclude(alert_level__in=['level_1', 'level_2'])


class AlertActionFilter(filters.FilterSet):
    """告警处置记录过滤器"""
    alert__alert_id = filters.CharFilter(field_name='alert__alert_id', lookup_expr='icontains')
    action_type = filters.CharFilter(field_name='action_type')
    operator = filters.CharFilter(field_name='operator', lookup_expr='icontains')
    created_after = filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    
    class Meta:
        model = AlertAction
        fields = ['alert', 'action_type', 'operator']


class FireTracingFilter(filters.FilterSet):
    """火情溯源过滤器"""
    alert__alert_id = filters.CharFilter(field_name='alert__alert_id', lookup_expr='icontains')
    algorithm = filters.CharFilter(field_name='algorithm')
    origin_confidence__gte = filters.NumberFilter(field_name='origin_confidence', lookup_expr='gte')
    origin_confidence__lte = filters.NumberFilter(field_name='origin_confidence', lookup_expr='lte')
    created_after = filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    
    class Meta:
        model = FireTracing
        fields = ['alert', 'algorithm']