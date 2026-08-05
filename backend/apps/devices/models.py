"""
Device models for forest monitoring system.
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class DeviceType(models.TextChoices):
    """设备类型枚举"""
    DUAL_CAMERA = 'dual_camera', '双目智能监测云台'
    ENV_SENSOR = 'env_sensor', '多参数环境传感器'
    AI_GATEWAY = 'ai_gateway', 'AI边缘网关'
    DRONE = 'drone', '无人机'


class DeviceStatus(models.TextChoices):
    """设备状态枚举"""
    ONLINE = 'online', '在线'
    OFFLINE = 'offline', '离线'
    ALARM = 'alarm', '告警'
    MAINTENANCE = 'maintenance', '维护中'


class Device(models.Model):
    """设备主表"""
    device_id = models.CharField('设备ID', max_length=64, unique=True, db_index=True)
    device_name = models.CharField('设备名称', max_length=128)
    device_type = models.CharField('设备类型', max_length=32, choices=DeviceType.choices)
    status = models.CharField('设备状态', max_length=32, choices=DeviceStatus.choices, default=DeviceStatus.OFFLINE)
    
    # 位置信息
    longitude = models.DecimalField('经度', max_digits=10, decimal_places=6, null=True, blank=True)
    latitude = models.DecimalField('纬度', max_digits=10, decimal_places=6, null=True, blank=True)
    altitude = models.DecimalField('海拔', max_digits=8, decimal_places=2, null=True, blank=True)
    region = models.CharField('所属区域', max_length=128, blank=True)
    forest_zone = models.CharField('林区', max_length=128, blank=True)
    
    # 设备属性
    firmware_version = models.CharField('固件版本', max_length=32, blank=True)
    hardware_version = models.CharField('硬件版本', max_length=32, blank=True)
    manufacturer = models.CharField('厂商', max_length=128, blank=True)
    install_date = models.DateField('安装日期', null=True, blank=True)
    last_maintenance = models.DateField('最后维护日期', null=True, blank=True)
    
    # 通信参数
    communication_type = models.CharField('通信方式', max_length=32, choices=[
        ('4g', '4G'),
        ('lora', 'LoRa'),
        ('wifi', 'WiFi'),
        ('ethernet', '有线'),
    ], default='4g')
    signal_strength = models.IntegerField('信号强度', validators=[MinValueValidator(0), MaxValueValidator(5)], default=0)
    battery_level = models.IntegerField('电池电量', validators=[MinValueValidator(0), MaxValueValidator(100)], null=True, blank=True)
    
    # 云台参数（双目云台专用）
    pan_angle = models.DecimalField('水平角度', max_digits=6, decimal_places=2, null=True, blank=True)
    tilt_angle = models.DecimalField('垂直角度', max_digits=6, decimal_places=2, null=True, blank=True)
    
    # 时间戳
    last_online_time = models.DateTimeField('最后在线时间', null=True, blank=True)
    last_heartbeat = models.DateTimeField('最后心跳', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'devices'
        verbose_name = '设备'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['device_type', 'status']),
            models.Index(fields=['region', 'forest_zone']),
            models.Index(fields=['last_online_time']),
        ]
    
    def __str__(self):
        return f'{self.device_name} ({self.device_id})'


class DeviceTelemetry(models.Model):
    """设备遥测数据（PostgreSQL 存储最近数据，历史数据在 TDengine）"""
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='telemetry')
    timestamp = models.DateTimeField('采集时间', db_index=True)
    
    # 环境参数
    temperature = models.FloatField('温度', null=True, blank=True)
    humidity = models.FloatField('湿度', null=True, blank=True)
    wind_speed = models.FloatField('风速', null=True, blank=True)
    wind_direction = models.IntegerField('风向', null=True, blank=True)
    light_intensity = models.FloatField('光照强度', null=True, blank=True)
    
    # 土壤参数
    soil_moisture_10cm = models.FloatField('10cm土壤湿度', null=True, blank=True)
    soil_moisture_30cm = models.FloatField('30cm土壤湿度', null=True, blank=True)
    soil_moisture_60cm = models.FloatField('60cm土壤湿度', null=True, blank=True)
    
    # 可燃物参数
    fuel_moisture = models.FloatField('可燃物含水率', null=True, blank=True)
    
    # 云台状态
    video_status = models.CharField('视频状态', max_length=32, choices=[
        ('normal', '正常'),
        ('blurry', '模糊'),
        ('obstructed', '遮挡'),
        ('no_signal', '无信号'),
    ], null=True, blank=True)
    
    # 热成像数据
    thermal_max_temp = models.FloatField('最高温度', null=True, blank=True)
    thermal_min_temp = models.FloatField('最低温度', null=True, blank=True)
    thermal_avg_temp = models.FloatField('平均温度', null=True, blank=True)
    thermal_hotspot_x = models.IntegerField('热源X坐标', null=True, blank=True)
    thermal_hotspot_y = models.IntegerField('热源Y坐标', null=True, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    
    class Meta:
        db_table = 'device_telemetry'
        verbose_name = '设备遥测数据'
        verbose_name_plural = verbose_name
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['device', '-timestamp']),
            models.Index(fields=['-timestamp']),
        ]


class DeviceCommand(models.Model):
    """设备指令记录"""
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='commands')
    command_type = models.CharField('指令类型', max_length=64)
    command_params = models.JSONField('指令参数', default=dict)
    
    # 指令状态
    STATUS_CHOICES = [
        ('pending', '待发送'),
        ('sent', '已发送'),
        ('delivered', '已送达'),
        ('executed', '已执行'),
        ('failed', '失败'),
        ('timeout', '超时'),
    ]
    status = models.CharField('指令状态', max_length=32, choices=STATUS_CHOICES, default='pending')
    
    # 执行结果
    result = models.JSONField('执行结果', null=True, blank=True)
    error_message = models.TextField('错误信息', blank=True)
    
    # 时间戳
    sent_at = models.DateTimeField('发送时间', null=True, blank=True)
    delivered_at = models.DateTimeField('送达时间', null=True, blank=True)
    executed_at = models.DateTimeField('执行时间', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    
    class Meta:
        app_label = 'devices'  # ✅ 添加这一行
        db_table = 'device_commands'
        verbose_name = '设备指令'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']
