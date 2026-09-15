"""
MQTT client for device communication.

默认模式（Kafka 管线）：收到 EMQX 消息后写入 Kafka，由 Kafka Consumer → Celery 处理。
兼容模式：USE_KAFKA_PIPELINE=False 时直接投递 Celery（旧行为）。
"""
import json
import logging

import paho.mqtt.client as mqtt
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# 大屏推送降频：同类消息最小间隔（秒）
_DASHBOARD_PUSH_MIN_INTERVAL = {
    'telemetry_update': 8.0,
    'device_status_update': 2.0,
    'alert_notification': 0.0,  # 告警不节流
}
_last_dashboard_push_at: dict[str, float] = {}


def _should_push_dashboard(event_type: str) -> bool:
    import time

    min_interval = _DASHBOARD_PUSH_MIN_INTERVAL.get(event_type, 1.0)
    if min_interval <= 0:
        return True
    now = time.monotonic()
    last = _last_dashboard_push_at.get(event_type, 0.0)
    if now - last < min_interval:
        return False
    _last_dashboard_push_at[event_type] = now
    return True


class MQTTClient:
    """MQTT 客户端"""

    def __init__(self):
        client_id = f"{settings.MQTT_CONFIG['CLIENT_ID']}_{timezone.now().strftime('%H%M%S')}"
        # paho-mqtt 2.x 需要显式 CallbackAPIVersion
        try:
            self.client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION1,
                client_id=client_id,
                protocol=mqtt.MQTTv311,
            )
        except (TypeError, AttributeError):
            self.client = mqtt.Client(
                client_id=client_id,
                protocol=mqtt.MQTTv311,
            )
        self.client.username_pw_set(
            settings.MQTT_CONFIG['USERNAME'],
            settings.MQTT_CONFIG['PASSWORD'],
        )
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message
        self.channel_layer = get_channel_layer()
        self._kafka_producer = None
        self.use_kafka = getattr(settings, 'USE_KAFKA_PIPELINE', True)

    def _get_kafka_producer(self):
        if self._kafka_producer is None:
            from core.kafka_client import get_producer
            self._kafka_producer = get_producer(shared=True)
        return self._kafka_producer

    def on_connect(self, client, userdata, flags, rc):
        logger.info('MQTT connected with result code %s', rc)
        # 兼容 device/{id}/... 与 forest/{type}/{id}/...
        client.subscribe('device/+/telemetry', qos=1)
        client.subscribe('device/+/alert', qos=1)
        client.subscribe('device/+/status', qos=1)
        client.subscribe('device/+/response', qos=1)
        client.subscribe('forest/+/+/telemetry', qos=0)
        client.subscribe('forest/+/+/alert', qos=1)
        client.subscribe('forest/+/+/status', qos=1)
        client.subscribe('forest/+/+/response', qos=1)

    def on_disconnect(self, client, userdata, rc):
        logger.warning('MQTT disconnected with result code %s', rc)
        if rc != 0:
            try:
                client.reconnect()
            except Exception as e:
                logger.error('Reconnect failed: %s', e)

    def _parse_topic(self, topic: str):
        parts = topic.split('/')
        # device/{device_id}/{message_type}
        if len(parts) >= 3 and parts[0] == 'device':
            return parts[1], parts[2]
        # forest/{device_type}/{device_id}/{message_type}
        if len(parts) >= 4 and parts[0] == 'forest':
            return parts[2], parts[3]
        return None, None

    def on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())
            device_id, message_type = self._parse_topic(topic)
            if not device_id or not message_type:
                logger.warning('Unrecognized MQTT topic: %s', topic)
                return

            if message_type == 'telemetry':
                self.handle_telemetry(device_id, payload, topic)
            elif message_type == 'alert':
                self.handle_alert(device_id, payload, topic)
            elif message_type == 'status':
                self.handle_status(device_id, payload, topic)
            elif message_type == 'response':
                self.handle_response(device_id, payload, topic)
        except Exception as e:
            logger.error('Error processing MQTT message: %s', e)

    def _forward(self, message_type, device_id, payload, mqtt_topic):
        """优先写入 Kafka；失败或关闭管线时直接 Celery。"""
        if message_type == 'telemetry':
            from apps.users.collection_policy import telemetry_min_interval_for_device
            from core.perf_cache import allow_telemetry_ingest

            min_interval = telemetry_min_interval_for_device(device_id)
            if not allow_telemetry_ingest(device_id, min_interval=min_interval):
                logger.debug(
                    'MQTT telemetry dropped by org collection policy device=%s interval=%ss',
                    device_id,
                    min_interval,
                )
                return 'throttled'

        if self.use_kafka:
            try:
                from core.kafka_client import publish_device_event

                ok = publish_device_event(
                    message_type=message_type,
                    device_id=device_id,
                    payload=payload,
                    mqtt_topic=mqtt_topic,
                    producer=self._get_kafka_producer(),
                )
                if ok:
                    return 'kafka'
                logger.warning('Kafka publish failed, fallback to Celery')
            except Exception as exc:
                logger.warning('Kafka unavailable, fallback to Celery: %s', exc)

        from apps.alerts.tasks import process_alert
        from apps.devices.tasks import (
            process_command_ack,
            process_device_telemetry,
            update_device_status,
        )

        if message_type == 'telemetry':
            process_device_telemetry.delay(device_id, payload)
        elif message_type == 'alert':
            process_alert.delay({'device_id': device_id, **payload})
        elif message_type == 'status':
            update_device_status.delay(
                device_id,
                payload.get('status', 'offline'),
                payload.get('timestamp'),
            )
        elif message_type in ('response', 'ack', 'command_ack'):
            process_command_ack.delay(device_id, payload)
        return 'celery'

    def handle_telemetry(self, device_id, payload, topic='device/+/telemetry'):
        logger.info('Received telemetry from %s', device_id)
        self._forward('telemetry', device_id, payload, topic)
        # 遥测高频：默认不推大屏，避免刷爆 overview；由定时刷新兜底
        return

    def handle_alert(self, device_id, payload, topic='device/+/alert'):
        logger.info('Received alert from %s', device_id)
        self._forward('alert', device_id, payload, topic)
        if self.channel_layer and _should_push_dashboard('alert_notification'):
            try:
                async_to_sync(self.channel_layer.group_send)(
                    'dashboard',
                    {
                        'type': 'alert_notification',
                        'data': {'device_id': device_id, 'alert': payload},
                    },
                )
            except Exception:
                pass

    def handle_status(self, device_id, payload, topic='device/+/status'):
        logger.info('Received status from %s', device_id)
        self._forward('status', device_id, payload, topic)
        if self.channel_layer and _should_push_dashboard('device_status_update'):
            try:
                async_to_sync(self.channel_layer.group_send)(
                    'dashboard',
                    {
                        'type': 'device_status_update',
                        'data': {'device_id': device_id, 'status': payload},
                    },
                )
            except Exception:
                pass

    def handle_response(self, device_id, payload, topic=None):
        """设备指令 ACK → Kafka/Celery + WS 透传。"""
        logger.info('Received response from %s', device_id)
        self._forward('response', device_id, payload, topic or f'device/{device_id}/response')
        if self.channel_layer:
            try:
                async_to_sync(self.channel_layer.group_send)(
                    f'device_{device_id}',
                    {'type': 'device_response', 'data': payload},
                )
            except Exception:
                pass

    def connect(self):
        self.client.connect(
            settings.MQTT_CONFIG['BROKER_HOST'],
            settings.MQTT_CONFIG['BROKER_PORT'],
            keepalive=60,
        )
        self.client.loop_start()
        logger.info('MQTT client started (kafka_pipeline=%s)', self.use_kafka)

    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()
        if self._kafka_producer is not None:
            try:
                self._kafka_producer.flush(timeout=5)
                self._kafka_producer.close()
            except Exception:
                pass
            self._kafka_producer = None
        logger.info('MQTT client stopped')

    def publish_command(self, device_id, command_type, params):
        topic = f'device/{device_id}/command'
        payload = {
            'command_type': command_type,
            'params': params,
            'command_id': (params or {}).get('command_id'),
            'correlation_id': (params or {}).get('correlation_id'),
            'timestamp': timezone.now().isoformat(),
        }
        result = self.client.publish(
            topic,
            json.dumps(payload),
            qos=1,  # 控制指令强制 QoS1
        )
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            logger.info('Command published to %s: %s', device_id, command_type)
            return True
        logger.error('Failed to publish command: %s', result.rc)
        return False


mqtt_client = None


def get_mqtt_client():
    global mqtt_client
    if mqtt_client is None:
        mqtt_client = MQTTClient()
    return mqtt_client


def publish_command(device_id, command_type, params):
    client = get_mqtt_client()
    if not getattr(client.client, '_sock', None):
        try:
            client.connect()
        except Exception:
            pass
    return client.publish_command(device_id, command_type, params)
