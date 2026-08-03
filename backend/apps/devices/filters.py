"""
Device filters for API.
"""
from django_filters import rest_framework as filters
from .models import Device


class DeviceFilter(filters.FilterSet):
    """设备过滤器"""
    device_type = filters.CharFilter(field_name='device_type')
    status = filters.CharFilter(field_name='status')
    region = filters.CharFilter(field_name='region', lookup_expr='icontains')
    forest_zone = filters.CharFilter(field_name='forest_zone', lookup_expr='icontains')
    is_online = filters.BooleanFilter(method='filter_is_online')
    battery_low = filters.BooleanFilter(method='filter_battery_low')
    
    class Meta:
        model = Device
        fields = ['device_type', 'status', 'region', 'forest_zone']
    
    def filter_is_online(self, queryset, name, value):
        """过滤在线/离线设备"""
        if value:
            return queryset.filter(status='online')
        return queryset.exclude(status='online')
    
    def filter_battery_low(self, queryset, name, value):
        """过滤低电量设备"""
        if value:
            return queryset.filter(battery_level__lt=20)
        return queryset.exclude(battery_level__lt=20)
