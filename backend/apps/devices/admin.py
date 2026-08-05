"""
Device admin configuration.
"""
from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
import datetime

from .models import Device, DeviceTelemetry, DeviceCommand, DeviceType, DeviceStatus


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    """设备管理后台"""
    list_display = [
        'id', 'device_id', 'device_name', 'device_type_badge',
        'status_badge', 'region', 'signal_strength', 'battery_level_badge',
        'last_online_time', 'is_healthy'
    ]
    list_filter = ['device_type', 'status', 'region', 'communication_type']
    search_fields = ['device_id', 'device_name', 'region', 'forest_zone']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = (
        ('基本信息', {
            'fields': ('device_id', 'device_name', 'device_type', 'status')
        }),
        ('位置信息', {
            'fields': ('longitude', 'latitude', 'altitude', 'region', 'forest_zone')
        }),
        ('设备属性', {
            'fields': ('firmware_version', 'hardware_version', 'manufacturer', 'install_date', 'last_maintenance')
        }),
        ('通信参数', {
            'fields': ('communication_type', 'signal_strength', 'battery_level')
        }),
        ('云台参数', {
            'fields': ('pan_angle', 'tilt_angle'),
            'classes': ('collapse',)
        }),
        ('时间戳', {
            'fields': ('last_online_time', 'last_heartbeat', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def status_badge(self, obj):
        """状态标签"""
        colors = {
            'online': '#28a745',
            'offline': '#6c757d',
            'alarm': '#dc3545',
            'maintenance': '#fd7e14'
        }
        color = colors.get(obj.status, '#6c757d')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; '
            'border-radius: 4px; font-size: 12px;">{}</span>',
            color, obj.get_status_display()
        )

    status_badge.short_description = '状态'

    def device_type_badge(self, obj):
        """设备类型标签"""
        colors = {
            'dual_camera': '#007bff',
            'env_sensor': '#17a2b8',
            'ai_gateway': '#6f42c1',
            'drone': '#28a745'
        }
        color = colors.get(obj.device_type, '#6c757d')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; '
            'border-radius: 4px; font-size: 12px;">{}</span>',
            color, obj.get_device_type_display()
        )

    device_type_badge.short_description = '设备类型'

    def battery_level_badge(self, obj):
        """电池电量标签"""
        if obj.battery_level is None:
            return '-'
        if obj.battery_level < 20:
            color = '#dc3545'
        elif obj.battery_level < 50:
            color = '#fd7e14'
        else:
            color = '#28a745'
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}%</span>',
            color, obj.battery_level
        )

    battery_level_badge.short_description = '电量'

    def is_healthy(self, obj):
        """是否健康（5分钟内有心跳）"""
        if not obj.last_heartbeat:
            return format_html('<span style="color: #6c757d;">未知</span>')

        delta = timezone.now() - obj.last_heartbeat
        if delta < datetime.timedelta(minutes=5):
            return format_html('<span style="color: #28a745;">✓ 健康</span>')
        else:
            return format_html('<span style="color: #dc3545;">✗ 失联</span>')

    is_healthy.short_description = '健康状态'

    actions = ['mark_online', 'mark_offline', 'mark_maintenance', 'mark_alarm']

    def mark_online(self, request, queryset):
        queryset.update(status='online', last_online_time=timezone.now(), last_heartbeat=timezone.now())

    mark_online.short_description = '标记为在线'

    def mark_offline(self, request, queryset):
        queryset.update(status='offline')

    mark_offline.short_description = '标记为离线'

    def mark_maintenance(self, request, queryset):
        queryset.update(status='maintenance')

    mark_maintenance.short_description = '标记为维护中'

    def mark_alarm(self, request, queryset):
        queryset.update(status='alarm')

    mark_alarm.short_description = '标记为告警'


@admin.register(DeviceTelemetry)
class DeviceTelemetryAdmin(admin.ModelAdmin):
    """遥测数据后台"""
    list_display = [
        'id', 'device', 'timestamp', 'temperature', 'humidity',
        'wind_speed', 'thermal_max_temp'
    ]
    list_filter = ['device', 'video_status']
    search_fields = ['device__device_id', 'device__device_name']
    readonly_fields = ['created_at']
    date_hierarchy = 'timestamp'

    def get_queryset(self, request):
        """仅显示最近1000条，避免后台卡顿"""
        return super().get_queryset(request)[:1000]


@admin.register(DeviceCommand)
class DeviceCommandAdmin(admin.ModelAdmin):
    """指令记录后台"""
    list_display = ['id', 'device', 'command_type', 'status_badge', 'created_at', 'executed_at']
    list_filter = ['status', 'command_type']
    search_fields = ['device__device_id', 'device__device_name']
    readonly_fields = ['created_at']

    def status_badge(self, obj):
        """状态标签"""
        colors = {
            'pending': '#ffc107',
            'sent': '#17a2b8',
            'delivered': '#007bff',
            'executed': '#28a745',
            'failed': '#dc3545',
            'timeout': '#6c757d'
        }
        color = colors.get(obj.status, '#6c757d')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; '
            'border-radius: 4px; font-size: 12px;">{}</span>',
            color, obj.get_status_display()
        )

    status_badge.short_description = '状态'