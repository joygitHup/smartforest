"""
本地 MQTT 设备模拟器。

向 EMQX 发布与平台一致的主题：
  device/{device_id}/telemetry
  device/{device_id}/status
  device/{device_id}/alert（可选）

设备会写入 / 对齐 PostgreSQL `devices` 表，可在「设备管理」中看到。
"""
from __future__ import annotations

import json
import logging
import math
import random
import time
from datetime import date
from decimal import Decimal
from typing import Iterable

import paho.mqtt.client as mqtt
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# 模拟器专属设备（可与演示设备并存）
SIMULATOR_DEVICE_SPECS = [
    {
        'device_id': 'SIM-CAM-001',
        'device_name': '模拟双目云台-01',
        'device_type': 'dual_camera',
        'longitude': Decimal('117.920000'),
        'latitude': Decimal('42.385000'),
        'region': '白桦林区',
        'forest_zone': '白桦核心区',
    },
    {
        'device_id': 'SIM-ENV-001',
        'device_name': '模拟环境站-01',
        'device_type': 'env_sensor',
        'longitude': Decimal('117.925000'),
        'latitude': Decimal('42.382000'),
        'region': '白桦林区',
        'forest_zone': '白桦核心区',
    },
    {
        'device_id': 'SIM-GW-001',
        'device_name': '模拟边缘网关-01',
        'device_type': 'ai_gateway',
        'longitude': Decimal('117.928000'),
        'latitude': Decimal('42.388000'),
        'region': '白桦林区',
        'forest_zone': '白桦核心区',
    },
]


def ensure_simulator_devices(extra_ids: Iterable[str] | None = None) -> list:
    """确保模拟器设备存在于业务库，返回 Device 列表。"""
    from apps.devices.models import Device

    devices = []
    for spec in SIMULATOR_DEVICE_SPECS:
        device, created = Device.objects.update_or_create(
            device_id=spec['device_id'],
            defaults={
                'device_name': spec['device_name'],
                'device_type': spec['device_type'],
                'status': 'online',
                'longitude': spec['longitude'],
                'latitude': spec['latitude'],
                'altitude': Decimal('850.00'),
                'region': spec['region'],
                'forest_zone': spec['forest_zone'],
                'firmware_version': 'sim-1.0.0',
                'hardware_version': 'SIM',
                'manufacturer': 'MQTT模拟器',
                'communication_type': 'wifi',
                'signal_strength': 4,
                'battery_level': 100,
                'install_date': date.today(),
                'last_online_time': timezone.now(),
                'last_heartbeat': timezone.now(),
            },
        )
        devices.append(device)
        if created:
            logger.info('Registered simulator device %s', device.device_id)

    if extra_ids:
        for did in extra_ids:
            did = (did or '').strip()
            if not did:
                continue
            device = Device.objects.filter(device_id=did).first()
            if device:
                devices.append(device)
            else:
                device = ensure_device_from_mqtt(
                    did,
                    defaults={
                        'device_name': f'模拟设备-{did}',
                        'device_type': 'env_sensor',
                        'manufacturer': 'MQTT模拟器',
                    },
                )
                devices.append(device)

    # 去重保序
    seen = set()
    unique = []
    for d in devices:
        if d.device_id in seen:
            continue
        seen.add(d.device_id)
        unique.append(d)
    return unique


def ensure_device_from_mqtt(device_id: str, defaults: dict | None = None) -> object:
    """MQTT 上报未知设备时自动登记。"""
    from apps.devices.models import Device
    from apps.users.org_scope import ensure_root_organization

    base = {
        'device_name': f'MQTT设备-{device_id}',
        'device_type': 'env_sensor',
        'status': 'online',
        'manufacturer': 'MQTT模拟器',
        'communication_type': 'wifi',
        'firmware_version': 'auto',
        'hardware_version': 'MQTT',
        'signal_strength': 3,
        'region': '',
        'forest_zone': '',
        'organization_id': ensure_root_organization().id,
        'last_online_time': timezone.now(),
        'last_heartbeat': timezone.now(),
    }
    if defaults:
        base.update(defaults)
    device, created = Device.objects.get_or_create(device_id=device_id, defaults=base)
    if created:
        logger.info('Auto-registered MQTT device %s', device_id)
    else:
        device.last_heartbeat = timezone.now()
        device.last_online_time = timezone.now()
        if device.status == 'offline':
            device.status = 'online'
        device.save(update_fields=['last_heartbeat', 'last_online_time', 'status', 'updated_at'])
    return device


def build_telemetry_payload(device, tick: int) -> dict:
    """按设备类型生成逼真遥测。"""
    phase = tick / 10.0
    base_temp = 22 + 6 * math.sin(phase) + random.uniform(-0.8, 0.8)
    humidity = 45 + 15 * math.sin(phase / 2) + random.uniform(-3, 3)
    payload = {
        'timestamp': timezone.now().isoformat(),
        'source': 'mqtt_simulator',
        'temperature': round(base_temp, 1),
        'humidity': round(max(5.0, min(95.0, humidity)), 1),
        'wind_speed': round(abs(2 + 3 * math.sin(phase * 0.7)) + random.uniform(0, 1), 1),
        'wind_direction': int((tick * 17) % 360),
        'light_intensity': round(max(0, 40000 * max(0, math.sin(phase / 3))), 1),
        'battery_level': max(15, 100 - (tick % 80)),
        'signal_strength': 3 + (tick % 3),
        'video_status': 'normal',
    }
    if device.device_type == 'env_sensor':
        payload.update(
            {
                'soil_moisture_10cm': round(20 + 8 * math.sin(phase / 4), 1),
                'soil_moisture_30cm': round(25 + 6 * math.sin(phase / 5), 1),
                'fuel_moisture': round(12 + 5 * math.sin(phase / 6), 1),
            }
        )
    if device.device_type == 'dual_camera':
        hotspot = base_temp + random.uniform(8, 35)
        payload.update(
            {
                'thermal_max_temp': round(hotspot, 1),
                'thermal_min_temp': round(base_temp - 2, 1),
                'thermal_avg_temp': round(base_temp + 3, 1),
                'thermal_hotspot_x': random.randint(100, 500),
                'thermal_hotspot_y': random.randint(80, 400),
                'pan_angle': round((tick * 3) % 360, 1),
                'tilt_angle': round(-5 + (tick % 10), 1),
                'fire_detected': hotspot > 55,
            }
        )
    if device.device_type == 'ai_gateway':
        payload.update({'cpu_usage': round(20 + random.uniform(0, 50), 1), 'memory_usage': round(40 + random.uniform(0, 30), 1)})
    if device.device_type == 'drone':
        payload.update({'altitude': round(120 + 30 * math.sin(phase), 1), 'speed': round(abs(8 * math.sin(phase)), 1)})
    return payload


def build_status_payload(device, tick: int) -> dict:
    return {
        'status': 'online',
        'timestamp': timezone.now().isoformat(),
        'source': 'mqtt_simulator',
        'battery_level': max(15, 100 - (tick % 80)),
        'signal_strength': 3 + (tick % 3),
    }


def build_alert_payload(device, tick: int) -> dict | None:
    """偶发告警。"""
    if tick > 0 and tick % 25 == 0:
        return {
            'title': f'{device.device_name}模拟高温告警',
            'alert_type': 'high_temp',
            'alert_level': 'level_2',
            'description': 'mqtt_simulator generated alert',
            'temperature': 62.5,
            'source': 'mqtt_simulator',
            'timestamp': timezone.now().isoformat(),
        }
    if device.device_type == 'dual_camera' and tick > 0 and tick % 40 == 0:
        return {
            'title': f'{device.device_name}模拟火情告警',
            'alert_type': 'fire',
            'alert_level': 'level_1',
            'description': 'mqtt_simulator fire_detected',
            'ai_confidence': 0.91,
            'source': 'mqtt_simulator',
            'timestamp': timezone.now().isoformat(),
        }
    return None


class MQTTDeviceSimulator:
    """连接 EMQX，周期发布模拟设备数据。"""

    def __init__(
        self,
        devices,
        interval: float = 5.0,
        publish_alert: bool = True,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
    ):
        self.devices = list(devices)
        self.interval = max(1.0, float(interval))
        self.publish_alert = publish_alert
        self._device_intervals: dict[str, float] = {}
        self._load_org_intervals()
        cfg = settings.MQTT_CONFIG
        self.host = host or cfg['BROKER_HOST']
        self.port = port or cfg['BROKER_PORT']
        self.username = username if username is not None else cfg['USERNAME']
        self.password = password if password is not None else cfg['PASSWORD']
        self._stop = False
        self._tick = 0
        client_id = f"forest_mqtt_sim_{timezone.now().strftime('%H%M%S')}"
        try:
            self.client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION1,
                client_id=client_id,
                protocol=mqtt.MQTTv311,
            )
        except (TypeError, AttributeError):
            self.client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)
        if self.username:
            self.client.username_pw_set(self.username, self.password)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        # 内存姿态，供 ACK 回写
        self._pose: dict[str, dict[str, float]] = {}

    def _on_connect(self, client, userdata, flags, rc):
        logger.info('MQTT simulator connected rc=%s devices=%s', rc, len(self.devices))
        client.subscribe('device/+/command', qos=1)

    def _on_disconnect(self, client, userdata, rc):
        logger.warning('MQTT simulator disconnected rc=%s', rc)

    def _load_org_intervals(self) -> None:
        """按设备所属组织的传感上报周期初始化模拟间隔。"""
        try:
            from apps.users.collection_policy import sensor_interval_seconds_for_org

            for device in self.devices:
                org_id = getattr(device, 'organization_id', None)
                sec = sensor_interval_seconds_for_org(org_id)
                # 模拟器下限 5 秒，避免本地演示过慢/过快
                self._device_intervals[device.device_id] = max(5.0, float(sec))
            if self._device_intervals:
                self.interval = min(self._device_intervals.values())
        except Exception as exc:
            logger.warning('load org collection intervals failed: %s', exc)

    def _interval_for(self, device_id: str) -> float:
        return float(self._device_intervals.get(device_id, self.interval))

    def _on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            parts = topic.split('/')
            if len(parts) < 3 or parts[0] != 'device' or parts[2] != 'command':
                return
            device_id = parts[1]
            payload = json.loads(msg.payload.decode())
            self._handle_command(device_id, payload if isinstance(payload, dict) else {})
        except Exception as exc:
            logger.error('Simulator command error: %s', exc)

    def _handle_command(self, device_id: str, payload: dict):
        cmd_type = payload.get('command_type') or payload.get('type') or ''
        params = payload.get('params') or payload.get('command_params') or payload
        if not isinstance(params, dict):
            params = {}

        pose = self._pose.setdefault(
            device_id,
            {'pan_angle': 0.0, 'tilt_angle': 0.0},
        )

        if cmd_type == 'set_collection_config':
            sec = params.get('sensor_interval_seconds')
            if sec is not None:
                try:
                    self._device_intervals[device_id] = max(5.0, float(sec))
                    self.interval = min(self._device_intervals.values()) if self._device_intervals else self.interval
                    logger.info(
                        'Simulator device %s sensor interval -> %ss',
                        device_id,
                        self._device_intervals[device_id],
                    )
                except (TypeError, ValueError):
                    pass
            ack = {
                'command_id': payload.get('command_id') or params.get('command_id'),
                'correlation_id': payload.get('correlation_id') or params.get('correlation_id'),
                'status': 'executed',
                'result': {
                    'command_type': cmd_type,
                    'applied': {
                        'sensor_interval_seconds': self._device_intervals.get(device_id),
                        'video_capture': params.get('video_capture'),
                        'video_codec': params.get('video_codec'),
                        'resume_upload': params.get('resume_upload'),
                    },
                },
                'timestamp': timezone.now().isoformat(),
                'source': 'mqtt_simulator',
            }
            self._publish(f'device/{device_id}/response', ack, qos=1)
            return

        if cmd_type == 'ptz_control':
            direction = params.get('direction')
            speed = float(params.get('speed') or 5) * 0.8
            if direction == 'left':
                pose['pan_angle'] = (pose['pan_angle'] - speed) % 360
            elif direction == 'right':
                pose['pan_angle'] = (pose['pan_angle'] + speed) % 360
            elif direction == 'up':
                pose['tilt_angle'] = max(-90, min(90, pose['tilt_angle'] + speed * 0.5))
            elif direction == 'down':
                pose['tilt_angle'] = max(-90, min(90, pose['tilt_angle'] - speed * 0.5))
        elif cmd_type in ('ptz_goto', 'ptz_preset'):
            if params.get('pan_angle') is not None:
                pose['pan_angle'] = float(params['pan_angle']) % 360
            if params.get('tilt_angle') is not None:
                pose['tilt_angle'] = max(-90, min(90, float(params['tilt_angle'])))
        elif cmd_type == 'restart':
            pass

        ack = {
            'command_id': payload.get('command_id') or params.get('command_id'),
            'correlation_id': payload.get('correlation_id') or params.get('correlation_id'),
            'status': 'executed',
            'result': {
                'pan_angle': round(pose['pan_angle'], 2),
                'tilt_angle': round(pose['tilt_angle'], 2),
                'command_type': cmd_type,
            },
            'timestamp': timezone.now().isoformat(),
            'source': 'mqtt_simulator',
        }
        self._publish(f'device/{device_id}/response', ack, qos=1)
        logger.info('Simulator ACK %s %s pose=%s', device_id, cmd_type, ack['result'])

    def _publish(self, topic: str, payload: dict, qos: int = 1):
        body = json.dumps(payload, ensure_ascii=False, default=str)
        result = self.client.publish(topic, body, qos=qos)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            logger.error('Publish failed topic=%s rc=%s', topic, result.rc)
            return False
        return True

    def publish_once(self, device_ids: set[str] | None = None):
        self._tick += 1
        for device in self.devices:
            if device_ids is not None and device.device_id not in device_ids:
                continue
            telemetry = build_telemetry_payload(device, self._tick)
            pose = self._pose.get(device.device_id)
            if pose:
                telemetry['pan_angle'] = pose['pan_angle']
                telemetry['tilt_angle'] = pose['tilt_angle']
            status = build_status_payload(device, self._tick)
            self._publish(f'device/{device.device_id}/telemetry', telemetry, qos=0)
            self._publish(f'device/{device.device_id}/status', status, qos=1)
            if self.publish_alert:
                alert = build_alert_payload(device, self._tick)
                if alert:
                    self._publish(f'device/{device.device_id}/alert', alert, qos=1)
        logger.info('Simulator tick=%s published for %s devices', self._tick, len(self.devices))

    def run(self, rounds: int | None = None):
        self.client.connect(self.host, self.port, keepalive=60)
        self.client.loop_start()
        time.sleep(0.5)
        count = 0
        next_due: dict[str, float] = {
            d.device_id: time.time() for d in self.devices
        }
        try:
            while not self._stop:
                now = time.time()
                due = {
                    d.device_id
                    for d in self.devices
                    if now >= next_due.get(d.device_id, now)
                }
                if due:
                    self.publish_once(due)
                    count += 1
                    for device_id in due:
                        next_due[device_id] = now + self._interval_for(device_id)
                    if rounds is not None and count >= rounds:
                        break
                # 醒来检查：取最近到期时间
                wake = min(
                    (next_due.get(d.device_id, now + self.interval) for d in self.devices),
                    default=now + self.interval,
                )
                time.sleep(max(0.2, min(1.0, wake - time.time())))
        finally:
            self.client.loop_stop()
            self.client.disconnect()
            logger.info('MQTT simulator stopped after %s rounds', count)

    def stop(self):
        self._stop = True
