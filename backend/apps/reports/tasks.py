# apps/reports/tasks.py
"""
Report Celery tasks — 日报 / 设备统计 / 环境汇总生成。
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

from celery import shared_task
from django.db.models import Avg, Max, Q, Sum
from django.utils import timezone

from apps.alerts.models import Alert
from apps.devices.models import Device, DeviceTelemetry

from .models import DailyReport, DeviceStatistics, EnvironmentalData

logger = logging.getLogger(__name__)


def _parse_date(report_date_str: str):
    return datetime.strptime(report_date_str, '%Y-%m-%d').date()


def _org_env_labels(organization_id: int) -> set[str]:
    labels: set[str] = set()
    qs = Device.objects.filter(organization_id=organization_id).select_related('forest_zone_ref')
    for d in qs:
        for raw in (d.region, d.forest_zone, getattr(d.forest_zone_ref, 'name', None)):
            value = (raw or '').strip()
            if value:
                labels.add(value)
    return labels


def _build_daily_report_fields(report_date, organization_id: Optional[int] = None):
    """根据设备/告警/环境数据聚合日报字段（可按组织隔离）。"""
    devices = Device.objects.all()
    alerts = Alert.objects.filter(occurred_at__date=report_date)
    env_data = EnvironmentalData.objects.filter(stat_date=report_date)
    telem = DeviceTelemetry.objects.filter(timestamp__date=report_date)

    if organization_id is not None:
        devices = devices.filter(organization_id=organization_id)
        alerts = alerts.filter(
            Q(organization_id=organization_id)
            | Q(organization_id__isnull=True, device__organization_id=organization_id)
        )
        env_data = env_data.filter(organization_id=organization_id)
        telem = telem.filter(device__organization_id=organization_id)

    total_devices = devices.count()
    online_devices = devices.filter(status='online').count()
    online_rate = (online_devices / total_devices * 100) if total_devices > 0 else 0

    total_alerts = alerts.count()
    resolved_alerts = alerts.filter(status__in=['resolved', 'false_alarm']).count()
    false_alarm_count = alerts.filter(status='false_alarm').count()
    resolution_rate = (resolved_alerts / total_alerts * 100) if total_alerts > 0 else 0

    resolved_qs = alerts.filter(status='resolved', resolved_at__isnull=False, occurred_at__isnull=False)
    avg_response_time = 0
    if resolved_qs.exists():
        total_seconds = sum(
            max(0, (a.resolved_at - a.occurred_at).total_seconds())
            for a in resolved_qs
            if a.resolved_at and a.occurred_at
        )
        avg_response_time = int(total_seconds // resolved_qs.count())

    # 若无环境汇总，回退本组织遥测
    if not env_data.exists():
        avg_temperature = telem.aggregate(avg=Avg('temperature'))['avg']
        max_temperature = telem.aggregate(mx=Max('temperature'))['mx']
        avg_humidity = telem.aggregate(avg=Avg('humidity'))['avg']
        avg_wind_speed = telem.aggregate(avg=Avg('wind_speed'))['avg']
    else:
        avg_temperature = env_data.aggregate(avg=Avg('avg_temperature'))['avg']
        max_temperature = env_data.aggregate(mx=Max('max_temperature'))['mx']
        avg_humidity = env_data.aggregate(avg=Avg('avg_humidity'))['avg']
        avg_wind_speed = env_data.aggregate(avg=Avg('avg_wind_speed'))['avg']

    carbon_sequestration = total_devices * 0.5 + (avg_temperature or 0) * 0.1

    return {
        'total_devices': total_devices,
        'online_devices': online_devices,
        'online_rate': round(online_rate, 2),
        'total_alerts': total_alerts,
        'resolved_alerts': resolved_alerts,
        'resolution_rate': round(resolution_rate, 2),
        'avg_response_time': int(avg_response_time),
        'false_alarm_count': false_alarm_count,
        'false_alarm_rate': round((false_alarm_count / total_alerts * 100), 2) if total_alerts > 0 else 0,
        'avg_temperature': round(avg_temperature, 1) if avg_temperature is not None else None,
        'max_temperature': round(max_temperature, 1) if max_temperature is not None else None,
        'avg_humidity': round(avg_humidity, 1) if avg_humidity is not None else None,
        'avg_wind_speed': round(avg_wind_speed, 1) if avg_wind_speed is not None else None,
        'carbon_sequestration': round(carbon_sequestration, 2),
    }


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 3},
    soft_time_limit=120,
    time_limit=180,
)
def generate_daily_report(self, report_date_str: str, organization_id: Optional[int] = None):
    """生成或更新日报（按组织 + 日期唯一）。"""
    try:
        report_date = _parse_date(report_date_str)
        org_id = int(organization_id) if organization_id not in (None, '', 'null') else None
        fields = _build_daily_report_fields(report_date, org_id)
        report, created = DailyReport.objects.update_or_create(
            organization_id=org_id,
            report_date=report_date,
            defaults=fields,
        )
        logger.info(
            'Daily report %s for %s org=%s id=%s devices=%s alerts=%s',
            'created' if created else 'updated',
            report_date,
            org_id,
            report.id,
            fields.get('total_devices'),
            fields.get('total_alerts'),
        )
        return {
            'status': 'success',
            'report_id': report.id,
            'created': created,
            'report_date': str(report_date),
            'organization_id': org_id,
            'total_devices': fields.get('total_devices'),
            'total_alerts': fields.get('total_alerts'),
        }
    except Exception as exc:
        logger.exception('Error generating daily report: %s', exc)
        raise

@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 3},
    soft_time_limit=180,
    time_limit=240,
)
def generate_device_statistics(self, stat_date_str: str, organization_id: Optional[int] = None):
    """按设备聚合当日统计（可限定组织）。"""
    try:
        stat_date = _parse_date(stat_date_str)
        created = 0
        updated = 0
        org_id = int(organization_id) if organization_id not in (None, '', 'null') else None
        devices = Device.objects.all()
        if org_id is not None:
            devices = devices.filter(organization_id=org_id)

        for device in devices:
            day_alerts = Alert.objects.filter(device=device, occurred_at__date=stat_date)
            alert_count = day_alerts.count()
            fault_count = day_alerts.filter(alert_type='device_fault').count()

            # 在线时长估算：有心跳/遥测则按遥测跨度，否则按状态
            telem = DeviceTelemetry.objects.filter(device=device, timestamp__date=stat_date)
            telem_count = telem.count()
            if telem_count >= 2:
                first = telem.order_by('timestamp').first()
                last = telem.order_by('-timestamp').first()
                uptime_hours = max(
                    0.0,
                    (last.timestamp - first.timestamp).total_seconds() / 3600.0,
                )
                # 按期望 24 点采样估算完整率
                data_completeness = min(100.0, round(telem_count / 24 * 100, 2))
            elif device.status == 'online':
                uptime_hours = 24.0
                data_completeness = 100.0 if telem_count else 80.0
            else:
                uptime_hours = 0.0
                data_completeness = round(min(100.0, telem_count / 24 * 100), 2) if telem_count else 0.0

            availability_rate = round(min(100.0, uptime_hours / 24 * 100), 2)

            _, was_created = DeviceStatistics.objects.update_or_create(
                device=device,
                stat_date=stat_date,
                defaults={
                    'uptime_hours': round(uptime_hours, 2),
                    'availability_rate': availability_rate,
                    'alert_count': alert_count,
                    'fault_count': fault_count,
                    'data_completeness': data_completeness,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        logger.info(
            'Device statistics for %s org=%s: created=%s updated=%s',
            stat_date,
            org_id,
            created,
            updated,
        )
        return {
            'status': 'success',
            'stat_date': str(stat_date),
            'organization_id': org_id,
            'created': created,
            'updated': updated,
        }
    except Exception as exc:
        logger.exception('Error generating device statistics: %s', exc)
        raise


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 3},
    soft_time_limit=180,
    time_limit=240,
)
def generate_environmental_data(self, stat_date_str: str, organization_id: Optional[int] = None):
    """
    从 DeviceTelemetry 按「组织 + 区域」汇总环境数据。

    写入 EnvironmentalData：
    - (organization, region, date, hour) 小时汇总
    - (organization, region, date, hour=None) 日汇总
    """
    try:
        from datetime import time as dt_time

        stat_date = _parse_date(stat_date_str)
        org_id = int(organization_id) if organization_id not in (None, '', 'null') else None
        created = 0
        updated = 0

        # 按本地日边界过滤，避免 UTC 日期错位
        start = timezone.make_aware(datetime.combine(stat_date, dt_time.min))
        end = start + timedelta(days=1)
        telem = DeviceTelemetry.objects.filter(
            timestamp__gte=start,
            timestamp__lt=end,
        ).select_related('device')
        if org_id is not None:
            telem = telem.filter(device__organization_id=org_id)

        buckets: dict[tuple[Optional[int], str, int], list] = {}
        for row in telem:
            device_org = row.device.organization_id
            region = (row.device.region or row.device.forest_zone or '未分区').strip() or '未分区'
            local_ts = timezone.localtime(row.timestamp) if timezone.is_aware(row.timestamp) else row.timestamp
            hour = local_ts.hour
            buckets.setdefault((device_org, region, hour), []).append(row)

        def _agg_rows(rows: list) -> dict:
            temps = [r.temperature for r in rows if r.temperature is not None]
            hums = [r.humidity for r in rows if r.humidity is not None]
            winds = [r.wind_speed for r in rows if r.wind_speed is not None]
            lights = [r.light_intensity for r in rows if r.light_intensity is not None]
            soils = [r.soil_moisture_10cm for r in rows if r.soil_moisture_10cm is not None]
            fuels = [r.fuel_moisture for r in rows if r.fuel_moisture is not None]
            return {
                'avg_temperature': round(sum(temps) / len(temps), 1) if temps else None,
                'max_temperature': round(max(temps), 1) if temps else None,
                'min_temperature': round(min(temps), 1) if temps else None,
                'avg_humidity': round(sum(hums) / len(hums), 1) if hums else None,
                'max_humidity': round(max(hums), 1) if hums else None,
                'min_humidity': round(min(hums), 1) if hums else None,
                'avg_wind_speed': round(sum(winds) / len(winds), 1) if winds else None,
                'max_wind_speed': round(max(winds), 1) if winds else None,
                'avg_light_intensity': round(sum(lights) / len(lights), 1) if lights else None,
                'avg_soil_moisture': round(sum(soils) / len(soils), 1) if soils else None,
                'avg_fuel_moisture': round(sum(fuels) / len(fuels), 1) if fuels else None,
            }

        # 清理当日空占位（无有效指标），避免污染汇总
        stale = EnvironmentalData.objects.filter(
            stat_date=stat_date,
            avg_temperature__isnull=True,
            avg_humidity__isnull=True,
            avg_wind_speed__isnull=True,
        )
        if org_id is not None:
            stale = stale.filter(organization_id=org_id)
        stale.delete()

        org_region_day_rows: dict[tuple[Optional[int], str], list] = {}
        for (device_org, region, hour), rows in buckets.items():
            defaults = _agg_rows(rows)
            if all(v is None for v in defaults.values()):
                continue
            _, was_created = EnvironmentalData.objects.update_or_create(
                organization_id=device_org,
                region=region,
                stat_date=stat_date,
                stat_hour=hour,
                defaults=defaults,
            )
            if was_created:
                created += 1
            else:
                updated += 1
            org_region_day_rows.setdefault((device_org, region), []).extend(rows)

        for (device_org, region), rows in org_region_day_rows.items():
            defaults = _agg_rows(rows)
            _, was_created = EnvironmentalData.objects.update_or_create(
                organization_id=device_org,
                region=region,
                stat_date=stat_date,
                stat_hour=None,
                defaults=defaults,
            )
            if was_created:
                created += 1
            else:
                updated += 1

        logger.info(
            'Environmental data for %s org=%s: created=%s updated=%s buckets=%s telemetry=%s',
            stat_date,
            org_id,
            created,
            updated,
            len(buckets),
            telem.count(),
        )
        return {
            'status': 'success',
            'stat_date': str(stat_date),
            'organization_id': org_id,
            'created': created,
            'updated': updated,
            'telemetry_count': telem.count(),
            'bucket_count': len(buckets),
        }
    except Exception as exc:
        logger.exception('Error generating environmental data: %s', exc)
        raise


@shared_task
def generate_weekly_report(start_date_str, end_date_str):
    """生成周报摘要"""
    try:
        start_date = _parse_date(start_date_str)
        end_date = _parse_date(end_date_str)
        reports = DailyReport.objects.filter(
            report_date__gte=start_date,
            report_date__lte=end_date,
        )
        summary = {
            'period': f'{start_date} 至 {end_date}',
            'total_days': reports.count(),
            'avg_online_rate': reports.aggregate(avg=Avg('online_rate'))['avg'] or 0,
            'avg_resolution_rate': reports.aggregate(avg=Avg('resolution_rate'))['avg'] or 0,
            'total_alerts': reports.aggregate(total=Sum('total_alerts'))['total'] or 0,
            'total_carbon': reports.aggregate(total=Sum('carbon_sequestration'))['total'] or 0,
            'daily_data': list(reports.values('report_date', 'online_rate', 'total_alerts')),
        }
        logger.info('Weekly report generated: %s to %s', start_date, end_date)
        return {'status': 'success', 'summary': summary}
    except Exception as exc:
        logger.error('Error generating weekly report: %s', exc)
        raise


@shared_task
def generate_monthly_report(start_date_str, end_date_str):
    """生成月报摘要"""
    try:
        start_date = _parse_date(start_date_str)
        end_date = _parse_date(end_date_str)
        reports = DailyReport.objects.filter(
            report_date__gte=start_date,
            report_date__lte=end_date,
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
            'daily_data': list(
                reports.values(
                    'report_date',
                    'online_rate',
                    'resolution_rate',
                    'total_alerts',
                    'carbon_sequestration',
                )
            ),
        }
        logger.info('Monthly report generated: %s to %s', start_date, end_date)
        return {'status': 'success', 'summary': summary}
    except Exception as exc:
        logger.error('Error generating monthly report: %s', exc)
        raise


@shared_task
def generate_full_daily_pipeline(report_date_str: str, organization_id: Optional[int] = None):
    """闭环：环境 → 设备统计 → 日报（日报按组织落库）。"""
    org_id = int(organization_id) if organization_id not in (None, '', 'null') else None
    env = generate_environmental_data.apply(args=[report_date_str, org_id]).get()
    device = generate_device_statistics.apply(args=[report_date_str, org_id]).get()
    daily = generate_daily_report.apply(args=[report_date_str, org_id]).get()
    return {
        'status': 'success',
        'organization_id': org_id,
        'environmental': env,
        'device_statistics': device,
        'daily_report': daily,
    }


@shared_task
def generate_platform_daily_pipeline(report_date_str: str):
    """平台一键：环境全量重算 + 每个有设备的组织各自生成设备统计与日报。"""
    env = generate_environmental_data.apply(args=[report_date_str]).get()
    org_ids = sorted(
        {
            oid
            for oid in Device.objects.exclude(organization_id__isnull=True).values_list(
                'organization_id', flat=True
            )
            if oid is not None
        }
    )
    results = []
    for oid in org_ids:
        device = generate_device_statistics.apply(args=[report_date_str, oid]).get()
        daily = generate_daily_report.apply(args=[report_date_str, oid]).get()
        results.append(
            {'organization_id': oid, 'device_statistics': device, 'daily_report': daily}
        )
    # 清理历史空组织全量日报，避免平台汇总重复
    DailyReport.objects.filter(
        report_date=_parse_date(report_date_str),
        organization_id__isnull=True,
    ).delete()
    return {
        'status': 'success',
        'organization_ids': org_ids,
        'environmental': env,
        'org_results': results,
    }
