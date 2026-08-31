# apps/users/signals.py
"""
User signal handlers.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
import logging

User = get_user_model()
logger = logging.getLogger(__name__)


@receiver(post_save, sender=User)
def user_post_save(sender, instance, created, **kwargs):
    """用户创建后的处理"""
    if created:
        logger.info(f'New user created: {instance.username}')

        # 可以在这里发送欢迎通知
        # from .tasks import create_notification
        # create_notification.delay(
        #     instance.id,
        #     'system',
        #     '欢迎加入森林监测系统',
        #     f'您好 {instance.username}，欢迎使用森林监测系统！'
        # )