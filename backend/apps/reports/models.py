"""
Report models for forest monitoring system.
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class DailyReport(models.Model):
    """日报"""
    report_date = models.DateField('报告日期', unique=True, db_index=True)
    
    # 设备统计
    total_devices = models.IntegerField('设备总数', default=0)
    online_devices = models.IntegerField('在线设备', default=0)
    online_rate = models.FloatField('在线率', validators=[MinValueValidator(0), MaxValueValidator(100)], default=0)
    
    # 告警统计
    total_alerts = models.IntegerField('告警总数', default=0)
    resolved_alerts = models.IntegerField('已处置告警', default=0)
    resolution_rate = models.FloatField('处置率', validators=[MinValueValidator(0), MaxValueValidator(100)], default=0)
    avg_response_time = models.IntegerField('平均响应时间(秒)', default=0)
    false_alarm_count = models.IntegerField('误报数量', default=0)
    false_alarm_rate = models.FloatField('误报率', validators=[MinValueValidator(0), MaxValueValidator(100)], default=0)
    
    # 环境数据
    avg_temperature = models.FloatField('平均温度', null=True, blank=True)
    max_temperature = models.FloatField('最高温度', null=True, blank=True)
    avg_humidity = models.FloatField('平均湿度', null=True, blank=True)
    avg_wind_speed = models.FloatField('平均风速', null=True, blank=True)
    
    # 碳汇数据
    carbon_sequestration = models.FloatField('碳汇值(吨)', default=0)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'daily_reports'
        verbose_name = '日报'
        verbose_name_plural = verbose_name
        ordering = ['-report_date']


class DeviceStatistics(models.Model):
    """设备统计"""
    device = models.ForeignKey('devices.Device', on_delete=models.CASCADE, related_name='statistics')
    stat_date = models.DateField('统计日期', db_index=True)
    
    # 运行统计
    uptime_hours = models.FloatField('在线时长(小时)', default=0)
    availability_rate = models.FloatField('可用率', validators=[MinValueValidator(0), MaxValueValidator(100)], default=0)
    
    # 告警统计
    alert_count = models.IntegerField('告警次数', default=0)
    fault_count = models.IntegerField('故障次数', default=0)
    
    # 数据质量
    data_completeness = models.FloatField('数据完整率', validators=[MinValueValidator(0), MaxValueValidator(100)], default=0)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    
    class Meta:
        db_table = 'device_statistics'
        verbose_name = '设备统计'
        verbose_name_plural = verbose_name
        ordering = ['-stat_date']
        unique_together = ['device', 'stat_date']


class EnvironmentalData(models.Model):
    """环境数据汇总"""
    region = models.CharField('区域', max_length=128, db_index=True)
    stat_date = models.DateField('统计日期', db_index=True)
    stat_hour = models.IntegerField('统计小时', validators=[MinValueValidator(0), MaxValueValidator(23)], null=True, blank=True)
    
    # 环境参数
    avg_temperature = models.FloatField('平均温度', null=True, blank=True)
    max_temperature = models.FloatField('最高温度', null=True, blank=True)
    min_temperature = models.FloatField('最低温度', null=True, blank=True)
    
    avg_humidity = models.FloatField('平均湿度', null=True, blank=True)
    max_humidity = models.FloatField('最高湿度', null=True, blank=True)
    min_humidity = models.FloatField('最低湿度', null=True, blank=True)
    
    avg_wind_speed = models.FloatField('平均风速', null=True, blank=True)
    max_wind_speed = models.FloatField('最大风速', null=True, blank=True)
    
    avg_light_intensity = models.FloatField('平均光照强度', null=True, blank=True)
    
    # 土壤参数
    avg_soil_moisture = models.FloatField('平均土壤湿度', null=True, blank=True)
    avg_fuel_moisture = models.FloatField('平均可燃物含水率', null=True, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    
    class Meta:
        db_table = 'environmental_data'
        verbose_name = '环境数据汇总'
        verbose_name_plural = verbose_name
        ordering = ['-stat_date', '-stat_hour']
        unique_together = ['region', 'stat_date', 'stat_hour']
