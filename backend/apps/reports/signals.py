# apps/reports/signals.py
"""
Report signal handlers.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
import logging

from .models import DailyReport

logger = logging.getLogger(__name__)


@receiver(post_save, sender=DailyReport)
def daily_report_post_save(sender, instance, created, **kwargs):
    """日报创建后的处理"""
    if created:
        logger.info(f'Daily report created: {instance.report_date}')