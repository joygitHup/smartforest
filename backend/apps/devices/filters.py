# apps/devices/filters.py
"""
Device filters for API.
"""
from django_filters import rest_framework as filters
from .models import Device, DeviceTelemetry, DeviceCommand


class DeviceFilter(filters.FilterSet):
    """设备过滤器"""
    # 精确匹配
    device_type = filters.CharFilter(field_name='device_type')
    status = filters.CharFilter(field_name='status')
    communication_type = filters.CharFilter(field_name='communication_type')
    
    # 模糊搜索
    device_name = filters.CharFilter(field_name='device_name', lookup_expr='icontains')
    region = filters.CharFilter(field_name='region', lookup_expr='icontains')
    forest_zone = filters.CharFilter(field_name='forest_zone', lookup_expr='icontains')
    manufacturer = filters.CharFilter(field_name='manufacturer', lookup_expr='icontains')
    
    # 范围过滤
    battery_level_min = filters.NumberFilter(field_name='battery_level', lookup_expr='gte')
    battery_level_max = filters.NumberFilter(field_name='battery_level', lookup_expr='lte')
    signal_strength_min = filters.NumberFilter(field_name='signal_strength', lookup_expr='gte')
    signal_strength_max = filters.NumberFilter(field_name='signal_strength', lookup_expr='lte')
    
    # 日期范围
    install_date_after = filters.DateFilter(field_name='install_date', lookup_expr='gte')
    install_date_before = filters.DateFilter(field_name='install_date', lookup_expr='lte')
    last_online_after = filters.DateTimeFilter(field_name='last_online_time', lookup_expr='gte')
    last_online_before = filters.DateTimeFilter(field_name='last_online_time', lookup_expr='lte')
    
    # 自定义过滤器
    is_online = filters.BooleanFilter(method='filter_is_online')
    is_active = filters.BooleanFilter(method='filter_is_active')
    battery_low = filters.BooleanFilter(method='filter_battery_low')
    has_telemetry = filters.BooleanFilter(method='filter_has_telemetry')
    
    class Meta:
        model = Device
        fields = [
            'device_type', 'status', 'communication_type',
            'region', 'forest_zone',
            'battery_level', 'signal_strength',
        ]
    
    def filter_is_online(self, queryset, name, value):
        """过滤在线/离线设备"""
        if value:
            return queryset.filter(status='online')
        return queryset.exclude(status='online')
    
    def filter_is_active(self, queryset, name, value):
        """过滤活跃设备（5分钟内有心跳）"""
        from django.utils import timezone
        import datetime
        threshold = timezone.now() - datetime.timedelta(minutes=5)
        if value:
            return queryset.filter(last_heartbeat__gte=threshold)
        return queryset.filter(Q(last_heartbeat__lt=threshold) | Q(last_heartbeat__isnull=True))
    
    def filter_battery_low(self, queryset, name, value):
        """过滤低电量设备（< 20%）"""
        if value:
            return queryset.filter(battery_level__lt=20)
        return queryset.exclude(battery_level__lt=20)
    
    def filter_has_telemetry(self, queryset, name, value):
        """过滤是否有遥测数据"""
        if value:
            return queryset.filter(telemetry__isnull=False).distinct()
        return queryset.filter(telemetry__isnull=True)


class DeviceTelemetryFilter(filters.FilterSet):
    """设备遥测数据过滤器"""
    device = filters.NumberFilter(field_name='device')
    device__device_id = filters.CharFilter(field_name='device__device_id', lookup_expr='icontains')
    device__device_name = filters.CharFilter(field_name='device__device_name', lookup_expr='icontains')
    device__device_type = filters.CharFilter(field_name='device__device_type')
    
    # 时间范围
    timestamp_after = filters.DateTimeFilter(field_name='timestamp', lookup_expr='gte')
    timestamp_before = filters.DateTimeFilter(field_name='timestamp', lookup_expr='lte')
    
    # 环境参数范围
    temperature_min = filters.NumberFilter(field_name='temperature', lookup_expr='gte')
    temperature_max = filters.NumberFilter(field_name='temperature', lookup_expr='lte')
    humidity_min = filters.NumberFilter(field_name='humidity', lookup_expr='gte')
    humidity_max = filters.NumberFilter(field_name='humidity', lookup_expr='lte')
    wind_speed_min = filters.NumberFilter(field_name='wind_speed', lookup_expr='gte')
    wind_speed_max = filters.NumberFilter(field_name='wind_speed', lookup_expr='lte')
    
    # 热成像数据
    thermal_max_temp_min = filters.NumberFilter(field_name='thermal_max_temp', lookup_expr='gte')
    thermal_max_temp_max = filters.NumberFilter(field_name='thermal_max_temp', lookup_expr='lte')
    has_hotspot = filters.BooleanFilter(method='filter_has_hotspot')
    
    class Meta:
        model = DeviceTelemetry
        fields = [
            'device', 'video_status',
            'temperature', 'humidity', 'wind_speed',
            'thermal_max_temp',
        ]
    
    def filter_has_hotspot(self, queryset, name, value):
        """过滤是否有热源"""
        if value:
            return queryset.filter(
                thermal_hotspot_x__isnull=False,
                thermal_hotspot_y__isnull=False
            )
        return queryset.filter(
            Q(thermal_hotspot_x__isnull=True) | Q(thermal_hotspot_y__isnull=True)
        )


class DeviceCommandFilter(filters.FilterSet):
    """设备指令过滤器"""
    device = filters.NumberFilter(field_name='device')
    device__device_id = filters.CharFilter(field_name='device__device_id', lookup_expr='icontains')
    command_type = filters.CharFilter(field_name='command_type')
    status = filters.CharFilter(field_name='status')
    
    # 时间范围
    created_after = filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    executed_after = filters.DateTimeFilter(field_name='executed_at', lookup_expr='gte')
    executed_before = filters.DateTimeFilter(field_name='executed_at', lookup_expr='lte')
    
    # 自定义过滤器
    is_pending = filters.BooleanFilter(method='filter_is_pending')
    is_failed = filters.BooleanFilter(method='filter_is_failed')
    
    class Meta:
        model = DeviceCommand
        fields = ['device', 'command_type', 'status']
    
    def filter_is_pending(self, queryset, name, value):
        """过滤待处理指令"""
        if value:
            return queryset.filter(status__in=['pending', 'sent'])
        return queryset.exclude(status__in=['pending', 'sent'])
    
    def filter_is_failed(self, queryset, name, value):
        """过滤失败指令"""
        if value:
            return queryset.filter(status__in=['failed', 'timeout'])
        return queryset.exclude(status__in=['failed', 'timeout'])