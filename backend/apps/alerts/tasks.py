# apps/alerts/tasks.py
"""
Alert Celery tasks.
"""
from celery import shared_task
from django.utils import timezone
import uuid
import logging

from .models import Alert, FireTracing
from apps.devices.models import Device

logger = logging.getLogger(__name__)


def _create_alert_record(alert_data: dict) -> Alert:
    """同步创建告警记录（供 Celery 任务调用）"""
    from django.conf import settings as dj_settings

    device_id = alert_data['device_id']
    try:
        device = Device.objects.get(device_id=device_id)
    except Device.DoesNotExist:
        if not getattr(dj_settings, 'MQTT_AUTO_REGISTER_DEVICES', True):
            raise
        from core.mqtt_simulator import ensure_device_from_mqtt

        device = ensure_device_from_mqtt(device_id)

    alert_id = (
        f"ALERT-{timezone.now().strftime('%Y%m%d%H%M%S')}-"
        f"{uuid.uuid4().hex[:8].upper()}"
    )

    longitude = alert_data.get('longitude')
    latitude = alert_data.get('latitude')

    screenshot_url = alert_data.get('screenshot_url', '') or alert_data.get('screenshot', '') or ''
    thermal_url = alert_data.get('thermal_image_url', '') or alert_data.get('thermal_image', '') or ''

    # 媒体转存 MinIO
    try:
        from core.minio_storage import upload_base64, upload_from_url

        if screenshot_url:
            if screenshot_url.startswith('http://') or screenshot_url.startswith('https://'):
                screenshot_url = upload_from_url(
                    screenshot_url, prefix='alerts', device_id=device.device_id
                ) or screenshot_url
            elif not screenshot_url.startswith('http'):
                screenshot_url = upload_base64(
                    screenshot_url, prefix='alerts', device_id=device.device_id
                ) or ''
        if thermal_url:
            if thermal_url.startswith('http://') or thermal_url.startswith('https://'):
                thermal_url = upload_from_url(
                    thermal_url, prefix='alerts', device_id=device.device_id
                ) or thermal_url
            elif not thermal_url.startswith('http'):
                thermal_url = upload_base64(
                    thermal_url, prefix='alerts', device_id=device.device_id
                ) or ''
    except Exception as media_exc:
        logger.warning('Alert media upload skipped: %s', media_exc)

    # 强制归属设备所属组织，避免 Celery 旧逻辑/脏数据导致 organization 为空
    org_id = device.organization_id
    if org_id is None:
        # 再读一次，防止缓存对象缺字段
        org_id = (
            Device.objects.filter(pk=device.pk).values_list('organization_id', flat=True).first()
        )
    if org_id is None:
        logger.warning(
            'Alert for device %s has no organization_id; bureau scoped users will not see it until fixed',
            device.device_id,
        )

    return Alert.objects.create(
        alert_id=alert_id,
        device=device,
        organization_id=org_id,
        forest_zone_ref_id=getattr(device, 'forest_zone_ref_id', None),
        alert_type=alert_data['alert_type'],
        alert_level=alert_data['alert_level'],
        title=alert_data['title'],
        description=alert_data.get('description', '') or '',
        longitude=longitude,
        latitude=latitude,
        region=device.region or '',
        forest_zone=device.forest_zone or (
            getattr(getattr(device, 'forest_zone_ref', None), 'name', '') or ''
        ),
        ai_confidence=alert_data.get('ai_confidence'),
        ai_category=alert_data.get('ai_category', '') or '',
        screenshot_url=screenshot_url or '',
        thermal_image_url=thermal_url or '',
        occurred_at=timezone.now(),
    )


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 3},
    soft_time_limit=60,
    time_limit=90,
)
def process_alert(self, alert_data):
    """异步处理告警（API / MQTT 投递）"""
    try:
        alert = _create_alert_record(alert_data)
        logger.info('Alert created: %s for device %s', alert.alert_id, alert.device.device_id)

        # 火情/烟雾：异步启动溯源
        if alert.alert_type in ['fire', 'smoke']:
            run_fire_tracing.delay(alert.id)

        # 通知：一级/二级立即投递；三级也允许站内信（由渠道开关控制）
        if alert.alert_level in ['level_1', 'level_2', 'level_3']:
            send_notification.delay(
                alert.id,
                push_channels=alert_data.get('push_channels'),
            )

        return {'status': 'success', 'alert_id': alert.alert_id, 'id': alert.id}

    except Device.DoesNotExist:
        logger.error('Device not found: %s', alert_data.get('device_id'))
        raise
    except Exception as exc:
        logger.exception('Error processing alert: %s', exc)
        raise


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 2},
    soft_time_limit=45,
    time_limit=60,
)
def evaluate_telemetry_rules_task(self, device_id: str, telemetry_data: dict):
    """异步评估告警规则，命中后投递 process_alert。"""
    from apps.alerts.rule_engine import evaluate_telemetry_rules

    payloads = evaluate_telemetry_rules(device_id, telemetry_data or {})
    for alert_payload in payloads:
        process_alert.delay(alert_payload)
    return {'status': 'ok', 'triggered': len(payloads), 'device_id': device_id}

@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 3},
    soft_time_limit=120,
    time_limit=180,
)
def run_fire_tracing(self, alert_id):
    """执行火情溯源"""
    try:
        alert = Alert.objects.select_related('device').get(id=alert_id)

        if hasattr(alert, 'fire_tracing'):
            logger.info('Fire tracing already exists for alert %s', alert.alert_id)
            return {'status': 'exists', 'tracing_id': alert.fire_tracing.id}

        nearby_devices = Device.objects.filter(
            region=alert.region,
            organization_id=alert.organization_id,
        ).exclude(
            id=alert.device_id
        ) if alert.region else Device.objects.none()

        related_alerts = Alert.objects.filter(
            device__in=nearby_devices,
            alert_type__in=['fire', 'smoke'],
            occurred_at__gte=alert.occurred_at - timezone.timedelta(minutes=30),
            occurred_at__lte=alert.occurred_at + timezone.timedelta(minutes=30),
        )

        if related_alerts.exists():
            coords = [
                (a.longitude, a.latitude)
                for a in related_alerts
                if a.longitude is not None and a.latitude is not None
            ]
            if coords:
                avg_lon = sum(float(c[0]) for c in coords) / len(coords)
                avg_lat = sum(float(c[1]) for c in coords) / len(coords)
                confidence = 0.85
            else:
                avg_lon = float(alert.longitude or alert.device.longitude or 0)
                avg_lat = float(alert.latitude or alert.device.latitude or 0)
                confidence = 0.6
        else:
            avg_lon = float(alert.longitude or alert.device.longitude or 0)
            avg_lat = float(alert.latitude or alert.device.latitude or 0)
            confidence = 0.6

        fire_tracing = FireTracing.objects.create(
            alert=alert,
            origin_longitude=avg_lon,
            origin_latitude=avg_lat,
            origin_confidence=confidence,
            algorithm='FARSITE',
            input_devices=[d.device_id for d in nearby_devices] + [alert.device.device_id],
            weather_data={
                'wind_speed': 3.5,
                'wind_direction': 180,
                'temperature': 28,
                'humidity': 45,
            },
            spread_prediction_1h={
                'radius_km': 0.5,
                'area_km2': 0.78,
                'direction': 'north',
            },
            spread_prediction_3h={
                'radius_km': 1.5,
                'area_km2': 7.07,
                'direction': 'north',
            },
            spread_prediction_6h={
                'radius_km': 3.0,
                'area_km2': 28.27,
                'direction': 'north',
            },
            control_strategy={
                'isolation_belt': [
                    {'longitude': avg_lon - 0.01, 'latitude': avg_lat + 0.01},
                    {'longitude': avg_lon + 0.01, 'latitude': avg_lat + 0.01},
                ],
                'firefighting_devices': ['ZHL-001', 'ZHL-002'],
                'support_routes': [
                    {'start': '指挥中心', 'end': '起火点', 'distance_km': 5.2}
                ],
            },
        )

        logger.info('Fire tracing completed for alert %s', alert.alert_id)
        return {'status': 'success', 'tracing_id': fire_tracing.id}

    except Alert.DoesNotExist:
        logger.error('Alert not found: %s', alert_id)
        raise
    except Exception as exc:
        logger.exception('Error running fire tracing: %s', exc)
        raise


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 3},
    soft_time_limit=30,
    time_limit=60,
)
def send_notification(self, alert_id, push_channels=None):
    """
    发送告警通知。
    站内信：受组织 notify_in_app + 规则 push_channels 控制；接收人为本组织相关角色与值班人员。
    其它渠道（短信/语音/专线）预留，同样受组织开关约束。
    """
    try:
        alert = Alert.objects.select_related('device', 'organization').get(id=alert_id)

        title = f'[{alert.get_alert_level_display()}] {alert.title}'
        content = alert.description or alert.title
        device_id = alert.device.device_id if alert.device_id else ''
        org_id = getattr(alert, 'organization_id', None) or getattr(
            getattr(alert, 'device', None), 'organization_id', None
        )

        channels = push_channels
        if channels is None and getattr(alert, 'alert_type', None):
            # 尝试从同类型启用规则推断渠道
            try:
                from apps.alerts.models import AlertRule
                from django.db.models import Q

                rule_qs = AlertRule.objects.filter(
                    is_enabled=True,
                    alert_type=alert.alert_type,
                    alert_level=alert.alert_level,
                )
                if org_id:
                    rule_qs = rule_qs.filter(Q(is_system=True) | Q(organization_id=org_id))
                rule = rule_qs.order_by('alert_level', '-updated_at').first()
                if rule and rule.push_channels:
                    channels = list(rule.push_channels)
            except Exception:
                channels = None

        result: dict = {'alert_id': alert.alert_id, 'in_app': None}

        try:
            from apps.users.in_app_notify import dispatch_alert_in_app
            from apps.users.duty_roster import get_on_duty_users

            extra_ids: list[int] = []
            if org_id and alert.alert_level in ('level_1', 'level_2'):
                try:
                    extra_ids = [u.id for u in get_on_duty_users(org_id)]
                except Exception as duty_exc:
                    logger.warning('on-duty lookup skipped: %s', duty_exc)

            result['in_app'] = dispatch_alert_in_app(
                organization_id=org_id,
                title=title,
                content=content,
                alert_id=alert.alert_id,
                device_id=device_id,
                push_channels=channels,
                extra_user_ids=extra_ids,
            )
        except Exception as notify_exc:
            logger.warning('In-app notification dispatch skipped: %s', notify_exc)

        # 其它渠道：组织开关预留（短信/语音/专线/App），当前仅记日志
        try:
            from apps.users.models import OrganizationSettings

            if org_id:
                org_settings = OrganizationSettings.get_or_create_for_org(org_id)
                channel_set = {str(c) for c in (channels or ['in_app'])}
                if 'sms' in channel_set and org_settings.notify_sms and alert.alert_level in (
                    'level_1',
                    'level_2',
                ):
                    logger.info('SMS channel enabled (stub) alert=%s', alert.alert_id)
                if 'voice' in channel_set and org_settings.notify_voice_call and alert.alert_level == 'level_1':
                    logger.info('Voice channel enabled (stub) alert=%s', alert.alert_id)
                if (
                    'dedicated_line' in channel_set
                    and org_settings.notify_forestry_line
                    and alert.alert_level == 'level_1'
                ):
                    logger.info('Forestry line channel enabled (stub) alert=%s', alert.alert_id)
        except Exception as ch_exc:
            logger.debug('other notify channels skipped: %s', ch_exc)

        logger.info('Notification sent for alert %s result=%s', alert.alert_id, result)
        return {'status': 'success', **result}

    except Alert.DoesNotExist:
        logger.error('Alert not found: %s', alert_id)
        raise
