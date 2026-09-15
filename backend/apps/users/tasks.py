# apps/users/tasks.py
"""
User Celery tasks.
"""
from celery import shared_task
from django.utils import timezone
from django.contrib.auth import get_user_model
import logging

from .models import Notification

User = get_user_model()
logger = logging.getLogger(__name__)


@shared_task
def create_notification(user_id, notification_type, title, content, **kwargs):
    """创建站内信通知"""
    from apps.users.in_app_notify import create_in_app_notification

    notification = create_in_app_notification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        content=content,
        alert_id=kwargs.get('alert_id', '') or '',
        device_id=kwargs.get('device_id', '') or '',
    )
    if not notification:
        logger.error('User not found or inactive: %s', user_id)
        raise ValueError(f'User not found: {user_id}')
    logger.info('Notification created for user_id=%s: %s', user_id, title)
    return {'status': 'success', 'notification_id': notification.id}


@shared_task
def send_notification_to_role(role, notification_type, title, content, **kwargs):
    """发送站内信给指定角色（可按 organization_id 收窄）"""
    from apps.users.in_app_notify import create_in_app_notification

    try:
        qs = User.objects.filter(role=role, is_active=True)
        org_id = kwargs.get('organization_id')
        if org_id is not None:
            qs = qs.filter(organization_id=org_id)
        count = 0
        for user in qs.only('id'):
            n = create_in_app_notification(
                user_id=user.id,
                notification_type=notification_type,
                title=title,
                content=content,
                alert_id=kwargs.get('alert_id', '') or '',
                device_id=kwargs.get('device_id', '') or '',
            )
            if n:
                count += 1
        logger.info('Notification sent to %s users with role %s', count, role)
        return {'status': 'success', 'count': count}
    except Exception as e:
        logger.error('Error sending notification to role %s: %s', role, e)
        raise


@shared_task
def send_notification_to_department(department, notification_type, title, content, **kwargs):
    """发送站内信给指定部门的所有用户"""
    from apps.users.in_app_notify import create_in_app_notification

    try:
        users = User.objects.filter(department=department, is_active=True)
        count = 0
        for user in users.only('id'):
            n = create_in_app_notification(
                user_id=user.id,
                notification_type=notification_type,
                title=title,
                content=content,
                alert_id=kwargs.get('alert_id', '') or '',
                device_id=kwargs.get('device_id', '') or '',
            )
            if n:
                count += 1
        logger.info('Notification sent to %s users in department %s', count, department)
        return {'status': 'success', 'count': count}
    except Exception as e:
        logger.error('Error sending notification to department %s: %s', department, e)
        raise


@shared_task
def send_notification_to_region(region, notification_type, title, content, **kwargs):
    """发送站内信给指定区域的所有用户"""
    from apps.users.in_app_notify import create_in_app_notification

    try:
        users = User.objects.filter(region=region, is_active=True)
        count = 0
        for user in users.only('id'):
            n = create_in_app_notification(
                user_id=user.id,
                notification_type=notification_type,
                title=title,
                content=content,
                alert_id=kwargs.get('alert_id', '') or '',
                device_id=kwargs.get('device_id', '') or '',
            )
            if n:
                count += 1
        logger.info('Notification sent to %s users in region %s', count, region)
        return {'status': 'success', 'count': count}
    except Exception as e:
        logger.error('Error sending notification to region %s: %s', region, e)
        raise


@shared_task
def clean_old_notifications(days=30):
    """清理旧通知"""
    try:
        threshold = timezone.now() - timezone.timedelta(days=days)
        count = Notification.objects.filter(
            created_at__lt=threshold,
            is_read=True
        ).delete()[0]

        logger.info(f'Cleaned {count} old notifications')
        return {'status': 'success', 'count': count}

    except Exception as e:
        logger.error(f'Error cleaning old notifications: {e}')
        raise


@shared_task(bind=True, max_retries=2, default_retry_delay=5)
def push_org_collection_config(self, organization_id: int, operator_id: int | None = None):
    """Push org collection settings to devices via MQTT set_collection_config."""
    try:
        from apps.devices.models import Device, DeviceCommand
        from apps.devices.tasks import _publish_and_mark_sent
        from apps.users.collection_policy import collection_config_for_org

        params = collection_config_for_org(int(organization_id))
        devices = list(
            Device.objects.filter(organization_id=organization_id, is_active=True).only(
                'id', 'device_id'
            )
        )
        pushed = 0
        failed = 0
        for device in devices:
            command = DeviceCommand.objects.create(
                device=device,
                command_type='set_collection_config',
                command_params=params,
                operator_id=operator_id,
                status='pending',
            )
            try:
                _publish_and_mark_sent(command, device.device_id)
                pushed += 1
            except Exception as exc:
                failed += 1
                logger.warning(
                    'push collection config failed device=%s: %s',
                    device.device_id,
                    exc,
                )
        logger.info(
            'Org %s collection config pushed: ok=%s fail=%s params=%s',
            organization_id,
            pushed,
            failed,
            params,
        )
        return {
            'status': 'ok',
            'organization_id': organization_id,
            'pushed': pushed,
            'failed': failed,
            'params': params,
        }
    except Exception as exc:
        logger.exception('push_org_collection_config error: %s', exc)
        raise self.retry(exc=exc)
