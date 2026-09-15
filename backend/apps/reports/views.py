# apps/reports/views.py
"""
Report views for API.
"""
from datetime import datetime, timedelta

from django.db.models import Avg, Count, Max, Min, Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.alerts.models import Alert
from apps.core.filters import (
    ASGICompatibleDjangoFilterBackend,
    ASGICompatibleOrderingFilter,
    ASGICompatibleSearchFilter,
)
from apps.devices.models import Device
from apps.users.mixins import OrgScopedQuerysetMixin
from apps.users.org_scope import (
    filter_alerts_for_user,
    filter_by_org_scope,
    get_user_org_scope_ids,
    is_unrestricted_viewer,
    resolve_create_organization_id,
)

from .export_utils import daily_report_to_csv_response
from .filters import DailyReportFilter, DeviceStatisticsFilter, EnvironmentalDataFilter
from .models import DailyReport, DeviceStatistics, EnvironmentalData
from .serializers import (
    DailyReportCreateSerializer,
    DailyReportDetailSerializer,
    DailyReportListSerializer,
    DailyReportUpdateSerializer,
    DeviceStatisticsCreateSerializer,
    DeviceStatisticsDetailSerializer,
    DeviceStatisticsListSerializer,
    DeviceStatisticsUpdateSerializer,
    EnvironmentalDataCreateSerializer,
    EnvironmentalDataDetailSerializer,
    EnvironmentalDataListSerializer,
)
from .tasks import (
    generate_daily_report,
    generate_device_statistics,
    generate_environmental_data,
    generate_full_daily_pipeline,
    generate_monthly_report,
    generate_platform_daily_pipeline,
    generate_weekly_report,
)


def _parse_date_param(value, default=None):
    if not value:
        return default
    if hasattr(value, 'year'):
        return value
    try:
        return datetime.strptime(str(value)[:10], '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return default


def _scoped_devices(user):
    return filter_by_org_scope(Device.objects.all(), user, field='organization_id')


def _scoped_alerts(user):
    return filter_alerts_for_user(Alert.objects.all(), user)


def _scoped_daily_reports(user):
    return filter_by_org_scope(DailyReport.objects.all(), user, field='organization_id')


def _scoped_device_statistics(user):
    return filter_by_org_scope(
        DeviceStatistics.objects.select_related('device').all(),
        user,
        field='device__organization_id',
    )


def _scoped_environmental(user, qs=None):
    """EnvironmentalData 按 organization_id 隔离；平台用户看全部。"""
    qs = qs if qs is not None else EnvironmentalData.objects.all()
    return filter_by_org_scope(qs, user, field='organization_id')


def _rollup_daily_report_payload(queryset):
    """将多条组织日报滚成平台汇总（同日）。"""
    # 优先只用有组织归属的日报，避免与历史「空组织全量行」重复加总
    org_qs = queryset.exclude(organization_id__isnull=True)
    qs = org_qs if org_qs.exists() else queryset
    qs = qs.order_by('organization_id')
    count = qs.count()
    if count == 0:
        return None
    if count == 1:
        return DailyReportDetailSerializer(qs.first()).data

    agg = qs.aggregate(
        total_devices=Sum('total_devices'),
        online_devices=Sum('online_devices'),
        total_alerts=Sum('total_alerts'),
        resolved_alerts=Sum('resolved_alerts'),
        false_alarm_count=Sum('false_alarm_count'),
        avg_response_time=Avg('avg_response_time'),
        avg_temperature=Avg('avg_temperature'),
        max_temperature=Max('max_temperature'),
        avg_humidity=Avg('avg_humidity'),
        avg_wind_speed=Avg('avg_wind_speed'),
        carbon_sequestration=Sum('carbon_sequestration'),
    )
    total_devices = agg['total_devices'] or 0
    online_devices = agg['online_devices'] or 0
    total_alerts = agg['total_alerts'] or 0
    resolved_alerts = agg['resolved_alerts'] or 0
    false_alarm_count = agg['false_alarm_count'] or 0
    report_date = qs.first().report_date
    return {
        'id': None,
        'organization': None,
        'organization_id': None,
        'organization_name': '平台汇总',
        'report_date': report_date,
        'total_devices': total_devices,
        'online_devices': online_devices,
        'online_rate': round(online_devices / total_devices * 100, 2) if total_devices else 0,
        'total_alerts': total_alerts,
        'resolved_alerts': resolved_alerts,
        'resolution_rate': round(resolved_alerts / total_alerts * 100, 2) if total_alerts else 0,
        'avg_response_time': int(agg['avg_response_time'] or 0),
        'false_alarm_count': false_alarm_count,
        'false_alarm_rate': round(false_alarm_count / total_alerts * 100, 2) if total_alerts else 0,
        'avg_temperature': round(agg['avg_temperature'], 1) if agg['avg_temperature'] is not None else None,
        'max_temperature': round(agg['max_temperature'], 1) if agg['max_temperature'] is not None else None,
        'avg_humidity': round(agg['avg_humidity'], 1) if agg['avg_humidity'] is not None else None,
        'avg_wind_speed': round(agg['avg_wind_speed'], 1) if agg['avg_wind_speed'] is not None else None,
        'carbon_sequestration': round(agg['carbon_sequestration'] or 0, 2),
        'is_platform_rollup': True,
        'org_report_count': count,
    }


def _dispatch_task(task, *args, sync=False):
    """优先异步；sync=True 或 broker 失败时同步执行。"""
    if sync:
        result = task.apply(args=args).get()
        return {'mode': 'sync', 'result': result, 'task_id': None}
    try:
        async_result = task.delay(*args)
        return {'mode': 'async', 'task_id': async_result.id, 'result': None}
    except Exception:
        result = task.apply(args=args).get()
        return {'mode': 'sync_fallback', 'result': result, 'task_id': None}


class DailyReportViewSet(OrgScopedQuerysetMixin, viewsets.ModelViewSet):
    """日报视图集"""
    queryset = DailyReport.objects.select_related('organization').all()
    permission_classes = [IsAuthenticated]
    filterset_class = DailyReportFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['report_date']
    ordering_fields = [
        'report_date', 'online_rate', 'resolution_rate', 'total_alerts', 'created_at'
    ]
    ordering = ['-report_date']
    lookup_field = 'pk'
    org_scope_field = 'organization_id'

    def get_serializer_class(self):
        if self.action == 'list':
            return DailyReportListSerializer
        if self.action == 'create':
            return DailyReportCreateSerializer
        if self.action in ['update', 'partial_update']:
            return DailyReportUpdateSerializer
        return DailyReportDetailSerializer

    @action(detail=False, methods=['get'])
    def by_date(self, request):
        """按日期获取日报（平台用户为全组织汇总）。"""
        report_date = _parse_date_param(request.query_params.get('report_date'))
        if not report_date:
            return Response(
                {'error': '请提供 report_date=YYYY-MM-DD'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = self.get_queryset().filter(report_date=report_date)
        payload = _rollup_daily_report_payload(qs)
        if not payload:
            return Response(
                {'error': f'{report_date} 的日报不存在', 'report_date': str(report_date)},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(payload)

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """生成日报；force 可覆盖；sync 同步执行；full 连带环境/设备统计"""
        report_date = _parse_date_param(request.data.get('report_date'))
        if request.data.get('report_date') and report_date is None:
            return Response(
                {'error': '日期格式错误，请使用 YYYY-MM-DD 格式'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if report_date is None:
            report_date = timezone.localdate() - timedelta(days=1)

        force = bool(request.data.get('force', False))
        sync = bool(request.data.get('sync', True))
        full = bool(request.data.get('full', True))
        requested_org = request.data.get('organization_id')

        # 平台用户未指定组织：为所有有设备的组织生成，汇总视角看全量
        if (
            is_unrestricted_viewer(request.user)
            and requested_org in (None, '', 'null')
            and full
        ):
            existing = self.get_queryset().filter(report_date=report_date).exclude(
                organization_id__isnull=True
            )
            if existing.exists() and not force:
                return Response(
                    {
                        'error': f'{report_date} 已有组织日报',
                        'hint': '传入 force=true 可重新生成全平台',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            dispatched = _dispatch_task(
                generate_platform_daily_pipeline, str(report_date), sync=sync
            )
            return Response(
                {
                    'status': 'success' if dispatched['mode'] != 'async' else 'processing',
                    'report_date': str(report_date),
                    'scope': 'platform',
                    'mode': dispatched['mode'],
                    'task_id': dispatched['task_id'],
                    'message': f'平台日报生成{"完成" if dispatched["mode"] != "async" else "任务已提交"}: {report_date}',
                    'result': dispatched['result'],
                },
                status=(
                    status.HTTP_200_OK
                    if dispatched['mode'] != 'async'
                    else status.HTTP_202_ACCEPTED
                ),
            )

        try:
            org_id = resolve_create_organization_id(
                request.user,
                int(requested_org) if requested_org not in (None, '') else None,
            )
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        exists = self.get_queryset().filter(
            report_date=report_date,
            organization_id=org_id,
        ).exists()
        if exists and not force:
            return Response(
                {
                    'error': f'{report_date} 的日报已存在',
                    'hint': '传入 force=true 可重新生成',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = generate_full_daily_pipeline if full else generate_daily_report
        dispatched = _dispatch_task(task, str(report_date), org_id, sync=sync)

        payload = {
            'status': 'success' if dispatched['mode'] != 'async' else 'processing',
            'report_date': str(report_date),
            'organization_id': org_id,
            'mode': dispatched['mode'],
            'task_id': dispatched['task_id'],
            'message': f'日报生成{"完成" if dispatched["mode"] != "async" else "任务已提交"}: {report_date}',
            'result': dispatched['result'],
        }
        http_status = (
            status.HTTP_200_OK
            if dispatched['mode'] != 'async'
            else status.HTTP_202_ACCEPTED
        )
        return Response(payload, status=http_status)

    @action(detail=True, methods=['post'])
    def regenerate(self, request, pk=None):
        """重新生成日报"""
        report = self.get_object()
        sync = bool(request.data.get('sync', True))
        full = bool(request.data.get('full', True))
        org_id = report.organization_id
        if org_id is None:
            try:
                org_id = resolve_create_organization_id(request.user)
            except Exception as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        task = generate_full_daily_pipeline if full else generate_daily_report
        dispatched = _dispatch_task(task, str(report.report_date), org_id, sync=sync)
        return Response({
            'status': 'success' if dispatched['mode'] != 'async' else 'processing',
            'report_date': str(report.report_date),
            'organization_id': org_id,
            'mode': dispatched['mode'],
            'task_id': dispatched['task_id'],
            'message': f'日报重新生成: {report.report_date}',
            'result': dispatched['result'],
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """获取日报汇总（平台按日历日聚合多组织）。"""
        days = int(request.GET.get('days', 30))
        start_date = timezone.localdate() - timedelta(days=days)
        reports = self.get_queryset().filter(report_date__gte=start_date)
        # 平台汇总排除空组织历史全量行，避免与分组织日报重复
        if is_unrestricted_viewer(request.user):
            org_reports = reports.exclude(organization_id__isnull=True)
            if org_reports.exists():
                reports = org_reports

        by_day = (
            reports.values('report_date')
            .annotate(
                total_devices=Sum('total_devices'),
                online_devices=Sum('online_devices'),
                total_alerts=Sum('total_alerts'),
                resolved_alerts=Sum('resolved_alerts'),
                false_alarm_count=Sum('false_alarm_count'),
                avg_response_time=Avg('avg_response_time'),
                carbon=Sum('carbon_sequestration'),
            )
            .order_by('report_date')
        )
        day_rows = list(by_day)
        online_rates = []
        resolution_rates = []
        alert_totals = []
        dates = []
        for row in day_rows:
            td = row['total_devices'] or 0
            od = row['online_devices'] or 0
            ta = row['total_alerts'] or 0
            ra = row['resolved_alerts'] or 0
            online_rates.append(round(od / td * 100, 2) if td else 0)
            resolution_rates.append(round(ra / ta * 100, 2) if ta else 0)
            alert_totals.append(ta)
            dates.append(str(row['report_date']))

        total_alerts = reports.aggregate(total=Sum('total_alerts'))['total'] or 0
        total_false = reports.aggregate(total=Sum('false_alarm_count'))['total'] or 0
        return Response({
            'date_range': {
                'start': start_date,
                'end': timezone.localdate(),
            },
            'total_days': len(day_rows),
            'avg_online_rate': round(sum(online_rates) / len(online_rates), 2) if online_rates else 0,
            'avg_resolution_rate': (
                round(sum(resolution_rates) / len(resolution_rates), 2) if resolution_rates else 0
            ),
            'total_alerts': total_alerts,
            'total_false_alarms': total_false,
            'avg_response_time': reports.aggregate(avg=Avg('avg_response_time'))['avg'] or 0,
            'total_carbon': reports.aggregate(total=Sum('carbon_sequestration'))['total'] or 0,
            'trend': {
                'online_rate': online_rates,
                'resolution_rate': resolution_rates,
                'total_alerts': alert_totals,
                'dates': dates,
            },
        })

    @action(detail=False, methods=['get'])
    def alert_analysis(self, request):
        """告警分析（按本地日或近 N 天）— 报表中心「告警分析」页，数据源 Alert 表。"""
        from datetime import time as dt_time

        report_date = _parse_date_param(request.query_params.get('report_date'))
        days = int(request.query_params.get('days', 1))
        done_statuses = ('resolved', 'false_alarm')
        open_statuses = ('new', 'acknowledged', 'dispatched', 'processing', 'escalated')

        if report_date:
            day_start = timezone.make_aware(datetime.combine(report_date, dt_time.min))
            day_end = day_start + timedelta(days=1)
            alerts = _scoped_alerts(request.user).filter(
                occurred_at__gte=day_start, occurred_at__lt=day_end
            )
            period = str(report_date)
        else:
            range_start = timezone.localdate() - timedelta(days=max(days - 1, 0))
            day_start = timezone.make_aware(datetime.combine(range_start, dt_time.min))
            alerts = _scoped_alerts(request.user).filter(occurred_at__gte=day_start)
            period = f'{range_start} ~ {timezone.localdate()}'

        total = alerts.count()
        resolved_count = alerts.filter(status='resolved').count()
        false_alarm_count = alerts.filter(status='false_alarm').count()
        closed_count = resolved_count + false_alarm_count
        open_count = alerts.filter(status__in=open_statuses).count()

        resolved_with_time = list(
            alerts.filter(
                status='resolved',
                resolved_at__isnull=False,
                occurred_at__isnull=False,
            ).only('occurred_at', 'resolved_at')
        )
        avg_response_seconds = 0
        if resolved_with_time:
            avg_response_seconds = int(
                sum(
                    max(0, (a.resolved_at - a.occurred_at).total_seconds())
                    for a in resolved_with_time
                    if a.resolved_at and a.occurred_at
                )
                / len(resolved_with_time)
            )

        by_level = []
        for level, label in [
            ('level_1', '一级(紧急)'),
            ('level_2', '二级(预警)'),
            ('level_3', '三级(提示)'),
        ]:
            qs = alerts.filter(alert_level=level)
            level_total = qs.count()
            level_resolved = qs.filter(status__in=done_statuses).count()
            level_timed = list(
                qs.filter(
                    status='resolved',
                    resolved_at__isnull=False,
                    occurred_at__isnull=False,
                ).only('occurred_at', 'resolved_at')
            )
            level_avg = 0
            if level_timed:
                level_avg = int(
                    sum(
                        max(0, (a.resolved_at - a.occurred_at).total_seconds())
                        for a in level_timed
                        if a.resolved_at and a.occurred_at
                    )
                    / len(level_timed)
                )
            by_level.append({
                'level': level,
                'label': label,
                'total': level_total,
                'resolved': level_resolved,
                'open': qs.filter(status__in=open_statuses).count(),
                'false_alarm': qs.filter(status='false_alarm').count(),
                'resolution_rate': round(level_resolved / level_total * 100, 1) if level_total else 0,
                'avg_response_seconds': level_avg,
            })

        type_rows = (
            alerts.values('alert_type')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        type_total = sum(r['count'] for r in type_rows) or 1
        type_labels = dict(Alert._meta.get_field('alert_type').choices)
        by_type = [
            {
                'alert_type': r['alert_type'],
                'label': type_labels.get(r['alert_type'], r['alert_type']),
                'count': r['count'],
                'pct': round(r['count'] / type_total * 100, 1),
            }
            for r in type_rows
        ]

        status_labels = dict(Alert._meta.get_field('status').choices)
        status_rows = (
            alerts.values('status')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        by_status = [
            {
                'status': r['status'],
                'label': status_labels.get(r['status'], r['status']),
                'count': r['count'],
                'pct': round(r['count'] / total * 100, 1) if total else 0,
            }
            for r in status_rows
        ]

        zone_rows = (
            alerts.exclude(forest_zone='')
            .values('forest_zone')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )
        by_zone = [
            {
                'forest_zone': r['forest_zone'],
                'count': r['count'],
                'level': (
                    'high' if r['count'] >= 8 else 'medium' if r['count'] >= 4 else 'low'
                ),
            }
            for r in zone_rows
        ]

        region_rows = (
            alerts.exclude(region='')
            .values('region')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )
        by_region = [
            {
                'region': r['region'],
                'count': r['count'],
                'level': (
                    'high' if r['count'] >= 8 else 'medium' if r['count'] >= 4 else 'low'
                ),
            }
            for r in region_rows
        ]

        device_rows = (
            alerts.filter(device__isnull=False)
            .values('device__device_id', 'device__device_name')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )
        top_devices = [
            {
                'device_id': r['device__device_id'] or '-',
                'device_name': r['device__device_name'] or '-',
                'count': r['count'],
            }
            for r in device_rows
        ]

        # 单日按本地小时趋势；多日则按天
        hourly = [0] * 24
        daily_trend: list[dict] = []
        if report_date:
            for a in alerts.only('occurred_at'):
                if a.occurred_at:
                    local = timezone.localtime(a.occurred_at)
                    hourly[local.hour] += 1
        else:
            from django.db.models.functions import TruncDate

            daily_rows = (
                alerts.annotate(d=TruncDate('occurred_at', tzinfo=timezone.get_current_timezone()))
                .values('d')
                .annotate(count=Count('id'))
                .order_by('d')
            )
            daily_trend = [
                {'date': str(r['d']), 'count': r['count']}
                for r in daily_rows
                if r['d']
            ]

        return Response({
            'period': period,
            'report_date': str(report_date) if report_date else None,
            'source': 'alerts',
            'total': total,
            'open_count': open_count,
            'resolved_count': resolved_count,
            'false_alarm_count': false_alarm_count,
            'closed_count': closed_count,
            'resolution_rate': round(closed_count / total * 100, 1) if total else 0,
            'false_alarm_rate': round(false_alarm_count / total * 100, 1) if total else 0,
            'avg_response_seconds': avg_response_seconds,
            'by_level': by_level,
            'by_type': by_type,
            'by_status': by_status,
            'by_zone': by_zone,
            'by_region': by_region,
            'top_devices': top_devices,
            'hourly': hourly,
            'daily_trend': daily_trend,
        })

    @action(detail=True, methods=['get'])
    def export(self, request, pk=None):
        """导出单日日报 CSV"""
        report = self.get_object()
        export_format = request.query_params.get('export_format', 'csv')
        if export_format != 'csv':
            return Response(
                {'error': '当前仅支持 export_format=csv'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return daily_report_to_csv_response(report)

    @action(detail=False, methods=['get'])
    def export_by_date(self, request):
        """按日期导出日报 CSV"""
        report_date = _parse_date_param(request.query_params.get('report_date'))
        if not report_date:
            return Response(
                {'error': '请提供 report_date'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        report = self.get_queryset().filter(report_date=report_date).first()
        if not report:
            return Response({'error': '日报不存在'}, status=status.HTTP_404_NOT_FOUND)
        return daily_report_to_csv_response(report)

    @action(detail=False, methods=['post'])
    def period_report(self, request):
        """生成周报/月报摘要"""
        report_type = request.data.get('report_type', 'weekly')
        start = _parse_date_param(request.data.get('start_date'))
        end = _parse_date_param(request.data.get('end_date'))
        if not start or not end:
            return Response(
                {'error': '请提供 start_date / end_date'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sync = bool(request.data.get('sync', True))
        task = generate_weekly_report if report_type == 'weekly' else generate_monthly_report
        dispatched = _dispatch_task(task, str(start), str(end), sync=sync)
        return Response({
            'status': 'success' if dispatched['mode'] != 'async' else 'processing',
            'report_type': report_type,
            'mode': dispatched['mode'],
            'task_id': dispatched['task_id'],
            'result': dispatched['result'],
        })


class DeviceStatisticsViewSet(OrgScopedQuerysetMixin, viewsets.ModelViewSet):
    """设备统计视图集"""
    queryset = DeviceStatistics.objects.select_related('device', 'device__organization').all()
    permission_classes = [IsAuthenticated]
    filterset_class = DeviceStatisticsFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['device__device_id', 'device__device_name']
    ordering_fields = ['stat_date', 'availability_rate', 'alert_count', 'uptime_hours']
    ordering = ['-stat_date']
    lookup_field = 'pk'
    org_scope_field = 'device__organization_id'
    org_assign_on_create = False

    def get_serializer_class(self):
        if self.action == 'list':
            return DeviceStatisticsListSerializer
        if self.action == 'create':
            return DeviceStatisticsCreateSerializer
        if self.action in ['update', 'partial_update']:
            return DeviceStatisticsUpdateSerializer
        return DeviceStatisticsDetailSerializer

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """生成指定日期的设备统计"""
        stat_date = _parse_date_param(request.data.get('stat_date')) or timezone.localdate()
        sync = bool(request.data.get('sync', True))
        try:
            org_id = resolve_create_organization_id(
                request.user,
                int(request.data['organization_id'])
                if request.data.get('organization_id') not in (None, '')
                else None,
            )
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        dispatched = _dispatch_task(
            generate_device_statistics, str(stat_date), org_id, sync=sync
        )
        return Response({
            'status': 'success' if dispatched['mode'] != 'async' else 'processing',
            'stat_date': str(stat_date),
            'organization_id': org_id,
            'mode': dispatched['mode'],
            'task_id': dispatched['task_id'],
            'result': dispatched['result'],
            'message': f'设备统计生成: {stat_date}',
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """获取设备统计汇总"""
        device_id = request.GET.get('device_id')
        days = int(request.GET.get('days', 30))
        stat_date = _parse_date_param(request.GET.get('stat_date'))

        if stat_date:
            queryset = self.get_queryset().filter(stat_date=stat_date)
            period = str(stat_date)
        else:
            start_date = timezone.localdate() - timedelta(days=days)
            queryset = self.get_queryset().filter(stat_date__gte=start_date)
            period = f'{days}天'

        if device_id:
            queryset = queryset.filter(device__device_id=device_id)

        # 实时设备类型分布（闭环设备页）— 仅本组织视野
        type_dist = []
        type_labels = dict(Device._meta.get_field('device_type').choices)
        for row in (
            _scoped_devices(request.user)
            .values('device_type')
            .annotate(
                count=Count('id'),
                online=Count('id', filter=Q(status='online')),
            )
            .order_by('-count')
        ):
            type_dist.append({
                'device_type': row['device_type'],
                'label': type_labels.get(row['device_type'], row['device_type']),
                'count': row['count'],
                'online': row['online'],
            })

        fault_devices = (
            queryset.filter(fault_count__gt=0)
            .values('device__device_id', 'device__device_name')
            .annotate(faults=Sum('fault_count'))
            .order_by('-faults')[:10]
        )

        return Response({
            'period': period,
            'total_records': queryset.count(),
            'avg_availability': queryset.aggregate(avg=Avg('availability_rate'))['avg'] or 0,
            'avg_uptime_hours': queryset.aggregate(avg=Avg('uptime_hours'))['avg'] or 0,
            'avg_data_completeness': queryset.aggregate(avg=Avg('data_completeness'))['avg'] or 0,
            'total_alerts': queryset.aggregate(total=Sum('alert_count'))['total'] or 0,
            'total_faults': queryset.aggregate(total=Sum('fault_count'))['total'] or 0,
            'fault_device_count': queryset.filter(fault_count__gt=0).values('device').distinct().count(),
            'type_distribution': type_dist,
            'fault_devices': list(fault_devices),
            'top_devices': list(
                queryset.values(
                    'device__device_id', 'device__device_name', 'device__device_type'
                )
                .annotate(
                    total_alerts=Sum('alert_count'),
                    avg_availability=Avg('availability_rate'),
                )
                .order_by('-total_alerts')[:10]
            ),
        })

    @action(detail=False, methods=['post'])
    def batch_create(self, request):
        """批量创建设备统计"""
        data = request.data
        if not isinstance(data, list):
            return Response({'error': '请提供设备统计列表'}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        errors = []
        for item in data:
            try:
                serializer = DeviceStatisticsCreateSerializer(data=item)
                if serializer.is_valid():
                    serializer.save()
                    created_count += 1
                else:
                    errors.append({'data': item, 'errors': serializer.errors})
            except Exception as exc:
                errors.append({'data': item, 'error': str(exc)})

        return Response({
            'created_count': created_count,
            'total': len(data),
            'errors': errors,
        })


class EnvironmentalDataViewSet(viewsets.ModelViewSet):
    """环境数据视图集"""
    queryset = EnvironmentalData.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_class = EnvironmentalDataFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['region']
    ordering_fields = ['stat_date', 'stat_hour', 'avg_temperature']
    ordering = ['-stat_date', '-stat_hour']
    lookup_field = 'pk'

    def get_queryset(self):
        return _scoped_environmental(self.request.user, super().get_queryset())

    def get_serializer_class(self):
        if self.action == 'list':
            return EnvironmentalDataListSerializer
        if self.action == 'create':
            return EnvironmentalDataCreateSerializer
        return EnvironmentalDataDetailSerializer

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """从遥测生成环境汇总"""
        stat_date = _parse_date_param(request.data.get('stat_date')) or timezone.localdate()
        sync = bool(request.data.get('sync', True))
        dispatched = _dispatch_task(generate_environmental_data, str(stat_date), sync=sync)
        return Response({
            'status': 'success' if dispatched['mode'] != 'async' else 'processing',
            'stat_date': str(stat_date),
            'mode': dispatched['mode'],
            'task_id': dispatched['task_id'],
            'result': dispatched['result'],
            'message': f'环境数据生成: {stat_date}',
        })

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """获取最新的环境数据"""
        region = request.GET.get('region')
        hours = int(request.GET.get('hours', 24))
        start_time = timezone.now() - timedelta(hours=hours)
        queryset = _scoped_environmental(
            request.user,
            EnvironmentalData.objects.filter(stat_date__gte=start_time.date()),
        )
        if region:
            queryset = queryset.filter(region=region)

        latest_per_region = queryset.values('region').annotate(
            max_date=Max('stat_date'),
            max_hour=Max('stat_hour'),
        )

        result = []
        for item in latest_per_region:
            data = queryset.filter(
                region=item['region'],
                stat_date=item['max_date'],
                stat_hour=item['max_hour'],
            ).first()
            if data:
                result.append(data)

        serializer = EnvironmentalDataListSerializer(result, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def daily_summary(self, request):
        """指定日期环境日汇总（跨区域）。无数据时自动从遥测生成。"""
        stat_date = _parse_date_param(request.query_params.get('stat_date')) or timezone.localdate()
        region = request.query_params.get('region')
        auto = request.query_params.get('auto', '1') not in ('0', 'false', 'False')

        qs = _scoped_environmental(
            request.user,
            EnvironmentalData.objects.filter(stat_date=stat_date),
        )
        if region:
            qs = qs.filter(region=region)

        # 无基础指标，或风速/土壤/可燃物/光照仍空但遥测已有值时，自动从遥测重算
        from datetime import time as dt_time

        from apps.devices.models import DeviceTelemetry

        start = timezone.make_aware(datetime.combine(stat_date, dt_time.min))
        end = start + timedelta(days=1)
        telem_day = filter_by_org_scope(
            DeviceTelemetry.objects.filter(timestamp__gte=start, timestamp__lt=end),
            request.user,
            field='device__organization_id',
        )

        has_basic = qs.filter(
            Q(avg_temperature__isnull=False) | Q(avg_humidity__isnull=False)
        ).exists()
        has_extended = qs.filter(
            Q(avg_wind_speed__isnull=False)
            | Q(avg_soil_moisture__isnull=False)
            | Q(avg_fuel_moisture__isnull=False)
            | Q(avg_light_intensity__isnull=False)
        ).exists()
        telem_has_extended = telem_day.filter(
            Q(wind_speed__isnull=False)
            | Q(soil_moisture_10cm__isnull=False)
            | Q(fuel_moisture__isnull=False)
            | Q(light_intensity__isnull=False)
        ).exists()

        need_rebuild = (not has_basic and telem_day.exists()) or (
            has_basic and not has_extended and telem_has_extended
        )
        if auto and need_rebuild:
            scope = get_user_org_scope_ids(request.user)
            can_autobuild = scope is None or telem_day.exists()
            if can_autobuild:
                # 下属单位只重算本组织，避免改写其它局环境行
                rebuild_org = None
                if scope is not None and len(scope) == 1:
                    rebuild_org = next(iter(scope))
                elif scope is not None and getattr(request.user, 'organization_id', None):
                    rebuild_org = request.user.organization_id
                generate_environmental_data.apply(args=[str(stat_date), rebuild_org]).get()
                qs = _scoped_environmental(
                    request.user,
                    EnvironmentalData.objects.filter(stat_date=stat_date),
                )
                if region:
                    qs = qs.filter(region=region)

        # 优先用日汇总行，避免与小时行重复加权
        day_qs = qs.filter(stat_hour__isnull=True)
        agg_source = day_qs if day_qs.exists() else qs
        agg = agg_source.aggregate(
            avg_temperature=Avg('avg_temperature'),
            max_temperature=Max('max_temperature'),
            min_temperature=Min('min_temperature'),
            avg_humidity=Avg('avg_humidity'),
            max_humidity=Max('max_humidity'),
            min_humidity=Min('min_humidity'),
            avg_wind_speed=Avg('avg_wind_speed'),
            max_wind_speed=Max('max_wind_speed'),
            avg_light_intensity=Avg('avg_light_intensity'),
            avg_soil_moisture=Avg('avg_soil_moisture'),
            avg_fuel_moisture=Avg('avg_fuel_moisture'),
        )

        hourly = (
            qs.exclude(stat_hour__isnull=True)
            .values('stat_hour')
            .annotate(
                avg_temperature=Avg('avg_temperature'),
                avg_humidity=Avg('avg_humidity'),
                avg_wind_speed=Avg('avg_wind_speed'),
                avg_soil_moisture=Avg('avg_soil_moisture'),
                avg_light_intensity=Avg('avg_light_intensity'),
            )
            .order_by('stat_hour')
        )

        by_region = (
            qs.filter(stat_hour__isnull=True)
            .values(
                'region',
                'avg_temperature',
                'max_temperature',
                'min_temperature',
                'avg_humidity',
                'avg_wind_speed',
                'avg_soil_moisture',
                'avg_fuel_moisture',
                'avg_light_intensity',
            )
            .order_by('region')
        )
        # 若没有日汇总行，用小时行按区再聚一次
        if not by_region:
            by_region = (
                qs.exclude(stat_hour__isnull=True)
                .values('region')
                .annotate(
                    avg_temperature=Avg('avg_temperature'),
                    max_temperature=Max('max_temperature'),
                    min_temperature=Min('min_temperature'),
                    avg_humidity=Avg('avg_humidity'),
                    avg_wind_speed=Avg('avg_wind_speed'),
                    avg_soil_moisture=Avg('avg_soil_moisture'),
                    avg_fuel_moisture=Avg('avg_fuel_moisture'),
                    avg_light_intensity=Avg('avg_light_intensity'),
                )
                .order_by('region')
            )

        return Response({
            'stat_date': str(stat_date),
            'region': region or 'all',
            'summary': agg,
            'hourly': list(hourly),
            'by_region': list(by_region),
            'record_count': qs.count(),
            'source': 'device_telemetry → environmental_data',
        })

    @action(detail=False, methods=['get'])
    def trend(self, request):
        """获取环境数据趋势"""
        region = request.GET.get('region')
        days = int(request.GET.get('days', 7))
        field = request.GET.get('field', 'avg_temperature')
        allowed = {
            'avg_temperature', 'max_temperature', 'min_temperature',
            'avg_humidity', 'max_humidity', 'min_humidity',
            'avg_wind_speed', 'max_wind_speed',
            'avg_light_intensity', 'avg_soil_moisture', 'avg_fuel_moisture',
        }
        if field not in allowed:
            return Response({'error': f'不支持的字段: {field}'}, status=status.HTTP_400_BAD_REQUEST)

        queryset = _scoped_environmental(request.user)
        if region:
            queryset = queryset.filter(region=region)

        start_date = timezone.localdate() - timedelta(days=days)
        queryset = queryset.filter(stat_date__gte=start_date)

        trend_data = queryset.values('stat_date').annotate(
            avg_value=Avg(field),
            max_value=Max(field),
            min_value=Min(field),
        ).order_by('stat_date')

        return Response({
            'field': field,
            'region': region or 'all',
            'period': f'{days}天',
            'data': list(trend_data),
        })

    @action(detail=False, methods=['post'])
    def batch_create(self, request):
        """批量创建环境数据"""
        data = request.data
        if not isinstance(data, list):
            return Response({'error': '请提供环境数据列表'}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        errors = []
        for item in data:
            try:
                serializer = EnvironmentalDataCreateSerializer(data=item)
                if serializer.is_valid():
                    serializer.save()
                    created_count += 1
                else:
                    errors.append({'data': item, 'errors': serializer.errors})
            except Exception as exc:
                errors.append({'data': item, 'error': str(exc)})

        return Response({
            'created_count': created_count,
            'total': len(data),
            'errors': errors,
        })
