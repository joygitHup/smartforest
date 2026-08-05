"""
Device signal handlers.
"""
from django.db.models.signals import pre_delete, post_save
from django.dispatch import receiver
from django.utils import timezone
import logging

from .models import Device, DeviceCommand

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Device)
def device_post_save(sender, instance, created, **kwargs):
    """设备保存后的处理"""
    if created:
        logger.info(f'新设备创建: {instance.device_id} - {instance.device_name}')
    else:
        # 检查状态变化
        if hasattr(instance, '_original_status'):
            if instance._original_status != instance.status:
                logger.info(f'设备状态变化: {instance.device_id} {instance._original_status} -> {instance.status}')


@receiver(pre_delete, sender=Device)
def device_pre_delete(sender, instance, **kwargs):
    """设备删除前的处理"""
    logger.info(f'设备即将删除: {instance.device_id} - {instance.device_name}')
    # 可以在这里发送通知或清理缓存