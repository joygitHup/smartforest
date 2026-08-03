"""
Alert Celery tasks.
"""
from celery import shared_task
from django.utils import timezone
from django.db import transaction
import uuid
import logging

from .models import Alert, AlertAction, FireTracing
from apps.devices.models import Device

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def process_alert(self, alert_data):
    """处理告警（从 MQTT 接收）"""
    try:
        device = Device.objects.get(device_id=alert_data['device_id'])
        
        # 生成告警ID
        alert_id = f"ALERT-{timezone.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8].upper()}"
        
        # 创建告警记录
        alert = Alert.objects.create(
            alert_id=alert_id,
            device=device,
            alert_type=alert_data['alert_type'],
            alert_level=alert_data['alert_level'],
            title=alert_data['title'],
            description=alert_data.get('description', ''),
            longitude=alert_data.get('longitude'),
            latitude=alert_data.get('latitude'),
            region=device.region,
            forest_zone=device.forest_zone,
            ai_confidence=alert_data.get('ai_confidence'),
            ai_category=alert_data.get('ai_category', ''),
            screenshot_url=alert_data.get('screenshot_url', ''),
            thermal_image_url=alert_data.get('thermal_image_url', ''),
            occurred_at=timezone.now()
        )
        
        logger.info(f'Alert created: {alert_id} for device {device.device_id}')
        
        # TODO: 通过 WebSocket 推送到大屏
        # from core.websocket_client import push_alert_to_dashboard
        # push_alert_to_dashboard(alert)
        
        # TODO: 根据告警级别发送通知
        # if alert.alert_level in ['level_1', 'level_2']:
        #     send_notification.delay(alert.id)
        
        return {'status': 'success', 'alert_id': alert_id}
        
    except Device.DoesNotExist:
        logger.error(f"Device not found: {alert_data['device_id']}")
        raise
    except Exception as exc:
        logger.error(f'Error processing alert: {exc}')
        self.retry(exc=exc, countdown=60)


@shared_task(bind=True, max_retries=3)
def run_fire_tracing(self, alert_id):
    """执行火情溯源"""
    try:
        alert = Alert.objects.get(id=alert_id)
        
        # 获取周边设备告警记录
        nearby_devices = Device.objects.filter(
            region=alert.region
        ).exclude(id=alert.device_id)
        
        # 获取周边设备的告警记录
        related_alerts = Alert.objects.filter(
            device__in=nearby_devices,
            alert_type__in=['fire', 'smoke'],
            occurred_at__gte=alert.occurred_at - timezone.timedelta(minutes=30),
            occurred_at__lte=alert.occurred_at + timezone.timedelta(minutes=30)
        )
        
        # 计算起火点（简化算法：多设备交叉定位）
        # 实际应使用 FARSITE 算法
        if related_alerts.exists():
            # 使用多设备告警位置的平均值作为起火点
            avg_lon = sum(a.longitude for a in related_alerts if a.longitude) / max(1, related_alerts.filter(longitude__isnull=False).count())
            avg_lat = sum(a.latitude for a in related_alerts if a.latitude) / max(1, related_alerts.filter(latitude__isnull=False).count())
            confidence = 0.85
        else:
            # 仅使用当前告警位置
            avg_lon = alert.longitude or alert.device.longitude
            avg_lat = alert.latitude or alert.device.latitude
            confidence = 0.6
        
        # 创建火情溯源记录
        fire_tracing = FireTracing.objects.create(
            alert=alert,
            origin_longitude=avg_lon,
            origin_latitude=avg_lat,
            origin_confidence=confidence,
            algorithm='FARSITE',
            input_devices=[a.device.device_id for a in related_alerts] + [alert.device.device_id],
            weather_data={
                'wind_speed': 3.5,
                'wind_direction': 180,
                'temperature': 28,
                'humidity': 45
            },
            spread_prediction_1h={
                'radius_km': 0.5,
                'area_km2': 0.78,
                'direction': 'north'
            },
            spread_prediction_3h={
                'radius_km': 1.5,
                'area_km2': 7.07,
                'direction': 'north'
            },
            spread_prediction_6h={
                'radius_km': 3.0,
                'area_km2': 28.27,
                'direction': 'north'
            },
            control_strategy={
                'isolation_belt': [
                    {'longitude': float(avg_lon) - 0.01, 'latitude': float(avg_lat) + 0.01},
                    {'longitude': float(avg_lon) + 0.01, 'latitude': float(avg_lat) + 0.01}
                ],
                'firefighting_devices': ['ZHL-001', 'ZHL-002'],
                'support_routes': [
                    {'start': '指挥中心', 'end': '起火点', 'distance_km': 5.2}
                ]
            }
        )
        
        logger.info(f'Fire tracing completed for alert {alert.alert_id}')
        return {'status': 'success', 'tracing_id': fire_tracing.id}
        
    except Alert.DoesNotExist:
        logger.error(f'Alert not found: {alert_id}')
        raise
    except Exception as exc:
        logger.error(f'Error running fire tracing: {exc}')
        self.retry(exc=exc, countdown=120)


@shared_task
def send_notification(alert_id):
    """发送告警通知"""
    try:
        alert = Alert.objects.get(id=alert_id)
        
        # TODO: 实现通知逻辑
        # - 站内信
        # - App 推送
        # - 短信（一级、二级）
        # - 语音电话（一级）
        # - 林草局专线（一级）
        
        logger.info(f'Notification sent for alert {alert.alert_id}')
        return {'status': 'success'}
        
    except Alert.DoesNotExist:
        logger.error(f'Alert not found: {alert_id}')
        raise
