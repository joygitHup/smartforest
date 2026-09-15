# core/dashboard_views.py
"""
指挥中心聚合 API。
"""
from datetime import datetime, time, timedelta

from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.alerts.models import Alert, FireTracing
from apps.alerts.serializers import AlertListSerializer, FireTracingSerializer
from apps.devices.models import Device, DeviceTelemetry
from apps.reports.models import DailyReport, EnvironmentalData
from apps.users.models import ForestZone
from apps.users.org_scope import (
    filter_alerts_for_user,
    filter_by_org_scope,
    get_user_org_scope_ids,
    scope_payload,
)
from core.perf_cache import (
    DASHBOARD_OVERVIEW_KEY,
    DASHBOARD_OVERVIEW_TTL,
    DASHBOARD_REGIONS_KEY,
    DASHBOARD_REGIONS_TTL,
    cache_get,
    cache_set,
    scope_cache_token,
)


def _scoped_environmental(user, qs=None):
    """EnvironmentalData 按 organization_id 隔离；平台用户看全部。"""
    qs = qs if qs is not None else EnvironmentalData.objects.all()
    return filter_by_org_scope(qs, user, field='organization_id')


def _day_bounds(day):
    """本地日界，便于走 occurred_at 索引（避免 __date 函数）。"""
    start = timezone.make_aware(datetime.combine(day, time.min))
    end = start + timedelta(days=1)
    return start, end


def _build_zone_region_options(user):
    """
    构建林区/片区筛选项。
    每个林区使用其自身 regions（可多个）；并合并挂在该林区下的设备 region。
    """
    devices_qs = filter_by_org_scope(Device.objects.all(), user)
    zone_qs = filter_by_org_scope(
        ForestZone.objects.filter(is_active=True).select_related('organization'),
        user,
        field='organization_id',
    )

    forest_zone_items = []
    regions_by_forest_zone: dict[str, list[str]] = {}
    forest_zones: list[str] = []
    all_regions: set[str] = set()

    for z in zone_qs.order_by('sort_order', 'name'):
        related: list[str] = []
        for name in z.get_region_list():
            if name not in related:
                related.append(name)
        device_regions = (
            devices_qs.filter(
                Q(forest_zone_ref_id=z.id) | Q(forest_zone=z.name)
            )
            .exclude(region='')
            .values_list('region', flat=True)
            .distinct()
        )
        for raw in device_regions:
            value = (raw or '').strip()
            if value and value not in related:
                related.append(value)
        related = sorted(related)
        forest_zones.append(z.name)
        regions_by_forest_zone[z.name] = related
        all_regions.update(related)
        forest_zone_items.append({
            'id': z.id,
            'name': z.name,
            'code': z.code,
            'organization_id': z.organization_id,
            'organization_name': getattr(z.organization, 'name', None),
            'region': related[0] if related else '',
            'regions': related,
        })

    if not forest_zones:
        for name in sorted(
            set(
                devices_qs.exclude(forest_zone='')
                .values_list('forest_zone', flat=True)
                .distinct()
            )
        ):
            related = sorted(
                set(
                    devices_qs.filter(forest_zone=name)
                    .exclude(region='')
                    .values_list('region', flat=True)
                    .distinct()
                )
            )
            forest_zones.append(name)
            regions_by_forest_zone[name] = related
            all_regions.update(related)
            forest_zone_items.append({
                'id': None,
                'name': name,
                'code': '',
                'organization_id': None,
                'organization_name': None,
                'region': related[0] if related else '',
                'regions': related,
            })

    return {
        'regions': sorted(all_regions),
        'forest_zones': forest_zones,
        'forest_zone_items': forest_zone_items,
        'regions_by_forest_zone': regions_by_forest_zone,
    }


def _build_overview_payload(request, region: str, forest_zone: str) -> dict:
    today = timezone.localdate()
    yesterday = today - timedelta(days=1)
    today_start, today_end = _day_bounds(today)
    yesterday_start, yesterday_end = _day_bounds(yesterday)

    devices_qs = filter_by_org_scope(Device.objects.all(), request.user)
    alerts_qs = filter_alerts_for_user(
        Alert.objects.select_related('device').all(), request.user
    )
    scope = get_user_org_scope_ids(request.user)
    if scope is None:
        tracing_qs = FireTracing.objects.select_related('alert', 'alert__device').all()
    elif not scope:
        tracing_qs = FireTracing.objects.none()
    else:
        tracing_qs = FireTracing.objects.select_related('alert', 'alert__device').filter(
            Q(alert__organization_id__in=scope)
            | Q(
                alert__organization_id__isnull=True,
                alert__device__organization_id__in=scope,
            )
        )

    if forest_zone:
        devices_qs = devices_qs.filter(
            Q(forest_zone__icontains=forest_zone)
            | Q(forest_zone_ref__name__icontains=forest_zone)
        )
        alerts_qs = alerts_qs.filter(
            Q(forest_zone__icontains=forest_zone)
            | Q(forest_zone_ref__name__icontains=forest_zone)
            | Q(device__forest_zone__icontains=forest_zone)
            | Q(device__forest_zone_ref__name__icontains=forest_zone)
        )
        tracing_qs = tracing_qs.filter(
            Q(alert__forest_zone__icontains=forest_zone)
            | Q(alert__forest_zone_ref__name__icontains=forest_zone)
            | Q(alert__device__forest_zone__icontains=forest_zone)
            | Q(alert__device__forest_zone_ref__name__icontains=forest_zone)
        )
    if region:
        devices_qs = devices_qs.filter(region__icontains=region)
        alerts_qs = alerts_qs.filter(
            Q(region__icontains=region) | Q(device__region__icontains=region)
        )
        tracing_qs = tracing_qs.filter(
            Q(alert__region__icontains=region)
            | Q(alert__device__region__icontains=region)
        )

    # —— 设备 KPI：一次聚合 ——
    device_agg = devices_qs.aggregate(
        total=Count('id'),
        online=Count('id', filter=Q(status='online')),
        offline=Count('id', filter=Q(status='offline')),
        alarm=Count('id', filter=Q(status='alarm')),
        maintenance=Count('id', filter=Q(status='maintenance')),
    )
    device_stats = {
        'total': device_agg['total'] or 0,
        'online': device_agg['online'] or 0,
        'offline': device_agg['offline'] or 0,
        'alarm': device_agg['alarm'] or 0,
        'maintenance': device_agg['maintenance'] or 0,
    }

    # —— 告警 KPI ——
    today_alerts = alerts_qs.filter(occurred_at__gte=today_start, occurred_at__lt=today_end)
    yesterday_alerts = alerts_qs.filter(
        occurred_at__gte=yesterday_start, occurred_at__lt=yesterday_end
    )
    alert_agg = today_alerts.aggregate(
        today_count=Count('id'),
        unresolved=Count('id', filter=~Q(status__in=['resolved', 'false_alarm'])),
        false_alarms=Count('id', filter=Q(status='false_alarm')),
    )
    today_count = alert_agg['today_count'] or 0
    unresolved = alert_agg['unresolved'] or 0
    false_alarms = alert_agg['false_alarms'] or 0
    yesterday_count = yesterday_alerts.count()

    daily_qs = filter_by_org_scope(
        DailyReport.objects.all(), request.user
    ).filter(report_date=today)
    org_daily = daily_qs.exclude(organization_id__isnull=True)
    if org_daily.exists():
        daily_qs = org_daily
    daily_agg = daily_qs.aggregate(
        false_alarm_count=Sum('false_alarm_count'),
        total_alerts=Sum('total_alerts'),
        carbon_sequestration=Sum('carbon_sequestration'),
    )
    if daily_qs.exists() and (daily_agg['total_alerts'] or 0) > 0:
        false_alarm_rate = round(
            (daily_agg['false_alarm_count'] or 0) / daily_agg['total_alerts'] * 100,
            2,
        )
    else:
        false_alarm_rate = (
            round(false_alarms / today_count * 100, 2) if today_count else 0
        )

    recent = list(today_alerts.order_by('-occurred_at')[:10])
    recent_data = AlertListSerializer(recent, many=True).data
    for item, obj in zip(recent_data, recent):
        item['longitude'] = (
            float(obj.longitude) if obj.longitude is not None
            else (float(obj.device.longitude) if obj.device and obj.device.longitude is not None else None)
        )
        item['latitude'] = (
            float(obj.latitude) if obj.latitude is not None
            else (float(obj.device.latitude) if obj.device and obj.device.latitude is not None else None)
        )

    env_qs = _scoped_environmental(
        request.user,
        EnvironmentalData.objects.filter(stat_date=today),
    )
    zone_opts = _build_zone_region_options(request.user)
    if region:
        env_qs = env_qs.filter(region=region)
    elif forest_zone:
        related = zone_opts['regions_by_forest_zone'].get(forest_zone) or []
        if related:
            env_qs = env_qs.filter(region__in=related)
        else:
            env_qs = env_qs.filter(region__icontains=forest_zone)
    env_agg = env_qs.aggregate(
        avg_temperature=Avg('avg_temperature'),
        avg_humidity=Avg('avg_humidity'),
        avg_wind_speed=Avg('avg_wind_speed'),
    )
    if env_agg['avg_temperature'] is None and env_agg['avg_humidity'] is None:
        telem = filter_by_org_scope(
            DeviceTelemetry.objects.filter(
                timestamp__gte=today_start, timestamp__lt=today_end
            ),
            request.user,
            field='device__organization_id',
        )
        if forest_zone:
            telem = telem.filter(
                Q(device__forest_zone__icontains=forest_zone)
                | Q(device__forest_zone_ref__name__icontains=forest_zone)
            )
        if region:
            telem = telem.filter(device__region__icontains=region)
        env_agg = telem.aggregate(
            avg_temperature=Avg('temperature'),
            avg_humidity=Avg('humidity'),
            avg_wind_speed=Avg('wind_speed'),
        )

    carbon = daily_agg.get('carbon_sequestration') if daily_qs.exists() else None
    if carbon is None:
        year_start = today.replace(month=1, day=1)
        carbon = (
            filter_by_org_scope(DailyReport.objects.all(), request.user)
            .filter(report_date__gte=year_start)
            .aggregate(total=Sum('carbon_sequestration'))['total']
            or 0
        )
        carbon_source = 'year_to_date'
    else:
        carbon_source = 'daily_report'

    active_statuses = ['new', 'acknowledged', 'dispatched', 'processing', 'escalated']
    fire_agg = tracing_qs.aggregate(
        total=Count('id'),
        active_count=Count('id', filter=Q(alert__status__in=active_statuses)),
    )
    active_tracings = (
        tracing_qs.filter(alert__status__in=active_statuses).order_by('-created_at')[:5]
    )
    fire_stats = {
        'active_count': fire_agg['active_count'] or 0,
        'total': fire_agg['total'] or 0,
        'highlights': FireTracingSerializer(active_tracings, many=True).data,
    }

    map_fields = (
        'id', 'device_id', 'device_name', 'device_type', 'status',
        'longitude', 'latitude', 'region', 'forest_zone',
        'signal_strength', 'battery_level', 'last_online_time',
        'pan_angle', 'tilt_angle',
    )
    map_devices = []
    for d in (
        devices_qs.exclude(longitude__isnull=True)
        .exclude(latitude__isnull=True)
        .only(*map_fields)[:500]
    ):
        map_devices.append({
            'id': d.id,
            'device_id': d.device_id,
            'device_name': d.device_name,
            'device_type': d.device_type,
            'device_type_display': d.get_device_type_display(),
            'status': d.status,
            'status_display': d.get_status_display(),
            'longitude': float(d.longitude),
            'latitude': float(d.latitude),
            'region': d.region or '',
            'forest_zone': d.forest_zone or '',
            'signal_strength': d.signal_strength,
            'battery_level': d.battery_level,
            'last_online_time': d.last_online_time,
            'pan_angle': float(d.pan_angle) if d.pan_angle is not None else None,
            'tilt_angle': float(d.tilt_angle) if d.tilt_angle is not None else None,
        })

    regions = zone_opts['regions']
    if forest_zone:
        regions = zone_opts['regions_by_forest_zone'].get(forest_zone, regions)

    return {
        'generated_at': timezone.now().isoformat(),
        'org_scope': scope_payload(request.user),
        'filters': {
            'region': region or None,
            'forest_zone': forest_zone or None,
            'regions': regions,
            'forest_zones': zone_opts['forest_zones'],
            'forest_zone_items': zone_opts['forest_zone_items'],
            'regions_by_forest_zone': zone_opts['regions_by_forest_zone'],
        },
        'devices': device_stats,
        'alerts': {
            'today': today_count,
            'yesterday': yesterday_count,
            'vs_yesterday': today_count - yesterday_count,
            'unresolved': unresolved,
            'false_alarm_rate': false_alarm_rate,
            'recent': recent_data,
        },
        'environment': {
            'avg_temperature': (
                round(env_agg['avg_temperature'], 1)
                if env_agg['avg_temperature'] is not None else None
            ),
            'avg_humidity': (
                round(env_agg['avg_humidity'], 1)
                if env_agg['avg_humidity'] is not None else None
            ),
            'avg_wind_speed': (
                round(env_agg['avg_wind_speed'], 1)
                if env_agg['avg_wind_speed'] is not None else None
            ),
        },
        'carbon': {
            'value': round(float(carbon or 0), 2),
            'unit': 't',
            'source': carbon_source,
        },
        'fire_tracing': fire_stats,
        'map_devices': map_devices,
    }


class DashboardOverviewView(APIView):
    """
    GET /api/dashboard/overview/?region=&forest_zone=
    聚合设备 / 告警 / 环境 / 碳汇 / 火情 / 地图点位。
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        region = (request.query_params.get('region') or '').strip()
        forest_zone = (request.query_params.get('forest_zone') or '').strip()
        scope = get_user_org_scope_ids(request.user)
        cache_key = DASHBOARD_OVERVIEW_KEY.format(
            user_id=request.user.id,
            scope=scope_cache_token(scope),
            forest_zone=forest_zone or '-',
            region=region or '-',
        )
        cached = cache_get(cache_key)
        if cached is not None:
            return Response(cached)

        payload = _build_overview_payload(request, region, forest_zone)
        cache_set(cache_key, payload, DASHBOARD_OVERVIEW_TTL)
        return Response(payload)


class DashboardRegionsView(APIView):
    """GET /api/dashboard/regions/ — 林区为主，附带林区→片区关联"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = get_user_org_scope_ids(request.user)
        cache_key = DASHBOARD_REGIONS_KEY.format(
            user_id=request.user.id,
            scope=scope_cache_token(scope),
        )
        cached = cache_get(cache_key)
        if cached is not None:
            return Response(cached)
        payload = _build_zone_region_options(request.user)
        cache_set(cache_key, payload, DASHBOARD_REGIONS_TTL)
        return Response(payload)
