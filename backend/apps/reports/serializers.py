# apps/reports/serializers.py
"""
Report serializers for API.
"""
from rest_framework import serializers
from .models import DailyReport, DeviceStatistics, EnvironmentalData
from apps.devices.models import Device


class DailyReportListSerializer(serializers.ModelSerializer):
    """日报列表序列化器"""

    class Meta:
        model = DailyReport
        fields = [
            'id', 'report_date', 'total_devices', 'online_devices', 'online_rate',
            'total_alerts', 'resolved_alerts', 'resolution_rate',
            'avg_response_time', 'false_alarm_count', 'false_alarm_rate',
            'carbon_sequestration', 'created_at'
        ]


class DailyReportDetailSerializer(serializers.ModelSerializer):
    """日报详情序列化器"""

    class Meta:
        model = DailyReport
        fields = '__all__'


class DailyReportCreateSerializer(serializers.ModelSerializer):
    """创建日报序列化器"""

    class Meta:
        model = DailyReport
        fields = ['report_date']


class DailyReportUpdateSerializer(serializers.ModelSerializer):
    """更新日报序列化器"""
    report_date = serializers.DateField(read_only=True)

    class Meta:
        model = DailyReport
        fields = [
            'report_date', 'total_devices', 'online_devices', 'online_rate',
            'total_alerts', 'resolved_alerts', 'resolution_rate',
            'avg_response_time', 'false_alarm_count', 'false_alarm_rate',
            'avg_temperature', 'max_temperature', 'avg_humidity', 'avg_wind_speed',
            'carbon_sequestration'
        ]


class DeviceStatisticsListSerializer(serializers.ModelSerializer):
    """设备统计列表序列化器"""
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_type = serializers.CharField(source='device.device_type', read_only=True)
    region = serializers.CharField(source='device.region', read_only=True)
    forest_zone = serializers.CharField(source='device.forest_zone', read_only=True)

    class Meta:
        model = DeviceStatistics
        fields = [
            'id', 'device', 'device_id', 'device_name', 'device_type',
            'region', 'forest_zone', 'stat_date',
            'uptime_hours', 'availability_rate',
            'alert_count', 'fault_count', 'data_completeness'
        ]


class DeviceStatisticsDetailSerializer(serializers.ModelSerializer):
    """设备统计详情序列化器"""
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_type = serializers.CharField(source='device.device_type', read_only=True)
    region = serializers.CharField(source='device.region', read_only=True)
    forest_zone = serializers.CharField(source='device.forest_zone', read_only=True)

    class Meta:
        model = DeviceStatistics
        fields = '__all__'


class DeviceStatisticsCreateSerializer(serializers.ModelSerializer):
    """创建设备统计序列化器"""
    device_id = serializers.CharField(write_only=True)

    class Meta:
        model = DeviceStatistics
        exclude = ['device', 'created_at']

    def validate_device_id(self, value):
        """验证设备是否存在"""
        if not Device.objects.filter(device_id=value).exists():
            raise serializers.ValidationError(f'设备 {value} 不存在')
        return value

    def create(self, validated_data):
        """创建统计记录"""
        device_id = validated_data.pop('device_id')
        device = Device.objects.get(device_id=device_id)
        return DeviceStatistics.objects.create(device=device, **validated_data)


class DeviceStatisticsUpdateSerializer(serializers.ModelSerializer):
    """更新设备统计序列化器"""
    device = serializers.PrimaryKeyRelatedField(read_only=True)
    stat_date = serializers.DateField(read_only=True)

    class Meta:
        model = DeviceStatistics
        fields = [
            'device', 'stat_date', 'uptime_hours', 'availability_rate',
            'alert_count', 'fault_count', 'data_completeness'
        ]


class EnvironmentalDataListSerializer(serializers.ModelSerializer):
    """环境数据列表序列化器"""

    class Meta:
        model = EnvironmentalData
        fields = [
            'id', 'region', 'stat_date', 'stat_hour',
            'avg_temperature', 'max_temperature', 'min_temperature',
            'avg_humidity', 'max_humidity', 'min_humidity',
            'avg_wind_speed', 'max_wind_speed',
            'avg_light_intensity', 'avg_soil_moisture', 'avg_fuel_moisture',
            'created_at'
        ]


class EnvironmentalDataDetailSerializer(serializers.ModelSerializer):
    """环境数据详情序列化器"""

    class Meta:
        model = EnvironmentalData
        fields = '__all__'


class EnvironmentalDataCreateSerializer(serializers.ModelSerializer):
    """创建环境数据序列化器"""

    class Meta:
        model = EnvironmentalData
        fields = [
            'region', 'stat_date', 'stat_hour',
            'avg_temperature', 'max_temperature', 'min_temperature',
            'avg_humidity', 'max_humidity', 'min_humidity',
            'avg_wind_speed', 'max_wind_speed',
            'avg_light_intensity', 'avg_soil_moisture', 'avg_fuel_moisture'
        ]

    def validate(self, data):
        """验证数据唯一性"""
        region = data.get('region')
        stat_date = data.get('stat_date')
        stat_hour = data.get('stat_hour')

        if EnvironmentalData.objects.filter(
                region=region,
                stat_date=stat_date,
                stat_hour=stat_hour
        ).exists():
            raise serializers.ValidationError(
                f'区域 {region} 在 {stat_date} {stat_hour} 时的数据已存在'
            )
        return data


class ReportSummarySerializer(serializers.Serializer):
    """报表汇总序列化器"""
    date_range = serializers.DictField()
    device_summary = serializers.DictField()
    alert_summary = serializers.DictField()
    environment_summary = serializers.DictField()


class ReportGenerateSerializer(serializers.Serializer):
    """报表生成序列化器"""
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    report_type = serializers.ChoiceField(choices=['daily', 'weekly', 'monthly'])
    regions = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text='要包含的区域列表'
    )
    format = serializers.ChoiceField(
        choices=['json', 'excel', 'pdf'],
        default='json'
    )