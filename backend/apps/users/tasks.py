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
    """创建通知"""
    try:
        user = User.objects.get(id=user_id)

        notification = Notification.objects.create(
            user=user,
            notification_type=notification_type,
            title=title,
            content=content,
            alert_id=kwargs.get('alert_id', ''),
            device_id=kwargs.get('device_id', '')
        )

        logger.info(f'Notification created for user {user.username}: {title}')
        return {'status': 'success', 'notification_id': notification.id}

    except User.DoesNotExist:
        logger.error(f'User not found: {user_id}')
        raise


@shared_task
def send_notification_to_role(role, notification_type, title, content, **kwargs):
    """发送通知给指定角色的所有用户"""
    try:
        users = User.objects.filter(role=role, is_active=True)
        count = 0

        for user in users:
            notification = Notification.objects.create(
                user=user,
                notification_type=notification_type,
                title=title,
                content=content,
                alert_id=kwargs.get('alert_id', ''),
                device_id=kwargs.get('device_id', '')
            )
            count += 1

        logger.info(f'Notification sent to {count} users with role {role}')
        return {'status': 'success', 'count': count}

    except Exception as e:
        logger.error(f'Error sending notification to role {role}: {e}')
        raise


@shared_task
def send_notification_to_department(department, notification_type, title, content, **kwargs):
    """发送通知给指定部门的所有用户"""
    try:
        users = User.objects.filter(department=department, is_active=True)
        count = 0

        for user in users:
            notification = Notification.objects.create(
                user=user,
                notification_type=notification_type,
                title=title,
                content=content,
                alert_id=kwargs.get('alert_id', ''),
                device_id=kwargs.get('device_id', '')
            )
            count += 1

        logger.info(f'Notification sent to {count} users in department {department}')
        return {'status': 'success', 'count': count}

    except Exception as e:
        logger.error(f'Error sending notification to department {department}: {e}')
        raise


@shared_task
def send_notification_to_region(region, notification_type, title, content, **kwargs):
    """发送通知给指定区域的所有用户"""
    try:
        users = User.objects.filter(region=region, is_active=True)
        count = 0

        for user in users:
            notification = Notification.objects.create(
                user=user,
                notification_type=notification_type,
                title=title,
                content=content,
                alert_id=kwargs.get('alert_id', ''),
                device_id=kwargs.get('device_id', '')
            )
            count += 1

        logger.info(f'Notification sent to {count} users in region {region}')
        return {'status': 'success', 'count': count}

    except Exception as e:
        logger.error(f'Error sending notification to region {region}: {e}')
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