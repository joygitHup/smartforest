# apps/reports/tasks.py
"""
Report Celery tasks.
"""
from celery import shared_task
from django.utils import timezone
from django.db.models import Count, Avg, Q, Sum
from datetime import timedelta, datetime
import logging

from .models import DailyReport, DeviceStatistics, EnvironmentalData
from apps.devices.models import Device
from apps.alerts.models import Alert

logger = logging.getLogger(__name__)


@shared_task
def generate_daily_report(report_date_str):
    """生成日报"""
    try:
        report_date = datetime.strptime(report_date_str, '%Y-%m-%d').date()
        start_time = datetime.combine(report_date, datetime.min.time())
        end_time = datetime.combine(report_date, datetime.max.time())

        # 设备统计
        total_devices = Device.objects.count()
        online_devices = Device.objects.filter(status='online').count()
        online_rate = (online_devices / total_devices * 100) if total_devices > 0 else 0

        # 告警统计
        alerts = Alert.objects.filter(occurred_at__date=report_date)
        total_alerts = alerts.count()
        resolved_alerts = alerts.filter(status='resolved').count()
        false_alarm_count = alerts.filter(status='false_alarm').count()
        resolution_rate = (resolved_alerts / total_alerts * 100) if total_alerts > 0 else 0

        # 平均响应时间（从发生到处置）
        resolved_alerts_with_time = alerts.filter(
            status='resolved',
            resolved_at__isnull=False
        )
        avg_response_time = 0
        if resolved_alerts_with_time.exists():
            total_seconds = sum(
                (a.resolved_at - a.occurred_at).total_seconds()
                for a in resolved_alerts_with_time
            )
            avg_response_time = total_seconds // resolved_alerts_with_time.count()

        # 环境数据
        env_data = EnvironmentalData.objects.filter(stat_date=report_date)
        avg_temperature = env_data.aggregate(avg=Avg('avg_temperature'))['avg']
        max_temperature = env_data.aggregate(max=Max('max_temperature'))['max']
        avg_humidity = env_data.aggregate(avg=Avg('avg_humidity'))['avg']
        avg_wind_speed = env_data.aggregate(avg=Avg('avg_wind_speed'))['avg']

        # 计算碳汇（简化算法）
        carbon_sequestration = total_devices * 0.5 + (avg_temperature or 0) * 0.1

        # 创建日报
        report = DailyReport.objects.create(
            report_date=report_date,
            total_devices=total_devices,
            online_devices=online_devices,
            online_rate=round(online_rate, 2),
            total_alerts=total_alerts,
            resolved_alerts=resolved_alerts,
            resolution_rate=round(resolution_rate, 2),
            avg_response_time=int(avg_response_time),
            false_alarm_count=false_alarm_count,
            false_alarm_rate=round((false_alarm_count / total_alerts * 100), 2) if total_alerts > 0 else 0,
            avg_temperature=round(avg_temperature, 1) if avg_temperature else None,
            max_temperature=round(max_temperature, 1) if max_temperature else None,
            avg_humidity=round(avg_humidity, 1) if avg_humidity else None,
            avg_wind_speed=round(avg_wind_speed, 1) if avg_wind_speed else None,
            carbon_sequestration=round(carbon_sequestration, 2)
        )

        logger.info(f'Daily report generated for {report_date}')
        return {'status': 'success', 'report_id': report.id}

    except Exception as e:
        logger.error(f'Error generating daily report: {e}')
        raise


@shared_task
def generate_weekly_report(start_date_str, end_date_str):
    """生成周报"""
    try:
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()

        reports = DailyReport.objects.filter(
            report_date__gte=start_date,
            report_date__lte=end_date
        )

        summary = {
            'period': f'{start_date} 至 {end_date}',
            'total_days': reports.count(),
            'avg_online_rate': reports.aggregate(avg=Avg('online_rate'))['avg'] or 0,
            'avg_resolution_rate': reports.aggregate(avg=Avg('resolution_rate'))['avg'] or 0,
            'total_alerts': reports.aggregate(total=Sum('total_alerts'))['total'] or 0,
            'total_carbon': reports.aggregate(total=Sum('carbon_sequestration'))['total'] or 0,
            'daily_data': list(reports.values('report_date', 'online_rate', 'total_alerts'))
        }

        logger.info(f'Weekly report generated: {start_date} to {end_date}')
        return {'status': 'success', 'summary': summary}

    except Exception as e:
        logger.error(f'Error generating weekly report: {e}')
        raise


@shared_task
def generate_monthly_report(start_date_str, end_date_str):
    """生成月报"""
    try:
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()

        reports = DailyReport.objects.filter(
            report_date__gte=start_date,
            report_date__lte=end_date
        )

        summary = {
            'period': f'{start_date} 至 {end_date}',
            'total_days': reports.count(),
            'avg_online_rate': reports.aggregate(avg=Avg('online_rate'))['avg'] or 0,
            'avg_resolution_rate': reports.aggregate(avg=Avg('resolution_rate'))['avg'] or 0,
            'total_alerts': reports.aggregate(total=Sum('total_alerts'))['total'] or 0,
            'total_false_alarms': reports.aggregate(total=Sum('false_alarm_count'))['total'] or 0,
            'total_carbon': reports.aggregate(total=Sum('carbon_sequestration'))['total'] or 0,
            'avg_response_time': reports.aggregate(avg=Avg('avg_response_time'))['avg'] or 0,
            'daily_data': list(reports.values(
                'report_date', 'online_rate', 'resolution_rate',
                'total_alerts', 'carbon_sequestration'
            ))
        }

        logger.info(f'Monthly report generated: {start_date} to {end_date}')
        return {'status': 'success', 'summary': summary}

    except Exception as e:
        logger.error(f'Error generating monthly report: {e}')
        raise