# apps/devices/tasks.py
"""
Device Celery tasks — 遥测入库 / 指令下发 / Kafka 消息分发 / ACK。
"""
from celery import shared_task
from django.utils import timezone
import logging

from .models import Device, DeviceCommand, DeviceTelemetry
from .command_control import (
    new_correlation_id,
    push_command_status,
    push_device_pose,
)

logger = logging.getLogger(__name__)


def _serialize_command(command: DeviceCommand) -> dict:
    return {
        'id': command.id,
        'device_id': command.device.device_id,
        'command_type': command.command_type,
        'command_params': command.command_params,
        'correlation_id': command.correlation_id,
        'status': command.status,
        'status_display': command.get_status_display(),
        'result': command.result,
        'error_message': command.error_message,
        'operator_id': command.operator_id,
        'sent_at': command.sent_at.isoformat() if command.sent_at else None,
        'executed_at': command.executed_at.isoformat() if command.executed_at else None,
        'created_at': command.created_at.isoformat() if command.created_at else None,
    }


def _publish_and_mark_sent(command: DeviceCommand, device_id: str) -> None:
    params = dict(command.command_params or {})
    params['command_id'] = command.id
    params['correlation_id'] = command.correlation_id
    try:
        from core.mqtt_client import publish_command
        ok = publish_command(device_id, command.command_type, params)
        if not ok:
            command.status = 'failed'
            command.error_message = 'MQTT 发布失败'
            command.save(update_fields=['status', 'error_message'])
            push_command_status(device_id, _serialize_command(command))
            return
    except Exception as mqtt_exc:
        logger.warning('MQTT publish failed: %s', mqtt_exc)
        command.status = 'failed'
        command.error_message = str(mqtt_exc)
        command.save(update_fields=['status', 'error_message'])
        push_command_status(device_id, _serialize_command(command))
        return

    command.status = 'sent'
    command.sent_at = timezone.now()
    command.save(update_fields=['status', 'sent_at'])
    push_command_status(device_id, _serialize_command(command))


@shared_task(bind=True, max_retries=3, soft_time_limit=30, time_limit=60)
def publish_pending_command(self, command_id: int):
    """异步发布已落库的指令。"""
    try:
        command = DeviceCommand.objects.select_related('device').get(id=command_id)
        _publish_and_mark_sent(command, command.device.device_id)
        return {'status': 'success', 'command_id': command.id}
    except DeviceCommand.DoesNotExist:
        logger.error('Command not found: %s', command_id)
        raise
    except Exception as exc:
        logger.error('Error publishing command: %s', exc)
        self.retry(exc=exc, countdown=30)


@shared_task(bind=True, max_retries=3, soft_time_limit=30, time_limit=60)
def send_ptz_command(self, device_id, direction, speed=5, operator_id=None, correlation_id=None):
    """兼容旧调用：创建并发送云台指令。"""
    try:
        device = Device.objects.get(device_id=device_id)
        command = DeviceCommand.objects.create(
            device=device,
            command_type='ptz_control',
            command_params={'direction': direction, 'speed': speed},
            correlation_id=correlation_id or new_correlation_id(),
            operator_id=operator_id,
            status='pending',
        )
        _publish_and_mark_sent(command, device_id)
        logger.info('PTZ command sent to device %s: %s', device_id, direction)
        return {'status': 'success', 'command_id': command.id, 'correlation_id': command.correlation_id}
    except Device.DoesNotExist:
        logger.error('Device not found: %s', device_id)
        raise
    except Exception as exc:
        logger.error('Error sending PTZ command: %s', exc)
        self.retry(exc=exc, countdown=60)


@shared_task(bind=True, max_retries=3, soft_time_limit=30, time_limit=60)
def send_device_command(
    self,
    device_id,
    command_type,
    command_params=None,
    operator_id=None,
    correlation_id=None,
):
    """发送设备指令"""
    try:
        device = Device.objects.get(device_id=device_id)
        command = DeviceCommand.objects.create(
            device=device,
            command_type=command_type,
            command_params=command_params or {},
            correlation_id=correlation_id or new_correlation_id(),
            operator_id=operator_id,
            status='pending',
        )
        _publish_and_mark_sent(command, device_id)
        logger.info('Command sent to device %s: %s', device_id, command_type)
        return {'status': 'success', 'command_id': command.id, 'correlation_id': command.correlation_id}
    except Device.DoesNotExist:
        logger.error('Device not found: %s', device_id)
        raise
    except Exception as exc:
        logger.error('Error sending command: %s', exc)
        self.retry(exc=exc, countdown=60)


@shared_task(bind=True, max_retries=2, soft_time_limit=30, time_limit=60)
def process_command_ack(self, device_id, payload):
    """
    处理设备指令 ACK。
    payload 期望:
      command_id / correlation_id
      status: delivered|executed|failed
      result: {pan_angle, tilt_angle, ...}
      error_message
    """
    data = dict(payload or {})
    command = None
    cmd_id = data.get('command_id')
    corr = data.get('correlation_id')

    if cmd_id:
        command = DeviceCommand.objects.select_related('device').filter(id=cmd_id).first()
    if command is None and corr:
        command = (
            DeviceCommand.objects.select_related('device')
            .filter(device__device_id=device_id, correlation_id=corr)
            .order_by('-created_at')
            .first()
        )
    if command is None:
        # 无匹配时仍可更新姿态
        logger.warning('ACK without matching command for device %s: %s', device_id, data)
    else:
        ack_status = (data.get('status') or 'executed').lower()
        if ack_status not in {'delivered', 'executed', 'failed', 'timeout'}:
            ack_status = 'executed'
        command.status = ack_status
        if ack_status == 'delivered':
            command.delivered_at = timezone.now()
        if ack_status in {'executed', 'failed', 'timeout'}:
            command.executed_at = timezone.now()
        command.result = data.get('result') or data.get('params') or command.result
        command.error_message = data.get('error_message') or data.get('error') or ''
        command.save()
        push_command_status(device_id, _serialize_command(command))

    result = data.get('result') or {}
    pan = result.get('pan_angle', data.get('pan_angle'))
    tilt = result.get('tilt_angle', data.get('tilt_angle'))
    if pan is not None or tilt is not None:
        try:
            device = Device.objects.get(device_id=device_id)
            update_fields = ['updated_at']
            if pan is not None:
                device.pan_angle = pan
                update_fields.append('pan_angle')
            if tilt is not None:
                device.tilt_angle = tilt
                update_fields.append('tilt_angle')
            device.save(update_fields=update_fields)
            push_device_pose(device_id, device.pan_angle, device.tilt_angle, {'source': 'ack'})
        except Device.DoesNotExist:
            pass

    return {'status': 'ok', 'command_id': command.id if command else None}


@shared_task(bind=True, max_retries=3)
def update_device_status(self, device_id, status, last_online_time=None):
    """更新设备状态"""
    try:
        from django.conf import settings as dj_settings

        try:
            device = Device.objects.get(device_id=device_id)
        except Device.DoesNotExist:
            if not getattr(dj_settings, 'MQTT_AUTO_REGISTER_DEVICES', True):
                logger.error('Device not found: %s', device_id)
                raise
            from core.mqtt_simulator import ensure_device_from_mqtt

            device = ensure_device_from_mqtt(device_id)

        device.status = status
        if last_online_time:
            device.last_online_time = last_online_time
        else:
            device.last_online_time = timezone.now()
        device.last_heartbeat = timezone.now()
        device.save()

        logger.info('Device %s status updated: %s', device_id, status)
        return {'status': 'success'}

    except Device.DoesNotExist:
        logger.error('Device not found: %s', device_id)
        raise


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 3},
    soft_time_limit=60,
    time_limit=90,
)
def process_device_telemetry(self, device_id, telemetry_data):
    """
    处理设备遥测（快路径）：
    1) PostgreSQL 业务库 + 设备状态
    2) 异步批量写 InfluxDB
    3) 异步告警规则评估

    入口限流在 MQTT/_forward（及管线入口），此处不再重复 mark，避免双限流丢数。
    """
    from django.conf import settings as dj_settings

    try:
        device = Device.objects.get(device_id=device_id)
    except Device.DoesNotExist:
        if not getattr(dj_settings, 'MQTT_AUTO_REGISTER_DEVICES', True):
            logger.error('Device not found for telemetry: %s', device_id)
            raise
        from core.mqtt_simulator import ensure_device_from_mqtt

        device = ensure_device_from_mqtt(device_id)

    data = dict(telemetry_data or {})

    # MinIO：截图/热成像转存（有媒体才做）
    if any(
        isinstance(data.get(k), str) and data.get(k)
        for k in (
            'screenshot', 'screenshot_url', 'thermal_image', 'thermal_image_url',
            'video', 'video_url',
        )
    ):
        try:
            from core.minio_storage import upload_base64, upload_from_url

            for src_key, dst_key in (
                ('screenshot', 'screenshot_url'),
                ('screenshot_url', 'screenshot_url'),
                ('thermal_image', 'thermal_image_url'),
                ('thermal_image_url', 'thermal_image_url'),
                ('video', 'video_url'),
                ('video_url', 'video_url'),
            ):
                raw = data.get(src_key)
                if not raw or not isinstance(raw, str):
                    continue
                if raw.startswith('http://') or raw.startswith('https://'):
                    url = upload_from_url(raw, prefix='telemetry', device_id=device_id)
                else:
                    url = upload_base64(raw, prefix='telemetry', device_id=device_id)
                if url:
                    data[dst_key] = url
        except Exception as media_exc:
            logger.warning('Telemetry media upload skipped: %s', media_exc)

    telemetry = DeviceTelemetry.objects.create(
        device=device,
        timestamp=timezone.now(),
        temperature=data.get('temperature'),
        humidity=data.get('humidity'),
        wind_speed=data.get('wind_speed'),
        wind_direction=data.get('wind_direction'),
        light_intensity=data.get('light_intensity'),
        soil_moisture_10cm=data.get('soil_moisture_10cm'),
        soil_moisture_30cm=data.get('soil_moisture_30cm'),
        soil_moisture_60cm=data.get('soil_moisture_60cm'),
        fuel_moisture=data.get('fuel_moisture'),
        video_status=data.get('video_status'),
        thermal_max_temp=data.get('thermal_max_temp'),
        thermal_min_temp=data.get('thermal_min_temp'),
        thermal_avg_temp=data.get('thermal_avg_temp'),
        thermal_hotspot_x=data.get('thermal_hotspot_x'),
        thermal_hotspot_y=data.get('thermal_hotspot_y'),
    )

    # InfluxDB：异步批量（失败不影响主流程）
    flush_influxdb_telemetry_batch.delay([{
        'device_id': device.device_id,
        'device_type': device.device_type,
        'region': device.region or '',
        'telemetry_data': data,
    }])

    # 更新设备实时字段
    update_fields = ['last_heartbeat', 'updated_at']
    device.last_heartbeat = timezone.now()
    device.last_online_time = timezone.now()
    if device.status == 'offline':
        device.status = 'online'
        update_fields.append('status')
    if data.get('battery_level') is not None:
        device.battery_level = data.get('battery_level')
        update_fields.append('battery_level')
    if data.get('signal_strength') is not None:
        device.signal_strength = data.get('signal_strength')
        update_fields.append('signal_strength')
    pose_changed = False
    if data.get('pan_angle') is not None:
        device.pan_angle = data.get('pan_angle')
        update_fields.append('pan_angle')
        pose_changed = True
    if data.get('tilt_angle') is not None:
        device.tilt_angle = data.get('tilt_angle')
        update_fields.append('tilt_angle')
        pose_changed = True
    device.save(update_fields=update_fields)

    if pose_changed:
        push_device_pose(device_id, device.pan_angle, device.tilt_angle, {'source': 'telemetry'})

    # 规则引擎：异步到 alerts 队列
    try:
        from apps.alerts.tasks import evaluate_telemetry_rules_task

        evaluate_telemetry_rules_task.delay(device_id, data)
    except Exception as rule_exc:
        logger.warning('Alert rule enqueue skipped: %s', rule_exc)

    logger.info('Telemetry processed for device %s id=%s', device_id, telemetry.id)
    return {'status': 'success', 'telemetry_id': telemetry.id}


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 2},
    soft_time_limit=60,
    time_limit=90,
)
def flush_influxdb_telemetry_batch(self, rows: list):
    """批量写 InfluxDB（可由单条或多条组成）。"""
    if not rows:
        return {'status': 'empty'}
    try:
        from core.influxdb_client import write_telemetry_batch

        written = write_telemetry_batch(rows)
        return {'status': 'ok', 'written': written, 'requested': len(rows)}
    except Exception as exc:
        logger.warning('InfluxDB batch flush failed: %s', exc)
        raise


@shared_task(bind=True, max_retries=3, soft_time_limit=30, time_limit=60)
def dispatch_kafka_message(self, topic: str, message: dict):
    """
    消费 Kafka 消息后的统一分发入口。
    按类型投递到独立队列任务，避免在同一 worker 内串行重活。
    """
    if not isinstance(message, dict):
        logger.error('Kafka message is not a dict: %s', type(message))
        return {'status': 'error', 'reason': 'invalid message'}

    device_id = message.get('device_id')
    message_type = message.get('message_type')
    payload = message.get('payload') or {}

    if not device_id or not message_type:
        if topic.endswith('.telemetry'):
            message_type = message_type or 'telemetry'
        elif topic.endswith('.alert'):
            message_type = message_type or 'alert'
        elif topic.endswith('.status'):
            message_type = message_type or 'status'
        elif topic.endswith('.response'):
            message_type = message_type or 'response'
        device_id = device_id or payload.get('device_id')

    if not device_id:
        logger.warning('Kafka message missing device_id, ignored: keys=%s', list(message.keys()))
        return {'status': 'ignored', 'reason': 'missing device_id'}

    if message_type == 'telemetry':
        process_device_telemetry.delay(device_id, payload)
        return {'status': 'queued', 'message_type': 'telemetry'}
    if message_type == 'alert':
        from apps.alerts.tasks import process_alert

        process_alert.delay({'device_id': device_id, **payload})
        return {'status': 'queued', 'message_type': 'alert'}
    if message_type == 'status':
        update_device_status.delay(
            device_id,
            payload.get('status', 'offline'),
            payload.get('timestamp'),
        )
        return {'status': 'queued', 'message_type': 'status'}
    if message_type in ('response', 'ack', 'command_ack'):
        process_command_ack.delay(device_id, payload)
        return {'status': 'queued', 'message_type': 'response'}

    logger.warning('Unknown Kafka message_type=%s topic=%s', message_type, topic)
    return {'status': 'ignored', 'message_type': message_type}
