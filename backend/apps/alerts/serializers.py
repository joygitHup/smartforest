# apps/alerts/serializers.py
"""
Alert serializers for API.
"""
from rest_framework import serializers
from .models import Alert, AlertAction, FireTracing
from apps.devices.models import Device


class AlertListSerializer(serializers.ModelSerializer):
    """告警列表序列化器"""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    alert_level_display = serializers.CharField(source='get_alert_level_display', read_only=True)
    alert_type_display = serializers.CharField(source='get_alert_type_display', read_only=True)
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.CharField(source='device.device_id', read_only=True)
    
    class Meta:
        model = Alert
        fields = [
            'id', 'alert_id', 'device', 'device_id', 'device_name',
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
    
    class Meta:
        model = AlertAction
        fields = '__all__'
        read_only_fields = ['created_at']


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
    
    class Meta:
        model = FireTracing
        fields = '__all__'


class FireTracingCreateSerializer(serializers.Serializer):
    """火情溯源创建序列化器"""
    alert_id = serializers.IntegerField(help_text="告警ID")
    # 可选参数，不提供则自动计算
    origin_longitude = serializers.DecimalField(max_digits=10, decimal_places=6, required=False)
    origin_latitude = serializers.DecimalField(max_digits=10, decimal_places=6, required=False)