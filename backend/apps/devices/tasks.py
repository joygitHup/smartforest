"""
Device Celery tasks.
"""
from celery import shared_task
from django.utils import timezone
import logging

from .models import Device, DeviceCommand

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def send_ptz_command(self, device_id, direction, speed=5):
    """发送云台控制指令"""
    try:
        device = Device.objects.get(device_id=device_id)
        
        # 创建指令记录
        command = DeviceCommand.objects.create(
            device=device,
            command_type='ptz_control',
            command_params={'direction': direction, 'speed': speed},
            status='pending'
        )
        
        # TODO: 通过 MQTT 发送指令到设备
        # from core.mqtt_client import publish_command
        # publish_command(device_id, 'ptz_control', command.command_params)
        
        # 更新指令状态
        command.status = 'sent'
        command.sent_at = timezone.now()
        command.save()
        
        logger.info(f'PTZ command sent to device {device_id}: {direction}')
        return {'status': 'success', 'command_id': command.id}
        
    except Device.DoesNotExist:
        logger.error(f'Device not found: {device_id}')
        raise
    except Exception as exc:
        logger.error(f'Error sending PTZ command: {exc}')
        self.retry(exc=exc, countdown=60)


@shared_task(bind=True, max_retries=3)
def send_device_command(self, device_id, command_type, command_params=None):
    """发送设备指令"""
    try:
        device = Device.objects.get(device_id=device_id)
        
        # 创建指令记录
        command = DeviceCommand.objects.create(
            device=device,
            command_type=command_type,
            command_params=command_params or {},
            status='pending'
        )
        
        # TODO: 通过 MQTT 发送指令到设备
        # from core.mqtt_client import publish_command
        # publish_command(device_id, command_type, command_params)
        
        # 更新指令状态
        command.status = 'sent'
        command.sent_at = timezone.now()
        command.save()
        
        logger.info(f'Command sent to device {device_id}: {command_type}')
        return {'status': 'success', 'command_id': command.id}
        
    except Device.DoesNotExist:
        logger.error(f'Device not found: {device_id}')
        raise
    except Exception as exc:
        logger.error(f'Error sending command: {exc}')
        self.retry(exc=exc, countdown=60)


@shared_task
def update_device_status(device_id, status, last_online_time=None):
    """更新设备状态"""
    try:
        device = Device.objects.get(device_id=device_id)
        device.status = status
        if last_online_time:
            device.last_online_time = last_online_time
        device.last_heartbeat = timezone.now()
        device.save()
        
        logger.info(f'Device {device_id} status updated: {status}')
        return {'status': 'success'}
        
    except Device.DoesNotExist:
        logger.error(f'Device not found: {device_id}')
        raise


@shared_task
def process_device_telemetry(device_id, telemetry_data):
    """处理设备遥测数据"""
    try:
        device = Device.objects.get(device_id=device_id)
        
        # 创建遥测数据记录
        telemetry = DeviceTelemetry.objects.create(
            device=device,
            timestamp=timezone.now(),
            temperature=telemetry_data.get('temperature'),
            humidity=telemetry_data.get('humidity'),
            wind_speed=telemetry_data.get('wind_speed'),
            wind_direction=telemetry_data.get('wind_direction'),
            light_intensity=telemetry_data.get('light_intensity'),
            soil_moisture_10cm=telemetry_data.get('soil_moisture_10cm'),
            soil_moisture_30cm=telemetry_data.get('soil_moisture_30cm'),
            soil_moisture_60cm=telemetry_data.get('soil_moisture_60cm'),
            fuel_moisture=telemetry_data.get('fuel_moisture'),
            video_status=telemetry_data.get('video_status'),
            thermal_max_temp=telemetry_data.get('thermal_max_temp'),
            thermal_min_temp=telemetry_data.get('thermal_min_temp'),
            thermal_avg_temp=telemetry_data.get('thermal_avg_temp'),
            thermal_hotspot_x=telemetry_data.get('thermal_hotspot_x'),
            thermal_hotspot_y=telemetry_data.get('thermal_hotspot_y'),
        )
        
        # TODO: 同步写入 TDengine
        # from core.tdengine_client import write_telemetry
        # write_telemetry(device_id, telemetry_data)
        
        logger.info(f'Telemetry processed for device {device_id}')
        return {'status': 'success', 'telemetry_id': telemetry.id}
        
    except Device.DoesNotExist:
        logger.error(f'Device not found: {device_id}')
        raise
    except Exception as exc:
        logger.error(f'Error processing telemetry: {exc}')
        raise
