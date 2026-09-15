"""
站内信（in_app）投递：写 Notification 表 + 可选 WebSocket 推送。
受组织「通知设置 → 推送渠道 → 站内信」开关控制。
"""
from __future__ import annotations

import logging
from typing import Any, Iterable

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model

from .models import Notification, OrganizationSettings

User = get_user_model()
logger = logging.getLogger(__name__)

DEFAULT_IN_APP_ROLES = ('admin', 'operator', 'forester')


def is_in_app_enabled(organization_id: int | None) -> bool:
    if organization_id is None:
        return True
    try:
        settings_obj = OrganizationSettings.get_or_create_for_org(int(organization_id))
        return bool(settings_obj.notify_in_app)
    except Exception as exc:
        logger.warning('read notify_in_app failed org=%s: %s', organization_id, exc)
        return True


def channels_include_in_app(push_channels: Iterable[str] | None) -> bool:
    """未指定渠道时默认包含站内信；显式列表则需含 in_app。"""
    if push_channels is None:
        return True
    channels = [str(c).strip() for c in push_channels if c is not None and str(c).strip()]
    if not channels:
        return True
    return 'in_app' in channels


def serialize_notification(n: Notification) -> dict[str, Any]:
    return {
        'id': n.id,
        'type': n.notification_type,
        'notification_type': n.notification_type,
        'type_display': n.get_notification_type_display(),
        'title': n.title,
        'content': n.content or '',
        'is_read': n.is_read,
        'alert_id': n.alert_id or '',
        'device_id': n.device_id or '',
        'created_at': n.created_at.isoformat() if n.created_at else None,
        'read_at': n.read_at.isoformat() if n.read_at else None,
    }


def push_notification_ws(user_id: int, payload: dict[str, Any]) -> None:
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            f'user_{user_id}',
            {
                'type': 'in_app_notification',
                'data': payload,
            },
        )
    except Exception as exc:
        logger.debug('WS in_app push skipped user=%s: %s', user_id, exc)


def create_in_app_notification(
    *,
    user_id: int,
    notification_type: str,
    title: str,
    content: str = '',
    alert_id: str = '',
    device_id: str = '',
) -> Notification | None:
    try:
        user = User.objects.get(id=user_id, is_active=True)
    except User.DoesNotExist:
        logger.error('in_app: user not found %s', user_id)
        return None

    notification = Notification.objects.create(
        user=user,
        notification_type=notification_type,
        title=title,
        content=content or '',
        alert_id=alert_id or '',
        device_id=device_id or '',
    )
    push_notification_ws(user.id, serialize_notification(notification))
    return notification


def recipients_for_alert_org(
    organization_id: int | None,
    roles: Iterable[str] = DEFAULT_IN_APP_ROLES,
) -> list:
    qs = User.objects.filter(is_active=True, role__in=list(roles))
    if organization_id is not None:
        qs = qs.filter(organization_id=organization_id)
    return list(qs.only('id', 'username', 'organization_id'))


def dispatch_alert_in_app(
    *,
    organization_id: int | None,
    title: str,
    content: str,
    alert_id: str = '',
    device_id: str = '',
    push_channels: Iterable[str] | None = None,
    extra_user_ids: Iterable[int] | None = None,
) -> dict[str, Any]:
    """
    按组织开关与 push_channels 投递站内信。
    返回 {enabled, sent, skipped_reason?}。
    """
    if not channels_include_in_app(push_channels):
        return {'enabled': False, 'sent': 0, 'skipped_reason': 'channel_disabled'}
    if not is_in_app_enabled(organization_id):
        return {'enabled': False, 'sent': 0, 'skipped_reason': 'org_notify_in_app_off'}

    user_ids: set[int] = {u.id for u in recipients_for_alert_org(organization_id)}
    if extra_user_ids:
        user_ids.update(int(uid) for uid in extra_user_ids if uid is not None)

    sent = 0
    for uid in user_ids:
        n = create_in_app_notification(
            user_id=uid,
            notification_type='alert',
            title=title,
            content=content,
            alert_id=alert_id,
            device_id=device_id,
        )
        if n:
            sent += 1
    return {'enabled': True, 'sent': sent}
