"""
Device serializers for API.
"""
from rest_framework import serializers
from .models import Device, DeviceTelemetry, DeviceCommand, DeviceType, DeviceStatus


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


class DeviceCreateSerializer(serializers.ModelSerializer):
    """创建设备序列化器"""
    device_type = serializers.ChoiceField(choices=DeviceType.choices)
    status = serializers.ChoiceField(choices=DeviceStatus.choices, required=False, default=DeviceStatus.OFFLINE)

    class Meta:
        model = Device
        fields = [
            'device_id', 'device_name', 'device_type', 'status',
            'longitude', 'latitude', 'altitude', 'region', 'forest_zone',
            'firmware_version', 'hardware_version', 'manufacturer',
            'install_date', 'last_maintenance',
            'communication_type', 'signal_strength', 'battery_level',
            'pan_angle', 'tilt_angle'
        ]

    def validate_device_id(self, value):
        """验证设备ID格式"""
        if not value or len(value.strip()) == 0:
            raise serializers.ValidationError('设备ID不能为空')
        # 检查是否已存在
        if Device.objects.filter(device_id=value).exists():
            raise serializers.ValidationError(f'设备ID "{value}" 已存在')
        return value.strip()

    def validate(self, data):
        """跨字段验证"""
        # 如果设备类型是双目云台，云台角度可以为空
        # 如果是环境传感器，某些字段可能不需要
        return data


class DeviceUpdateSerializer(serializers.ModelSerializer):
    """更新设备序列化器 - device_id 不可修改"""
    device_id = serializers.CharField(read_only=True)

    class Meta:
        model = Device
        fields = [
            'device_id', 'device_name', 'device_type', 'status',
            'longitude', 'latitude', 'altitude', 'region', 'forest_zone',
            'firmware_version', 'hardware_version', 'manufacturer',
            'install_date', 'last_maintenance',
            'communication_type', 'signal_strength', 'battery_level',
            'pan_angle', 'tilt_angle',
            'last_online_time', 'last_heartbeat'
        ]

    def validate_status(self, value):
        """验证状态值"""
        valid_statuses = [choice[0] for choice in DeviceStatus.choices]
        if value not in valid_statuses:
            raise serializers.ValidationError(f'无效状态，可选: {valid_statuses}')
        return value


class DeviceDetailSerializer(serializers.ModelSerializer):
    """设备详情序列化器"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)
    communication_type_display = serializers.CharField(source='get_communication_type_display', read_only=True)
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
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = DeviceCommand
        fields = '__all__'
        read_only_fields = ['status', 'result', 'error_message', 'sent_at', 'delivered_at', 'executed_at']

    def create(self, validated_data):
        """创建指令时自动设置状态为 pending"""
        validated_data['status'] = 'pending'
        return super().create(validated_data)


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


class DeviceBatchDeleteSerializer(serializers.Serializer):
    """批量删除序列化器"""
    device_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='要删除的设备ID列表'
    )
    force = serializers.BooleanField(default=False, help_text='是否强制删除关联数据')