"""
组织级采集策略：解析设置文案 → 秒数，并供 MQTT 削峰 / 设备下发使用。
"""
from __future__ import annotations

import re
from typing import Any

from django.conf import settings as dj_settings

from core.perf_cache import (
    ORG_SETTINGS_KEY,
    ORG_SETTINGS_TTL,
    cache_get,
    cache_set,
)

# 传感上报周期（环境站等）
SENSOR_INTERVAL_SECONDS = {
    '1分钟': 60,
    '5分钟': 300,
    '10分钟': 600,
}

# 视频采集间隔；连续/事件用特殊值
VIDEO_CAPTURE_SECONDS = {
    '连续采集': 0,
    '间隔5秒': 5,
    '间隔10秒': 10,
    '事件触发': -1,
}

REFRESH_INTERVAL_SECONDS = {
    '5秒': 5,
    '10秒': 10,
    '30秒': 30,
    '60秒': 60,
}

_DEVICE_ORG_KEY = 'sf:device_org:v1:{device_id}'
_DEVICE_ORG_TTL = 300


def parse_duration_seconds(label: str | None, *, default: float) -> float:
    """解析「10秒」「5分钟」「1小时」或纯数字为秒。"""
    text = (label or '').strip()
    if not text:
        return float(default)
    if text in SENSOR_INTERVAL_SECONDS:
        return float(SENSOR_INTERVAL_SECONDS[text])
    if text in REFRESH_INTERVAL_SECONDS:
        return float(REFRESH_INTERVAL_SECONDS[text])
    if text in VIDEO_CAPTURE_SECONDS:
        return float(VIDEO_CAPTURE_SECONDS[text])

    m = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(秒|分钟|分|小时|时|s|m|h)?', text, re.I)
    if m:
        value = float(m.group(1))
        unit = (m.group(2) or '秒').lower()
        if unit in ('分钟', '分', 'm'):
            return value * 60.0
        if unit in ('小时', '时', 'h'):
            return value * 3600.0
        return value
    return float(default)


def get_org_settings_cached(org_id: int | None) -> dict[str, Any] | None:
    if not org_id:
        return None
    key = ORG_SETTINGS_KEY.format(org_id=org_id)
    cached = cache_get(key)
    if isinstance(cached, dict):
        return cached
    try:
        from apps.users.models import OrganizationSettings

        obj = OrganizationSettings.get_or_create_for_org(org_id)
        payload = {
            'organization_id': obj.organization_id,
            'refresh_interval': obj.refresh_interval,
            'default_map_layer': obj.default_map_layer,
            'coordinate_system': obj.coordinate_system,
            'video_capture': obj.video_capture,
            'sensor_interval': obj.sensor_interval,
            'video_codec': obj.video_codec,
            'offline_cache_days': obj.offline_cache_days,
            'resume_upload': obj.resume_upload,
            'notify_in_app': obj.notify_in_app,
            'notify_app_push': obj.notify_app_push,
            'notify_sms': obj.notify_sms,
            'notify_voice_call': obj.notify_voice_call,
            'notify_forestry_line': obj.notify_forestry_line,
            'duty_mode_label': obj.duty_mode_label,
            'data_retention': obj.data_retention,
            'video_storage': obj.video_storage,
            'updated_at': obj.updated_at.isoformat() if obj.updated_at else None,
        }
        cache_set(key, payload, ORG_SETTINGS_TTL)
        return payload
    except Exception:
        return None


def resolve_device_organization_id(device_id: str) -> int | None:
    key = _DEVICE_ORG_KEY.format(device_id=device_id)
    cached = cache_get(key)
    if cached is not None:
        try:
            return int(cached) if cached != '' else None
        except (TypeError, ValueError):
            pass
    try:
        from apps.devices.models import Device

        org_id = (
            Device.objects.filter(device_id=device_id)
            .values_list('organization_id', flat=True)
            .first()
        )
        cache_set(key, org_id if org_id is not None else '', _DEVICE_ORG_TTL)
        return int(org_id) if org_id is not None else None
    except Exception:
        return None


def sensor_interval_seconds_for_org(org_id: int | None) -> float:
    floor = float(getattr(dj_settings, 'TELEMETRY_INGEST_MIN_INTERVAL', 1.0) or 0)
    settings = get_org_settings_cached(org_id) or {}
    parsed = parse_duration_seconds(
        settings.get('sensor_interval'),
        default=max(floor, 60.0),
    )
    # 入库削峰：不低于全局地板，避免误配成 0 打爆下游
    return max(parsed, floor) if floor > 0 else max(parsed, 0.0)


def telemetry_min_interval_for_device(device_id: str) -> float:
    org_id = resolve_device_organization_id(device_id)
    return sensor_interval_seconds_for_org(org_id)


def build_collection_config_params(org_settings: dict[str, Any] | None) -> dict[str, Any]:
    """下发给设备的采集配置参数。"""
    data = org_settings or {}
    sensor_label = data.get('sensor_interval') or '5分钟'
    video_label = data.get('video_capture') or '连续采集'
    sensor_sec = parse_duration_seconds(sensor_label, default=300)
    video_sec = parse_duration_seconds(video_label, default=0)
    return {
        'sensor_interval': sensor_label,
        'sensor_interval_seconds': int(sensor_sec) if sensor_sec >= 0 else None,
        'video_capture': video_label,
        'video_capture_seconds': int(video_sec) if video_sec >= 0 else None,
        'video_capture_mode': (
            'continuous'
            if video_sec == 0
            else ('event' if video_sec < 0 else 'interval')
        ),
        'video_codec': data.get('video_codec') or 'H.265 (自适应)',
        'offline_cache_days': data.get('offline_cache_days') or '≥7天',
        'resume_upload': bool(data.get('resume_upload', True)),
        'coordinate_system': data.get('coordinate_system') or 'WGS-84',
    }


def collection_config_for_org(org_id: int) -> dict[str, Any]:
    return build_collection_config_params(get_org_settings_cached(org_id))
