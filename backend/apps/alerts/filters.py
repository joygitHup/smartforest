"""
Alert filters for API.
"""
from django_filters import rest_framework as filters
from .models import Alert


class AlertFilter(filters.FilterSet):
    """告警过滤器"""
    alert_type = filters.CharFilter(field_name='alert_type')
    alert_level = filters.CharFilter(field_name='alert_level')
    status = filters.CharFilter(field_name='status')
    region = filters.CharFilter(field_name='region', lookup_expr='icontains')
    forest_zone = filters.CharFilter(field_name='forest_zone', lookup_expr='icontains')
    is_unresolved = filters.BooleanFilter(method='filter_is_unresolved')
    is_fire = filters.BooleanFilter(method='filter_is_fire')
    min_confidence = filters.NumberFilter(field_name='ai_confidence', lookup_expr='gte')
    occurred_after = filters.DateTimeFilter(field_name='occurred_at', lookup_expr='gte')
    occurred_before = filters.DateTimeFilter(field_name='occurred_at', lookup_expr='lte')
    
    class Meta:
        model = Alert
        fields = ['alert_type', 'alert_level', 'status', 'region', 'forest_zone']
    
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
