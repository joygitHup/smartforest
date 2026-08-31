# apps/reports/filters.py
"""
Report filters for API.
"""
from django_filters import rest_framework as filters
from .models import DailyReport, DeviceStatistics, EnvironmentalData


class DailyReportFilter(filters.FilterSet):
    """日报过滤器"""
    # 日期范围
    report_date_after = filters.DateFilter(field_name='report_date', lookup_expr='gte')
    report_date_before = filters.DateFilter(field_name='report_date', lookup_expr='lte')

    # 数值范围
    online_rate_min = filters.NumberFilter(field_name='online_rate', lookup_expr='gte')
    online_rate_max = filters.NumberFilter(field_name='online_rate', lookup_expr='lte')
    resolution_rate_min = filters.NumberFilter(field_name='resolution_rate', lookup_expr='gte')
    resolution_rate_max = filters.NumberFilter(field_name='resolution_rate', lookup_expr='lte')
    total_alerts_min = filters.NumberFilter(field_name='total_alerts', lookup_expr='gte')
    total_alerts_max = filters.NumberFilter(field_name='total_alerts', lookup_expr='lte')
    carbon_sequestration_min = filters.NumberFilter(field_name='carbon_sequestration', lookup_expr='gte')
    carbon_sequestration_max = filters.NumberFilter(field_name='carbon_sequestration', lookup_expr='lte')

    class Meta:
        model = DailyReport
        fields = {
            'report_date': ['exact', 'gte', 'lte'],
            'online_rate': ['gte', 'lte'],
            'resolution_rate': ['gte', 'lte'],
            'total_alerts': ['gte', 'lte'],
            'carbon_sequestration': ['gte', 'lte'],
        }


class DeviceStatisticsFilter(filters.FilterSet):
    """设备统计过滤器"""
    # 设备关联过滤
    device = filters.NumberFilter(field_name='device')
    device__device_id = filters.CharFilter(field_name='device__device_id', lookup_expr='icontains')
    device__device_name = filters.CharFilter(field_name='device__device_name', lookup_expr='icontains')
    device__device_type = filters.CharFilter(field_name='device__device_type')
    device__region = filters.CharFilter(field_name='device__region', lookup_expr='icontains')
    device__forest_zone = filters.CharFilter(field_name='device__forest_zone', lookup_expr='icontains')

    # 日期范围
    stat_date_after = filters.DateFilter(field_name='stat_date', lookup_expr='gte')
    stat_date_before = filters.DateFilter(field_name='stat_date', lookup_expr='lte')

    # 数值范围
    availability_rate_min = filters.NumberFilter(field_name='availability_rate', lookup_expr='gte')
    availability_rate_max = filters.NumberFilter(field_name='availability_rate', lookup_expr='lte')
    alert_count_min = filters.NumberFilter(field_name='alert_count', lookup_expr='gte')
    alert_count_max = filters.NumberFilter(field_name='alert_count', lookup_expr='lte')
    data_completeness_min = filters.NumberFilter(field_name='data_completeness', lookup_expr='gte')
    data_completeness_max = filters.NumberFilter(field_name='data_completeness', lookup_expr='lte')
    uptime_hours_min = filters.NumberFilter(field_name='uptime_hours', lookup_expr='gte')
    uptime_hours_max = filters.NumberFilter(field_name='uptime_hours', lookup_expr='lte')

    class Meta:
        model = DeviceStatistics
        fields = {
            'device': ['exact'],
            'stat_date': ['exact', 'gte', 'lte'],
            'availability_rate': ['gte', 'lte'],
            'alert_count': ['gte', 'lte'],
            'data_completeness': ['gte', 'lte'],
        }


class EnvironmentalDataFilter(filters.FilterSet):
    """环境数据过滤器"""
    # 区域过滤
    region = filters.CharFilter(field_name='region', lookup_expr='icontains')

    # 日期范围
    stat_date_after = filters.DateFilter(field_name='stat_date', lookup_expr='gte')
    stat_date_before = filters.DateFilter(field_name='stat_date', lookup_expr='lte')

    # 小时范围
    stat_hour_min = filters.NumberFilter(field_name='stat_hour', lookup_expr='gte')
    stat_hour_max = filters.NumberFilter(field_name='stat_hour', lookup_expr='lte')

    # 温度范围
    avg_temperature_min = filters.NumberFilter(field_name='avg_temperature', lookup_expr='gte')
    avg_temperature_max = filters.NumberFilter(field_name='avg_temperature', lookup_expr='lte')
    max_temperature_min = filters.NumberFilter(field_name='max_temperature', lookup_expr='gte')
    max_temperature_max = filters.NumberFilter(field_name='max_temperature', lookup_expr='lte')
    min_temperature_min = filters.NumberFilter(field_name='min_temperature', lookup_expr='gte')
    min_temperature_max = filters.NumberFilter(field_name='min_temperature', lookup_expr='lte')

    # 湿度范围
    avg_humidity_min = filters.NumberFilter(field_name='avg_humidity', lookup_expr='gte')
    avg_humidity_max = filters.NumberFilter(field_name='avg_humidity', lookup_expr='lte')

    # 风速范围
    avg_wind_speed_min = filters.NumberFilter(field_name='avg_wind_speed', lookup_expr='gte')
    avg_wind_speed_max = filters.NumberFilter(field_name='avg_wind_speed', lookup_expr='lte')
    max_wind_speed_min = filters.NumberFilter(field_name='max_wind_speed', lookup_expr='gte')
    max_wind_speed_max = filters.NumberFilter(field_name='max_wind_speed', lookup_expr='lte')

    # 土壤参数范围
    avg_soil_moisture_min = filters.NumberFilter(field_name='avg_soil_moisture', lookup_expr='gte')
    avg_soil_moisture_max = filters.NumberFilter(field_name='avg_soil_moisture', lookup_expr='lte')
    avg_fuel_moisture_min = filters.NumberFilter(field_name='avg_fuel_moisture', lookup_expr='gte')
    avg_fuel_moisture_max = filters.NumberFilter(field_name='avg_fuel_moisture', lookup_expr='lte')

    class Meta:
        model = EnvironmentalData
        fields = {
            'region': ['exact', 'icontains'],
            'stat_date': ['exact', 'gte', 'lte'],
            'stat_hour': ['exact', 'gte', 'lte'],
            'avg_temperature': ['gte', 'lte'],
            'avg_humidity': ['gte', 'lte'],
            'avg_wind_speed': ['gte', 'lte'],
        }