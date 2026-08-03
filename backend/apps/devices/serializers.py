"""
Device serializers for API.
"""
from rest_framework import serializers
from .models import Device, DeviceTelemetry, DeviceCommand


class DeviceListSerializer(serializers.ModelSerializer):
    """设备列表序列化器"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)
    
    class Meta:
        model = Device
        fields = [
            'id', 'device_id', 'device_name', 'device_type', 'device_type_display',
            'status', 'status_display', 'longitude', 'latitude', 'region', 'forest_zone',
            'signal_strength', 'battery_level', 'last_online_time', 'created_at'
        ]


class DeviceDetailSerializer(serializers.ModelSerializer):
    """设备详情序列化器"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)
    latest_telemetry = serializers.SerializerMethodField()
    
    class Meta:
        model = Device
        fields = '__all__'
    
    def get_latest_telemetry(self, obj):
        """获取最新遥测数据"""
        telemetry = obj.telemetry.first()
        if telemetry:
            return DeviceTelemetrySerializer(telemetry).data
        return None


class DeviceTelemetrySerializer(serializers.ModelSerializer):
    """设备遥测数据序列化器"""
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    
    class Meta:
        model = DeviceTelemetry
        fields = '__all__'


class DeviceCommandSerializer(serializers.ModelSerializer):
    """设备指令序列化器"""
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    
    class Meta:
        model = DeviceCommand
        fields = '__all__'
        read_only_fields = ['status', 'result', 'error_message', 'sent_at', 'delivered_at', 'executed_at']


class PTZControlSerializer(serializers.Serializer):
    """云台控制序列化器"""
    direction = serializers.ChoiceField(choices=['up', 'down', 'left', 'right', 'stop'])
    speed = serializers.IntegerField(default=5, min_value=1, max_value=10)


class PresetPositionSerializer(serializers.Serializer):
    """预置位序列化器"""
    preset_id = serializers.IntegerField()
    preset_name = serializers.CharField(max_length=128)
    pan_angle = serializers.FloatField()
    tilt_angle = serializers.FloatField()
