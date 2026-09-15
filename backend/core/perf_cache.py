"""
性能相关缓存键、限流与读写辅助。
"""
from __future__ import annotations

import time
from typing import Any

from django.core.cache import cache

PLATFORM_SETTINGS_KEY = 'sf:platform_settings:v1'
ORG_SETTINGS_KEY = 'sf:org_settings:v1:{org_id}'
DASHBOARD_OVERVIEW_KEY = 'sf:dashboard:overview:v1:{user_id}:{scope}:{forest_zone}:{region}'
DASHBOARD_REGIONS_KEY = 'sf:dashboard:regions:v1:{user_id}:{scope}'
ALERT_RULES_ORG_KEY = 'sf:alert_rules:v1:{ver}:org:{org_id}'
ALERT_RULES_SYSTEM_KEY = 'sf:alert_rules:v1:{ver}:system'
ALERT_RULES_VERSION_KEY = 'sf:alert_rules:v1:ver'
ALERT_DEDUP_KEY = 'sf:alert_dedup:{device_id}:{rule_id}'
TELEMETRY_INGEST_KEY = 'sf:rl:telemetry:{device_id}'

PLATFORM_SETTINGS_TTL = 300
ORG_SETTINGS_TTL = 120
DASHBOARD_OVERVIEW_TTL = 20
DASHBOARD_REGIONS_TTL = 60
ALERT_RULES_TTL = 60
# 同设备同规则告警冷却（秒）
ALERT_DEDUP_TTL = 300
# 单设备遥测入库最小间隔（秒）——削峰
TELEMETRY_INGEST_MIN_INTERVAL = 1.0


def alert_rules_cache_version() -> int:
    try:
        ver = cache.get(ALERT_RULES_VERSION_KEY)
        return int(ver or 0)
    except Exception:
        return 0


def alert_rules_system_key() -> str:
    return ALERT_RULES_SYSTEM_KEY.format(ver=alert_rules_cache_version())


def alert_rules_org_key(org_id: int) -> str:
    return ALERT_RULES_ORG_KEY.format(ver=alert_rules_cache_version(), org_id=org_id)


def scope_cache_token(scope: set[int] | None) -> str:
    if scope is None:
        return 'all'
    if not scope:
        return 'none'
    return ','.join(str(i) for i in sorted(scope))


def cache_get(key: str) -> Any | None:
    try:
        return cache.get(key)
    except Exception:
        return None


def cache_set(key: str, value: Any, timeout: int | None) -> None:
    try:
        cache.set(key, value, timeout)
    except Exception:
        pass


def cache_delete(*keys: str) -> None:
    for key in keys:
        try:
            cache.delete(key)
        except Exception:
            pass


def invalidate_platform_settings() -> None:
    cache_delete(PLATFORM_SETTINGS_KEY)


def invalidate_org_settings(org_id: int) -> None:
    cache_delete(ORG_SETTINGS_KEY.format(org_id=org_id))


def invalidate_alert_rules(organization_id: int | None = None) -> None:
    """
    organization_id=None：系统规则变更 → 抬升版本，使所有 org/system 规则缓存失效。
    指定 org：仅删该组织当前版本缓存键。
    """
    if organization_id is None:
        try:
            try:
                cache.incr(ALERT_RULES_VERSION_KEY)
            except ValueError:
                cache.set(ALERT_RULES_VERSION_KEY, 1, None)
        except Exception:
            cache_set(ALERT_RULES_VERSION_KEY, int(time.time()), None)
        return
    cache_delete(alert_rules_org_key(organization_id))


def allow_alert_fire(device_id: str, rule_id: int, ttl: int = ALERT_DEDUP_TTL) -> bool:
    """True = 允许触发；False = 冷却中。"""
    key = ALERT_DEDUP_KEY.format(device_id=device_id, rule_id=rule_id)
    try:
        # add 仅在不存在时成功 → 原子占坑
        return bool(cache.add(key, '1', ttl))
    except Exception:
        return True


def allow_telemetry_ingest(
    device_id: str,
    min_interval: float | None = None,
) -> bool:
    """
    单设备遥测削峰。True=放行。
    使用 cache 记录上次放行时间；cache 不可用时默认放行。
    """
    interval = (
        min_interval
        if min_interval is not None
        else TELEMETRY_INGEST_MIN_INTERVAL
    )
    if interval <= 0:
        return True
    key = TELEMETRY_INGEST_KEY.format(device_id=device_id)
    now = time.time()
    try:
        last = cache.get(key)
        if last is not None and (now - float(last)) < interval:
            return False
        cache.set(key, now, max(int(interval * 4), 10))
        return True
    except Exception:
        return True
