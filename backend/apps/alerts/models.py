"""
Alert models for forest monitoring system.
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator

from apps.devices.models import Device


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
    organization = models.ForeignKey(
        'users.Organization',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='alerts',
        verbose_name='所属组织',
        db_index=True,
    )
    forest_zone_ref = models.ForeignKey(
        'users.ForestZone',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='alerts',
        verbose_name='所属林区',
        db_index=True,
    )

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
            models.Index(fields=['organization', '-occurred_at']),
            models.Index(fields=['organization', 'status', '-occurred_at']),
            models.Index(fields=['status', '-occurred_at']),
            models.Index(fields=['forest_zone', '-occurred_at']),
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
        app_label = 'alerts'
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
        app_label = 'alerts'
        db_table = 'fire_tracing'
        verbose_name = '火情溯源'
        verbose_name_plural = verbose_name


class AlertRule(models.Model):
    """告警规则配置"""

    class ApplyScope(models.TextChoices):
        GLOBAL = 'global', '全部设备'
        REGION = 'region', '按林区'
        DEVICE_TYPE = 'device_type', '按设备类型'
        DEVICES = 'devices', '指定设备'

    name = models.CharField('规则名称', max_length=128)
    organization = models.ForeignKey(
        'users.Organization',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='alert_rules',
        verbose_name='所属组织',
        db_index=True,
    )
    forest_zone_ref = models.ForeignKey(
        'users.ForestZone',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='alert_rules',
        verbose_name='适用林区',
        db_index=True,
    )
    alert_type = models.CharField('适用告警类型', max_length=32, choices=AlertType.choices)
    alert_level = models.CharField('告警级别', max_length=32, choices=AlertLevel.choices)
    confidence_threshold = models.FloatField(
        'AI置信度阈值',
        default=0.7,
        validators=[MinValueValidator(0), MaxValueValidator(1)],
        help_text='0~1，低于阈值不触发',
    )
    # 环境阈值（可选）
    temperature_threshold = models.FloatField('温度阈值(℃)', null=True, blank=True)
    humidity_threshold = models.FloatField('湿度阈值(%RH)', null=True, blank=True)
    # 推送方式：in_app / sms / voice / dedicated_line
    push_channels = models.JSONField('推送方式', default=list)
    response_seconds = models.PositiveIntegerField('响应时限(秒)', default=300)
    apply_scope = models.CharField(
        '作用范围',
        max_length=32,
        choices=ApplyScope.choices,
        default=ApplyScope.GLOBAL,
        db_index=True,
    )
    region = models.CharField('适用区域', max_length=128, blank=True)
    device_type = models.CharField(
        '适用设备类型',
        max_length=32,
        blank=True,
        choices=[
            ('dual_camera', '双目智能监测云台'),
            ('env_sensor', '多参数环境传感器'),
            ('ai_gateway', 'AI边缘网关'),
            ('drone', '无人机'),
        ],
    )
    devices = models.ManyToManyField(
        Device,
        blank=True,
        related_name='alert_rules',
        verbose_name='指定设备',
    )
    description = models.TextField('规则说明', blank=True)
    is_system = models.BooleanField(
        '系统内置',
        default=False,
        db_index=True,
        help_text='系统默认规则全平台可见；自建规则仅本组织子树可见，平级互不可见',
    )
    is_enabled = models.BooleanField('是否启用', default=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        app_label = 'alerts'
        db_table = 'alert_rules'
        verbose_name = '告警规则'
        verbose_name_plural = verbose_name
        ordering = ['alert_level', '-updated_at']

    def __str__(self):
        return self.name

    def applies_to_device(self, device, device_id_set: set[int] | None = None) -> bool:
        """判断规则是否作用于某设备。device_id_set 可传入已预取的设备 PK 集合。"""
        # 系统默认规则可跨组织；自建规则仅同组织设备
        if (
            not self.is_system
            and self.organization_id
            and getattr(device, 'organization_id', None) != self.organization_id
        ):
            return False
        scope = self.apply_scope or self.ApplyScope.GLOBAL
        if scope == self.ApplyScope.GLOBAL:
            return True
        if scope == self.ApplyScope.REGION:
            # 优先按林区主数据匹配；兼容旧 region 文本
            if self.forest_zone_ref_id:
                return getattr(device, 'forest_zone_ref_id', None) == self.forest_zone_ref_id
            target = (self.region or '').strip()
            if not target:
                return False
            return target in {
                (device.region or '').strip(),
                (device.forest_zone or '').strip(),
                getattr(getattr(device, 'forest_zone_ref', None), 'name', '') or '',
            }
        if scope == self.ApplyScope.DEVICE_TYPE:
            if not self.device_type or self.device_type != device.device_type:
                return False
            if self.forest_zone_ref_id:
                return getattr(device, 'forest_zone_ref_id', None) == self.forest_zone_ref_id
            if self.region:
                return self.region in {
                    (device.region or '').strip(),
                    (device.forest_zone or '').strip(),
                }
            return True
        if scope == self.ApplyScope.DEVICES:
            if device_id_set is not None:
                return device.pk in device_id_set
            return self.devices.filter(pk=device.pk).exists()
        return False


class AlertReinforcement(models.Model):
    """告警增援申请"""
    class Status(models.TextChoices):
        PENDING = 'pending', '待处理'
        ACCEPTED = 'accepted', '已受理'
        REJECTED = 'rejected', '已拒绝'
        COMPLETED = 'completed', '已完成'

    alert = models.ForeignKey(Alert, on_delete=models.CASCADE, related_name='reinforcements')
    requester = models.CharField('申请人', max_length=128)
    reason = models.TextField('增援事由')
    contact = models.CharField('联系方式', max_length=64, blank=True)
    required_people = models.PositiveIntegerField('需求人数', default=1)
    status = models.CharField(
        '状态', max_length=32, choices=Status.choices, default=Status.PENDING
    )
    handler_note = models.TextField('处理备注', blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        app_label = 'alerts'
        db_table = 'alert_reinforcements'
        verbose_name = '告警增援'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']

    def __str__(self):
        return f'增援-{self.alert.alert_id}-{self.status}'


class WorkOrderStatus(models.TextChoices):
    """工单状态"""
    PENDING = 'pending', '待接单'
    ACCEPTED = 'accepted', '已接单'
    IN_PROGRESS = 'in_progress', '处理中'
    COMPLETED = 'completed', '已完成'
    CANCELLED = 'cancelled', '已取消'
    REJECTED = 'rejected', '已驳回'


class WorkOrderPriority(models.TextChoices):
    """工单优先级"""
    URGENT = 'urgent', '紧急'
    HIGH = 'high', '高'
    NORMAL = 'normal', '普通'
    LOW = 'low', '低'


class WorkOrder(models.Model):
    """告警处置工单"""
    work_order_id = models.CharField('工单号', max_length=64, unique=True, db_index=True)
    alert = models.ForeignKey(
        Alert,
        on_delete=models.CASCADE,
        related_name='work_orders',
        verbose_name='关联告警',
    )
    organization = models.ForeignKey(
        'users.Organization',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='work_orders',
        verbose_name='所属组织',
        db_index=True,
    )
    title = models.CharField('工单标题', max_length=256)
    description = models.TextField('工单说明', blank=True)
    priority = models.CharField(
        '优先级',
        max_length=16,
        choices=WorkOrderPriority.choices,
        default=WorkOrderPriority.NORMAL,
    )
    status = models.CharField(
        '工单状态',
        max_length=32,
        choices=WorkOrderStatus.choices,
        default=WorkOrderStatus.PENDING,
        db_index=True,
    )

    assignee = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_work_orders',
        verbose_name='处理人',
    )
    assignee_name = models.CharField('处理人姓名', max_length=128, blank=True)
    creator = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_work_orders',
        verbose_name='创建人',
    )
    creator_name = models.CharField('创建人姓名', max_length=128, blank=True)

    region = models.CharField('所属区域', max_length=128, blank=True)
    forest_zone = models.CharField('林区', max_length=128, blank=True)
    due_at = models.DateTimeField('截止时间', null=True, blank=True)
    accepted_at = models.DateTimeField('接单时间', null=True, blank=True)
    started_at = models.DateTimeField('开始处理时间', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    result_note = models.TextField('处理结果', blank=True)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        app_label = 'alerts'
        db_table = 'work_orders'
        verbose_name = '工单'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['assignee', 'status']),
        ]

    def __str__(self):
        return f'{self.work_order_id} ({self.get_status_display()})'
