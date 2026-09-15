"""
设备下行控制：权限、在线校验、互斥锁、节流、姿态推送。
"""
from __future__ import annotations

import math
import uuid
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.cache import cache
from django.utils import timezone

from apps.users.permissions import is_system_admin

PTZ_LOCK_TTL = 30
PTZ_THROTTLE_MS = 300
RESTART_COOLDOWN_SEC = 600
CONTROLLABLE_STATUSES = {'online', 'alarm'}


def can_control_device(user) -> bool:
    """系统管理员 / staff / 运维 / 护林员可控制；纯查看者不可。"""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if is_system_admin(user):
        return True
    role = getattr(user, 'role', None)
    if role in ('operator', 'forester', 'admin'):
        return True
    role_ref = getattr(user, 'role_ref', None)
    code = getattr(role_ref, 'code', None) if role_ref else None
    if code in ('operator', 'forester', 'admin'):
        return True
    return False


def assert_device_online(device) -> str | None:
    if device.status not in CONTROLLABLE_STATUSES:
        return f'设备当前状态为「{device.get_status_display()}」，仅在线/告警时可下发指令'
    return None


def assert_dual_camera(device) -> str | None:
    if device.device_type != 'dual_camera':
        return '仅双目智能监测云台支持云台控制'
    return None


def new_correlation_id() -> str:
    return uuid.uuid4().hex


def acquire_ptz_lock(device_id: str, user_id: int) -> str | None:
    """同设备互斥：他人占用时返回错误文案。"""
    key = f'device:ptz:lock:{device_id}'
    holder = cache.get(key)
    if holder and int(holder) != int(user_id):
        return '该设备云台正被其他用户控制，请稍后再试'
    cache.set(key, user_id, PTZ_LOCK_TTL)
    return None


def release_ptz_lock(device_id: str, user_id: int) -> None:
    key = f'device:ptz:lock:{device_id}'
    holder = cache.get(key)
    if holder is None or int(holder) == int(user_id):
        cache.delete(key)


def check_ptz_throttle(device_id: str, user_id: int) -> str | None:
    """点动节流：约 300ms。"""
    key = f'device:ptz:throttle:{device_id}:{user_id}'
    now_ms = int(timezone.now().timestamp() * 1000)
    last = cache.get(key)
    if last is not None and now_ms - int(last) < PTZ_THROTTLE_MS:
        return '操作过于频繁，请稍候'
    cache.set(key, now_ms, timeout=2)
    return None


def check_restart_cooldown(device_id: str) -> str | None:
    key = f'device:restart:cooldown:{device_id}'
    if cache.get(key):
        return f'该设备距上次重启不足 {RESTART_COOLDOWN_SEC // 60} 分钟，请稍后再试'
    return None


def mark_restart_cooldown(device_id: str) -> None:
    cache.set(f'device:restart:cooldown:{device_id}', 1, RESTART_COOLDOWN_SEC)


def bearing_degrees(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """从点1指向点2的方位角（0–360，正北为0顺时针）。"""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    x = math.sin(dlon) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlon)
    brng = (math.degrees(math.atan2(x, y)) + 360) % 360
    return round(brng, 2)


def push_device_pose(device_id: str, pan_angle: Any, tilt_angle: Any, extra: dict | None = None) -> None:
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    payload = {
        'device_id': device_id,
        'pan_angle': float(pan_angle) if pan_angle is not None else None,
        'tilt_angle': float(tilt_angle) if tilt_angle is not None else None,
        'updated_at': timezone.now().isoformat(),
    }
    if extra:
        payload.update(extra)
    try:
        async_to_sync(channel_layer.group_send)(
            f'device_{device_id}',
            {'type': 'device_pose_update', 'data': payload},
        )
        async_to_sync(channel_layer.group_send)(
            'dashboard',
            {'type': 'device_pose_update', 'data': payload},
        )
    except Exception:
        pass


def push_command_status(device_id: str, command_data: dict) -> None:
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            f'device_{device_id}',
            {'type': 'device_command_status', 'data': command_data},
        )
    except Exception:
        pass
