"""
Alert models for forest monitoring system.
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from devices.models import Device



class AlertLevel(models.TextChoices):
    """告警级别枚举"""
    LEVEL_3 = 'level_3', '三级(提示)'
    LEVEL_2 = 'level_2', '二级(预警)'
    LEVEL_1 = 'level_1', '一级(紧急)'


class AlertStatus(models.TextChoices):
    """告警状态枚举"""
    NEW = 'new', '新告警'
    ACKNOWLEDGED = 'acknowledged', '已确认'
    DISPATCHED = 'dispatched', '已派单'
    PROCESSING = 'processing', '处理中'
    RESOLVED = 'resolved', '已处置'
    FALSE_ALARM = 'false_alarm', '误报'
    ESCALATED = 'escalated', '已升级'


class AlertType(models.TextChoices):
    """告警类型枚举"""
    FIRE = 'fire', '火情'
    SMOKE = 'smoke', '烟雾'
    HIGH_TEMP = 'high_temp', '高温'
    DEVICE_FAULT = 'device_fault', '设备故障'
    LOW_BATTERY = 'low_battery', '低电量'
    OFFLINE = 'offline', '设备离线'
    ENV_THRESHOLD = 'env_threshold', '环境参数超阈值'


class Alert(models.Model):
    """告警主表"""
    alert_id = models.CharField('告警ID', max_length=64, unique=True, db_index=True)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='alerts', null=True)
    
    # 告警基本信息
    alert_type = models.CharField('告警类型', max_length=32, choices=AlertType.choices)
    alert_level = models.CharField('告警级别', max_length=32, choices=AlertLevel.choices)
    status = models.CharField('告警状态', max_length=32, choices=AlertStatus.choices, default=AlertStatus.NEW)
    
    # 告警内容
    title = models.CharField('告警标题', max_length=256)
    description = models.TextField('告警描述', blank=True)
    
    # 位置信息
    longitude = models.DecimalField('经度', max_digits=10, decimal_places=6, null=True, blank=True)
    latitude = models.DecimalField('纬度', max_digits=10, decimal_places=6, null=True, blank=True)
    region = models.CharField('所属区域', max_length=128, blank=True)
    forest_zone = models.CharField('林区', max_length=128, blank=True)
    
    # AI 识别信息
    ai_confidence = models.FloatField('AI置信度', validators=[MinValueValidator(0), MaxValueValidator(1)], null=True, blank=True)
    ai_category = models.CharField('AI识别类别', max_length=64, blank=True)
    screenshot_url = models.URLField('截图URL', blank=True)
    thermal_image_url = models.URLField('热成像URL', blank=True)
    
    # 处置信息
    assigned_to = models.CharField('指派给', max_length=128, blank=True)
    assigned_at = models.DateTimeField('指派时间', null=True, blank=True)
    resolved_at = models.DateTimeField('处置时间', null=True, blank=True)
    resolution_note = models.TextField('处置说明', blank=True)
    
    # 时间戳
    occurred_at = models.DateTimeField('发生时间', db_index=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        app_label = 'alerts'  # ✅ 添加这一行
        db_table = 'alerts'
        verbose_name = '告警'
        verbose_name_plural = verbose_name
        ordering = ['-occurred_at']
        indexes = [
            models.Index(fields=['alert_level', 'status']),
            models.Index(fields=['alert_type', '-occurred_at']),
            models.Index(fields=['region', '-occurred_at']),
        ]
    
    def __str__(self):
        return f'{self.title} ({self.alert_id})'


class AlertAction(models.Model):
    """告警处置记录"""
    alert = models.ForeignKey(Alert, on_delete=models.CASCADE, related_name='actions')
    action_type = models.CharField('操作类型', max_length=64)
    operator = models.CharField('操作人', max_length=128)
    content = models.TextField('操作内容', blank=True)
    
    # 现场信息
    photo_urls = models.JSONField('现场照片', default=list)
    video_url = models.URLField('现场视频', blank=True)
    location = models.CharField('现场位置', max_length=256, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    
    class Meta:
        db_table = 'alert_actions'
        verbose_name = '告警处置记录'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']


class FireTracing(models.Model):
    """火情溯源记录"""
    alert = models.OneToOneField(Alert, on_delete=models.CASCADE, related_name='fire_tracing')
    
    # 起火点信息
    origin_longitude = models.DecimalField('起火点经度', max_digits=10, decimal_places=6)
    origin_latitude = models.DecimalField('起火点纬度', max_digits=10, decimal_places=6)
    origin_confidence = models.FloatField('定位置信度', validators=[MinValueValidator(0), MaxValueValidator(1)])
    
    # 溯源算法参数
    algorithm = models.CharField('算法', max_length=64, default='FARSITE')
    input_devices = models.JSONField('输入设备列表', default=list)
    weather_data = models.JSONField('气象数据', default=dict)
    
    # 蔓延推演结果
    spread_prediction_1h = models.JSONField('1小时预测', default=dict)
    spread_prediction_3h = models.JSONField('3小时预测', default=dict)
    spread_prediction_6h = models.JSONField('6小时预测', default=dict)
    
    # 防控策略
    control_strategy = models.JSONField('防控策略', default=dict)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'fire_tracing'
        verbose_name = '火情溯源'
        verbose_name_plural = verbose_name
