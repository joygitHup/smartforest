# apps/alerts/serializers.py
"""
Alert serializers for API.
"""
from rest_framework import serializers
from .models import Alert, AlertAction, FireTracing, AlertRule, AlertReinforcement, WorkOrder
from apps.devices.models import Device


class AlertListSerializer(serializers.ModelSerializer):
    """告警列表序列化器"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    alert_level_display = serializers.CharField(source='get_alert_level_display', read_only=True)
    alert_type_display = serializers.CharField(source='get_alert_type_display', read_only=True)
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True, allow_null=True)
    
    class Meta:
        model = Alert
        fields = [
            'id', 'alert_id', 'device', 'device_id', 'device_name',
            'organization', 'organization_name',
            'alert_type', 'alert_type_display',
            'alert_level', 'alert_level_display',
            'status', 'status_display',
            'title', 'region', 'forest_zone',
            'ai_confidence', 'occurred_at', 'created_at'
        ]


class AlertDetailSerializer(serializers.ModelSerializer):
    """告警详情序列化器"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    alert_level_display = serializers.CharField(source='get_alert_level_display', read_only=True)
    alert_type_display = serializers.CharField(source='get_alert_type_display', read_only=True)
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    actions = serializers.SerializerMethodField()
    fire_tracing = serializers.SerializerMethodField()
    work_orders = serializers.SerializerMethodField()
    
    class Meta:
        model = Alert
        fields = '__all__'
    
    def get_actions(self, obj):
        """获取处置记录"""
        actions = obj.actions.all()[:20]
        return AlertActionSerializer(actions, many=True).data
    
    def get_fire_tracing(self, obj):
        """获取火情溯源记录"""
        if hasattr(obj, 'fire_tracing'):
            return FireTracingSerializer(obj.fire_tracing).data
        return None

    def get_work_orders(self, obj):
        orders = obj.work_orders.all()[:10]
        return WorkOrderSerializer(orders, many=True).data


class AlertCreateSerializer(serializers.Serializer):
    """告警创建序列化器（用于 MQTT 接收）"""
    device_id = serializers.CharField(max_length=64, help_text="设备ID")
    alert_type = serializers.ChoiceField(choices=[
        ('fire', '火情'),
        ('smoke', '烟雾'),
        ('high_temp', '高温'),
        ('device_fault', '设备故障'),
        ('low_battery', '低电量'),
        ('offline', '设备离线'),
        ('env_threshold', '环境参数超阈值'),
    ])
    alert_level = serializers.ChoiceField(choices=[
        ('level_3', '三级(提示)'),
        ('level_2', '二级(预警)'),
        ('level_1', '一级(紧急)'),
    ])
    title = serializers.CharField(max_length=256)
    description = serializers.CharField(required=False, allow_blank=True)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=6, required=False, allow_null=True)
    latitude = serializers.DecimalField(max_digits=10, decimal_places=6, required=False, allow_null=True)
    ai_confidence = serializers.FloatField(required=False, min_value=0, max_value=1, allow_null=True)
    ai_category = serializers.CharField(max_length=64, required=False, allow_blank=True)
    screenshot_url = serializers.URLField(required=False, allow_blank=True)
    thermal_image_url = serializers.URLField(required=False, allow_blank=True)
    
    def validate(self, data):
        """验证数据"""
        # 验证设备是否存在
        device_id = data.get('device_id')
        if not Device.objects.filter(device_id=device_id).exists():
            raise serializers.ValidationError(f'设备 {device_id} 不存在')
        return data


class AlertUpdateSerializer(serializers.ModelSerializer):
    """告警更新序列化器"""
    class Meta:
        model = Alert
        fields = ['status', 'assigned_to', 'resolution_note', 'resolved_at']


class AlertActionSerializer(serializers.ModelSerializer):
    """告警处置记录序列化器"""
    alert_id = serializers.CharField(source='alert.alert_id', read_only=True)
    alert_title = serializers.CharField(source='alert.title', read_only=True)
    alert_level = serializers.CharField(source='alert.alert_level', read_only=True)
    alert_level_display = serializers.CharField(
        source='alert.get_alert_level_display', read_only=True
    )
    alert_status = serializers.CharField(source='alert.status', read_only=True)
    alert_status_display = serializers.CharField(
        source='alert.get_status_display', read_only=True
    )
    alert_type = serializers.CharField(source='alert.alert_type', read_only=True)
    alert_type_display = serializers.CharField(
        source='alert.get_alert_type_display', read_only=True
    )
    region = serializers.CharField(source='alert.region', read_only=True)
    device_name = serializers.SerializerMethodField()
    device_id = serializers.SerializerMethodField()
    action_type_display = serializers.SerializerMethodField()

    ACTION_TYPE_LABELS = {
        'acknowledge': '确认告警',
        'dispatch': '派单',
        'processing': '开始处理',
        'resolve': '处置完成',
        'false_alarm': '误报标记',
        'escalate': '升级告警',
        'reinforce': '申请增援',
        'reinforce_update': '增援状态更新',
        'manual': '人工备注',
        'comment': '备注',
    }

    class Meta:
        model = AlertAction
        fields = '__all__'
        read_only_fields = ['created_at']

    def get_action_type_display(self, obj):
        return self.ACTION_TYPE_LABELS.get(obj.action_type, obj.action_type)

    def get_device_name(self, obj):
        device = getattr(obj.alert, 'device', None)
        return device.device_name if device else None

    def get_device_id(self, obj):
        device = getattr(obj.alert, 'device', None)
        return device.device_id if device else None


class AlertActionCreateSerializer(serializers.ModelSerializer):
    """告警处置记录创建序列化器"""
    class Meta:
        model = AlertAction
        fields = ['action_type', 'operator', 'content', 'photo_urls', 'video_url', 'location']


class FireTracingSerializer(serializers.ModelSerializer):
    """火情溯源序列化器"""
    alert_id = serializers.CharField(source='alert.alert_id', read_only=True)
    alert_title = serializers.CharField(source='alert.title', read_only=True)
    alert_level = serializers.CharField(source='alert.alert_level', read_only=True)
    alert_level_display = serializers.CharField(
        source='alert.get_alert_level_display', read_only=True
    )
    alert_type = serializers.CharField(source='alert.alert_type', read_only=True)
    alert_type_display = serializers.CharField(
        source='alert.get_alert_type_display', read_only=True
    )
    alert_status = serializers.CharField(source='alert.status', read_only=True)
    alert_status_display = serializers.CharField(
        source='alert.get_status_display', read_only=True
    )
    region = serializers.CharField(source='alert.region', read_only=True)
    forest_zone = serializers.CharField(source='alert.forest_zone', read_only=True)
    device_id = serializers.CharField(source='alert.device.device_id', read_only=True)
    device_name = serializers.CharField(source='alert.device.device_name', read_only=True)
    occurred_at = serializers.DateTimeField(source='alert.occurred_at', read_only=True)
    affected_area_km2 = serializers.SerializerMethodField()

    class Meta:
        model = FireTracing
        fields = '__all__'

    def get_affected_area_km2(self, obj):
        """优先取 6h 预测面积，其次 3h / 1h"""
        for field in (
            obj.spread_prediction_6h,
            obj.spread_prediction_3h,
            obj.spread_prediction_1h,
        ):
            if isinstance(field, dict) and field.get('area_km2') is not None:
                try:
                    return float(field['area_km2'])
                except (TypeError, ValueError):
                    continue
        return None


class FireTracingCreateSerializer(serializers.Serializer):
    """火情溯源创建序列化器"""
    alert_id = serializers.IntegerField(help_text="告警ID")
    # 可选参数，不提供则自动计算
    origin_longitude = serializers.DecimalField(max_digits=10, decimal_places=6, required=False)
    origin_latitude = serializers.DecimalField(max_digits=10, decimal_places=6, required=False)


class AlertRuleSerializer(serializers.ModelSerializer):
    """告警规则序列化器"""
    alert_type_display = serializers.CharField(source='get_alert_type_display', read_only=True)
    alert_level_display = serializers.CharField(source='get_alert_level_display', read_only=True)
    apply_scope_display = serializers.CharField(source='get_apply_scope_display', read_only=True)
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True, allow_null=True)
    forest_zone_ref_name = serializers.CharField(
        source='forest_zone_ref.name', read_only=True, allow_null=True
    )
    device_ids = serializers.PrimaryKeyRelatedField(
        source='devices',
        many=True,
        queryset=Device.objects.all(),
        required=False,
    )
    devices_brief = serializers.SerializerMethodField()
    device_count = serializers.SerializerMethodField()

    class Meta:
        model = AlertRule
        fields = [
            'id', 'name', 'organization', 'organization_name',
            'forest_zone_ref', 'forest_zone_ref_name',
            'alert_type', 'alert_type_display',
            'alert_level', 'alert_level_display',
            'confidence_threshold', 'temperature_threshold', 'humidity_threshold',
            'push_channels', 'response_seconds',
            'apply_scope', 'apply_scope_display',
            'region', 'device_type', 'device_type_display',
            'device_ids', 'devices_brief', 'device_count',
            'description', 'is_system', 'is_enabled', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'is_system']
        extra_kwargs = {
            'organization': {'required': False, 'allow_null': True},
            'forest_zone_ref': {'required': False, 'allow_null': True},
        }

    def get_devices_brief(self, obj):
        return [
            {
                'id': d.id,
                'device_id': d.device_id,
                'device_name': d.device_name,
                'region': d.region,
                'device_type': d.device_type,
            }
            for d in obj.devices.all()[:50]
        ]

    def get_device_count(self, obj):
        return obj.devices.count()

    def validate_push_channels(self, value):
        allowed = {'in_app', 'sms', 'voice', 'dedicated_line', 'email'}
        if not isinstance(value, list):
            raise serializers.ValidationError('push_channels 须为数组')
        invalid = set(value) - allowed
        if invalid:
            raise serializers.ValidationError(f'不支持的推送方式: {invalid}')
        return value

    def validate(self, attrs):
        scope = attrs.get('apply_scope') or getattr(self.instance, 'apply_scope', 'global')
        zone = attrs.get('forest_zone_ref', serializers.empty)
        if zone is not serializers.empty and zone is not None:
            attrs['region'] = zone.name
        region = attrs.get('region')
        if region is None and self.instance is not None:
            region = self.instance.region
        device_type = attrs.get('device_type')
        if device_type is None and self.instance is not None:
            device_type = self.instance.device_type
        devices = attrs.get('devices')
        zone_eff = zone if zone is not serializers.empty else getattr(self.instance, 'forest_zone_ref', None)

        if scope == 'region' and not zone_eff and not region:
            raise serializers.ValidationError({'forest_zone_ref': '按林区作用时请选择林区'})
        if scope == 'device_type' and not device_type:
            raise serializers.ValidationError({'device_type': '按设备类型作用时必须选择设备类型'})
        if scope == 'devices':
            if devices is not None and len(devices) == 0:
                raise serializers.ValidationError({'device_ids': '指定设备时至少选择一台'})
            if self.instance is None and devices is None:
                raise serializers.ValidationError({'device_ids': '指定设备时至少选择一台'})
            if (
                self.instance is not None
                and devices is None
                and not self.instance.devices.exists()
            ):
                raise serializers.ValidationError({'device_ids': '指定设备时至少选择一台'})
        return attrs


class AlertReinforcementSerializer(serializers.ModelSerializer):
    """增援申请序列化器"""
    alert_id = serializers.CharField(source='alert.alert_id', read_only=True)
    alert_title = serializers.CharField(source='alert.title', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = AlertReinforcement
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'requester']


class AlertReinforcementCreateSerializer(serializers.Serializer):
    """创建增援申请"""
    reason = serializers.CharField(max_length=1000)
    contact = serializers.CharField(max_length=64, required=False, allow_blank=True)
    required_people = serializers.IntegerField(min_value=1, default=1)


class AlertNavigationSerializer(serializers.Serializer):
    """导航至火点响应"""
    alert_id = serializers.CharField()
    latitude = serializers.FloatField(allow_null=True)
    longitude = serializers.FloatField(allow_null=True)
    source = serializers.CharField()
    amap_url = serializers.CharField(allow_blank=True)
    baidu_url = serializers.CharField(allow_blank=True)
    google_url = serializers.CharField(allow_blank=True)
    message = serializers.CharField()


class WorkOrderSerializer(serializers.ModelSerializer):
    """工单序列化器"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    alert_id = serializers.CharField(source='alert.alert_id', read_only=True)
    alert_title = serializers.CharField(source='alert.title', read_only=True)
    alert_level = serializers.CharField(source='alert.alert_level', read_only=True)
    alert_type = serializers.CharField(source='alert.alert_type', read_only=True)
    alert_status = serializers.CharField(source='alert.status', read_only=True)
    assignee_username = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrder
        fields = [
            'id', 'work_order_id', 'alert', 'alert_id', 'alert_title',
            'alert_level', 'alert_type', 'alert_status',
            'title', 'description', 'priority', 'priority_display',
            'status', 'status_display',
            'assignee', 'assignee_name', 'assignee_username',
            'creator', 'creator_name',
            'region', 'forest_zone',
            'due_at', 'accepted_at', 'started_at', 'completed_at',
            'result_note', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'work_order_id', 'creator', 'creator_name',
            'accepted_at', 'started_at', 'completed_at',
            'created_at', 'updated_at',
        ]

    def get_assignee_username(self, obj):
        user = obj.assignee
        return user.username if user else ''


class WorkOrderCreateSerializer(serializers.Serializer):
    """手动创建工单"""
    alert_id = serializers.IntegerField()
    assignee_id = serializers.IntegerField(required=False, allow_null=True)
    assigned_to = serializers.CharField(required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)
    title = serializers.CharField(required=False, allow_blank=True)


class WorkOrderUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkOrder
        fields = [
            'title', 'description', 'priority', 'assignee',
            'assignee_name', 'due_at', 'result_note', 'status',
        ]
