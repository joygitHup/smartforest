"""
Report serializers for API.
"""
from rest_framework import serializers
from .models import DailyReport, DeviceStatistics, EnvironmentalData


class DailyReportSerializer(serializers.ModelSerializer):
    """日报序列化器"""
    class Meta:
        model = DailyReport
        fields = '__all__'


class DeviceStatisticsSerializer(serializers.ModelSerializer):
    """设备统计序列化器"""
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    
    class Meta:
        model = DeviceStatistics
        fields = '__all__'


class EnvironmentalDataSerializer(serializers.ModelSerializer):
    """环境数据序列化器"""
    class Meta:
        model = EnvironmentalData
        fields = '__all__'


class ReportOverviewSerializer(serializers.Serializer):
    """报表概览序列化器"""
    date = serializers.DateField()
    total_devices = serializers.IntegerField()
    online_devices = serializers.IntegerField()
    online_rate = serializers.FloatField()
    total_alerts = serializers.IntegerField()
    resolved_alerts = serializers.IntegerField()
    resolution_rate = serializers.FloatField()
    avg_response_time = serializers.IntegerField()
    false_alarm_rate = serializers.FloatField()
    carbon_sequestration = serializers.FloatField()
