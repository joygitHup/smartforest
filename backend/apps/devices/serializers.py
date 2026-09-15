# apps/devices/serializers.py
"""
Device serializers for API.
"""
from rest_framework import serializers
from .models import Device, DeviceTelemetry, DeviceCommand, DevicePreset, DeviceType, DeviceStatus


class DeviceListSerializer(serializers.ModelSerializer):
    """设备列表序列化器"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)
    communication_type_display = serializers.CharField(source='get_communication_type_display', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True, allow_null=True)
    forest_zone_ref_name = serializers.CharField(source='forest_zone_ref.name', read_only=True, allow_null=True)
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = Device
        fields = [
            'id', 'device_id', 'device_name', 'device_type', 'device_type_display',
            'status', 'status_display', 'communication_type', 'communication_type_display',
            'longitude', 'latitude', 'region', 'forest_zone',
            'forest_zone_ref', 'forest_zone_ref_name',
            'organization', 'organization_name',
            'signal_strength', 'battery_level', 'last_online_time', 'last_heartbeat',
            'created_at', 'is_online'
        ]

    def get_is_online(self, obj):
        """判断是否在线"""
        if obj.status == 'online':
            return True
        return False


class DeviceDetailSerializer(serializers.ModelSerializer):
    """设备详情序列化器"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)
    communication_type_display = serializers.CharField(source='get_communication_type_display', read_only=True)
    latest_telemetry = serializers.SerializerMethodField()
    telemetry_count = serializers.SerializerMethodField()
    command_count = serializers.SerializerMethodField()

    class Meta:
        model = Device
        fields = '__all__'

    def get_latest_telemetry(self, obj):
        """获取最新遥测数据"""
        telemetry = obj.telemetry.first()
        if telemetry:
            return DeviceTelemetrySerializer(telemetry).data
        return None

    def get_telemetry_count(self, obj):
        """获取遥测数据总数"""
        return obj.telemetry.count()

    def get_command_count(self, obj):
        """获取指令总数"""
        return obj.commands.count()


class DeviceCreateSerializer(serializers.ModelSerializer):
    """创建设备序列化器"""
    device_type = serializers.ChoiceField(choices=DeviceType.choices)
    status = serializers.ChoiceField(choices=DeviceStatus.choices, required=False, default=DeviceStatus.OFFLINE)

    class Meta:
        model = Device
        fields = [
            'device_id', 'device_name', 'device_type', 'status',
            'longitude', 'latitude', 'altitude', 'region', 'forest_zone',
            'forest_zone_ref', 'organization',
            'firmware_version', 'hardware_version', 'manufacturer',
            'install_date', 'last_maintenance',
            'communication_type', 'signal_strength', 'battery_level',
            'pan_angle', 'tilt_angle'
        ]
        extra_kwargs = {
            'organization': {'required': False, 'allow_null': True},
            'forest_zone_ref': {'required': False, 'allow_null': True},
        }

    def validate_device_id(self, value):
        """验证设备ID格式"""
        if not value or len(value.strip()) == 0:
            raise serializers.ValidationError('设备ID不能为空')
        if Device.objects.filter(device_id=value).exists():
            raise serializers.ValidationError(f'设备ID "{value}" 已存在')
        return value.strip()

    def validate(self, data):
        zone = data.get('forest_zone_ref')
        if zone is not None:
            if not zone.is_active:
                raise serializers.ValidationError({'forest_zone_ref': '该林区已停用，不可挂接设备'})
            data['forest_zone'] = zone.name
            if not data.get('region') and zone.region:
                data['region'] = zone.region
            # 组织与林区组织对齐
            if data.get('organization') is None:
                data['organization'] = zone.organization
            elif data['organization'].pk != zone.organization_id:
                raise serializers.ValidationError(
                    {'forest_zone_ref': '林区所属组织与设备组织不一致'}
                )
        return data


class DeviceUpdateSerializer(serializers.ModelSerializer):
    """更新设备序列化器"""
    device_id = serializers.CharField(read_only=True)

    class Meta:
        model = Device
        fields = [
            'device_id', 'device_name', 'device_type', 'status',
            'longitude', 'latitude', 'altitude', 'region', 'forest_zone',
            'forest_zone_ref', 'organization',
            'firmware_version', 'hardware_version', 'manufacturer',
            'install_date', 'last_maintenance',
            'communication_type', 'signal_strength', 'battery_level',
            'pan_angle', 'tilt_angle',
            'last_online_time', 'last_heartbeat'
        ]
        extra_kwargs = {
            'organization': {'required': False, 'allow_null': True},
            'forest_zone_ref': {'required': False, 'allow_null': True},
        }

    def validate_status(self, value):
        """验证状态值"""
        valid_statuses = [choice[0] for choice in DeviceStatus.choices]
        if value not in valid_statuses:
            raise serializers.ValidationError(f'无效状态，可选: {valid_statuses}')
        return value

    def validate(self, data):
        zone = data.get('forest_zone_ref', serializers.empty)
        if zone is serializers.empty:
            return data
        if zone is None:
            return data
        if not zone.is_active:
            raise serializers.ValidationError({'forest_zone_ref': '该林区已停用，不可挂接设备'})
        data['forest_zone'] = zone.name
        if not data.get('region') and zone.region:
            data['region'] = zone.region
        org = data.get('organization', getattr(self.instance, 'organization', None))
        if org is not None and org.pk != zone.organization_id:
            raise serializers.ValidationError(
                {'forest_zone_ref': '林区所属组织与设备组织不一致'}
            )
        return data


class DeviceTelemetrySerializer(serializers.ModelSerializer):
    """设备遥测数据序列化器"""
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    device_type = serializers.CharField(source='device.device_type', read_only=True)
    video_status_display = serializers.CharField(source='get_video_status_display', read_only=True)

    class Meta:
        model = DeviceTelemetry
        fields = '__all__'


class DeviceTelemetryCreateSerializer(serializers.ModelSerializer):
    """创建设备遥测数据序列化器"""
    device_id = serializers.CharField(write_only=True)

    class Meta:
        model = DeviceTelemetry
        exclude = ['device', 'created_at']

    def validate_device_id(self, value):
        """验证设备是否存在"""
        if not Device.objects.filter(device_id=value).exists():
            raise serializers.ValidationError(f'设备 {value} 不存在')
        return value

    def create(self, validated_data):
        """创建遥测数据"""
        device_id = validated_data.pop('device_id')
        device = Device.objects.get(device_id=device_id)
        return DeviceTelemetry.objects.create(device=device, **validated_data)


class DeviceCommandSerializer(serializers.ModelSerializer):
    """设备指令序列化器"""
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    operator_name = serializers.SerializerMethodField()

    class Meta:
        model = DeviceCommand
        fields = '__all__'
        read_only_fields = [
            'status', 'result', 'error_message', 'sent_at', 'delivered_at',
            'executed_at', 'correlation_id', 'operator',
        ]

    def get_operator_name(self, obj):
        if not obj.operator_id:
            return None
        u = obj.operator
        name = f'{u.last_name or ""}{u.first_name or ""}'.strip()
        return name or u.username


class DeviceCommandCreateSerializer(serializers.ModelSerializer):
    """创建设备指令序列化器"""
    device_id = serializers.CharField(write_only=True)

    class Meta:
        model = DeviceCommand
        fields = ['device_id', 'command_type', 'command_params']

    def validate_device_id(self, value):
        """验证设备是否存在"""
        if not Device.objects.filter(device_id=value).exists():
            raise serializers.ValidationError(f'设备 {value} 不存在')
        return value

    def create(self, validated_data):
        """创建指令"""
        device_id = validated_data.pop('device_id')
        device = Device.objects.get(device_id=device_id)
        return DeviceCommand.objects.create(device=device, **validated_data)


class PTZControlSerializer(serializers.Serializer):
    """云台点动控制（含 stop）"""
    direction = serializers.ChoiceField(choices=['up', 'down', 'left', 'right', 'stop'])
    speed = serializers.IntegerField(default=5, min_value=1, max_value=10)


class PTZGotoSerializer(serializers.Serializer):
    """云台绝对角度"""
    pan_angle = serializers.FloatField(min_value=-180, max_value=360)
    tilt_angle = serializers.FloatField(min_value=-90, max_value=90)
    speed = serializers.IntegerField(default=5, min_value=1, max_value=10, required=False)


class PresetPositionSerializer(serializers.Serializer):
    """预置位序列化器"""
    preset_id = serializers.IntegerField(min_value=1, max_value=8)
    name = serializers.CharField(max_length=128, required=False, allow_blank=True)
    preset_name = serializers.CharField(max_length=128, required=False, allow_blank=True)
    pan_angle = serializers.FloatField(required=False)
    tilt_angle = serializers.FloatField(required=False)
    save_current = serializers.BooleanField(default=False, required=False)

    def validate(self, attrs):
        name = (attrs.get('name') or attrs.get('preset_name') or '').strip()
        if name:
            attrs['name'] = name
        if attrs.get('save_current'):
            return attrs
        if attrs.get('pan_angle') is None or attrs.get('tilt_angle') is None:
            raise serializers.ValidationError('请提供 pan_angle/tilt_angle，或勾选 save_current 保存当前姿态')
        if not attrs.get('name'):
            attrs['name'] = f'预置位{attrs["preset_id"]}'
        return attrs


class AimAlertSerializer(serializers.Serializer):
    """告警对准：按告警坐标计算方位"""
    alert_id = serializers.IntegerField(required=False)
    alert_pk = serializers.IntegerField(required=False)
    tilt_angle = serializers.FloatField(required=False, default=-5)
    speed = serializers.IntegerField(default=5, min_value=1, max_value=10, required=False)

    def validate(self, attrs):
        if not attrs.get('alert_id') and not attrs.get('alert_pk'):
            raise serializers.ValidationError('请提供 alert_id 或 alert_pk')
        return attrs


class DeviceBatchDeleteSerializer(serializers.Serializer):
    """批量删除序列化器"""
    device_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='要删除的设备ID列表'
    )
    force = serializers.BooleanField(default=False, help_text='是否强制删除关联数据')


class DeviceBatchStatusSerializer(serializers.Serializer):
    """批量更新状态"""
    device_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='设备ID列表',
    )
    status = serializers.ChoiceField(
        choices=[('online', '在线'), ('offline', '离线'), ('alarm', '告警'), ('maintenance', '维护中')],
    )


class DeviceBatchIdsSerializer(serializers.Serializer):
    """批量操作通用：仅设备 ID 列表"""
    device_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='设备ID列表',
    )


class DeviceStatisticsSerializer(serializers.Serializer):
    """设备统计序列化器"""
    total = serializers.IntegerField()
    online = serializers.IntegerField()
    offline = serializers.IntegerField()
    alarm = serializers.IntegerField()
    maintenance = serializers.IntegerField()
    by_type = serializers.DictField()
    by_region = serializers.DictField()
    by_status = serializers.DictField()


class DevicePresetSerializer(serializers.ModelSerializer):
    class Meta:
        model = DevicePreset
        fields = [
            'id', 'preset_id', 'name', 'pan_angle', 'tilt_angle',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']