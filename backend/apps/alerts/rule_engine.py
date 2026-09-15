"""
告警规则引擎：根据遥测数据匹配 AlertRule 并触发告警。
规则列表短缓存；触发带设备+规则冷却，抑制告警风暴。
"""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

from core.perf_cache import (
    ALERT_RULES_TTL,
    alert_rules_org_key,
    alert_rules_system_key,
    allow_alert_fire,
    cache_get,
    cache_set,
)

logger = logging.getLogger(__name__)


def get_effective_rules_for_device(device) -> list:
    """返回对某设备生效的启用规则列表（已按级别排序）。"""
    from apps.alerts.models import AlertRule
    from django.db.models import Q

    org_id = getattr(device, 'organization_id', None)
    cache_key = alert_rules_org_key(org_id) if org_id else alert_rules_system_key()
    cached_ids = cache_get(cache_key)
    if cached_ids is not None:
        rules = list(
            AlertRule.objects.filter(id__in=cached_ids, is_enabled=True)
            .prefetch_related('devices')
            .order_by('alert_level', '-updated_at')
        )
        # 保持缓存顺序近似；缺的忽略
        by_id = {r.id: r for r in rules}
        rules = [by_id[i] for i in cached_ids if i in by_id]
    else:
        qs = AlertRule.objects.filter(is_enabled=True).prefetch_related('devices')
        if org_id:
            qs = qs.filter(Q(is_system=True) | Q(organization_id=org_id))
        else:
            qs = qs.filter(is_system=True)
        rules = list(qs.order_by('alert_level', '-updated_at'))
        cache_set(cache_key, [r.id for r in rules], ALERT_RULES_TTL)

    matched = []
    for rule in rules:
        device_ids = None
        if rule.apply_scope == AlertRule.ApplyScope.DEVICES:
            device_ids = {d.pk for d in rule.devices.all()}
        if rule.applies_to_device(device, device_ids):
            matched.append(rule)
    return matched


def evaluate_telemetry_rules(device_id: str, telemetry: dict[str, Any]) -> list[dict]:
    """
    评估启用中的告警规则，返回待创建的告警 payload 列表。
    """
    from apps.devices.models import Device

    try:
        device = Device.objects.get(device_id=device_id)
    except Device.DoesNotExist:
        logger.error('evaluate_telemetry_rules: device not found %s', device_id)
        return []

    rules = get_effective_rules_for_device(device)

    triggered: list[dict] = []
    temperature = telemetry.get('temperature')
    humidity = telemetry.get('humidity')
    thermal_max = telemetry.get('thermal_max_temp')
    ai_confidence = telemetry.get('ai_confidence')
    if ai_confidence is None and telemetry.get('confidence') is not None:
        conf = telemetry.get('confidence')
        ai_confidence = conf / 100.0 if isinstance(conf, (int, float)) and conf > 1 else conf

    dedup_ttl = int(getattr(settings, 'ALERT_RULE_DEDUP_SECONDS', 300) or 300)

    for rule in rules:
        hit = False
        reasons: list[str] = []

        if rule.alert_type in ('high_temp', 'env_threshold') and temperature is not None:
            if rule.temperature_threshold is not None and float(temperature) >= float(rule.temperature_threshold):
                hit = True
                reasons.append(f'温度 {temperature}℃ >= {rule.temperature_threshold}℃')

        if rule.alert_type == 'env_threshold' and humidity is not None:
            if rule.humidity_threshold is not None and float(humidity) <= float(rule.humidity_threshold):
                hit = True
                reasons.append(f'湿度 {humidity}%RH <= {rule.humidity_threshold}%RH')

        if rule.alert_type in ('fire', 'smoke'):
            conf_ok = True
            if rule.confidence_threshold and ai_confidence is not None:
                conf_ok = float(ai_confidence) >= float(rule.confidence_threshold)
            thermal_ok = thermal_max is not None and float(thermal_max) >= 60
            if conf_ok and (thermal_ok or telemetry.get('fire_detected') or telemetry.get('smoke_detected')):
                hit = True
                reasons.append(
                    f'火情/烟雾特征匹配 (thermal_max={thermal_max}, confidence={ai_confidence})'
                )

        if rule.alert_type == 'low_battery':
            battery = telemetry.get('battery_level')
            if battery is not None and float(battery) <= 15:
                hit = True
                reasons.append(f'电量过低 {battery}%')

        if not hit:
            continue

        if not allow_alert_fire(device_id, rule.id, ttl=dedup_ttl):
            logger.debug('Alert suppressed by dedup device=%s rule=%s', device_id, rule.id)
            continue

        triggered.append({
            'device_id': device_id,
            'alert_type': rule.alert_type,
            'alert_level': rule.alert_level,
            'title': f'{rule.name} - {device.device_name}',
            'description': '; '.join(reasons) or rule.description,
            'longitude': float(device.longitude) if device.longitude is not None else telemetry.get('longitude'),
            'latitude': float(device.latitude) if device.latitude is not None else telemetry.get('latitude'),
            'ai_confidence': ai_confidence,
            'ai_category': telemetry.get('ai_category', rule.alert_type),
            'screenshot_url': telemetry.get('screenshot_url') or telemetry.get('screenshot'),
            'thermal_image_url': telemetry.get('thermal_image_url') or telemetry.get('thermal_image'),
            'rule_id': rule.id,
            'push_channels': list(rule.push_channels or ['in_app']),
        })

    return triggered
