# apps/reports/views.py
"""
Report views for API.
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db.models import Count, Avg, Sum, Q, Max, Min
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from datetime import timedelta, datetime

from .models import DailyReport, DeviceStatistics, EnvironmentalData
from .serializers import (
    DailyReportListSerializer, DailyReportDetailSerializer,
    DailyReportCreateSerializer, DailyReportUpdateSerializer,
    DeviceStatisticsListSerializer, DeviceStatisticsDetailSerializer,
    DeviceStatisticsCreateSerializer, DeviceStatisticsUpdateSerializer,
    EnvironmentalDataListSerializer, EnvironmentalDataDetailSerializer,
    EnvironmentalDataCreateSerializer,
    ReportSummarySerializer, ReportGenerateSerializer
)
from .filters import DailyReportFilter, DeviceStatisticsFilter, EnvironmentalDataFilter
from .tasks import generate_daily_report, generate_weekly_report, generate_monthly_report

# ✅ 导入 ASGI 兼容的过滤器
from apps.core.filters import (
    ASGICompatibleDjangoFilterBackend,
    ASGICompatibleSearchFilter,
    ASGICompatibleOrderingFilter,
)


class DailyReportViewSet(viewsets.ModelViewSet):
    """日报视图集"""
    queryset = DailyReport.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_class = DailyReportFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['report_date']
    ordering_fields = ['report_date', 'online_rate', 'resolution_rate', 'total_alerts']
    ordering = ['-report_date']
    lookup_field = 'pk'

    def get_serializer_class(self):
        if self.action == 'list':
            return DailyReportListSerializer
        elif self.action == 'create':
            return DailyReportCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return DailyReportUpdateSerializer
        return DailyReportDetailSerializer

    @action(detail=False, methods=['post'])
    def generate(self, request):
        """生成日报"""
        report_date = request.data.get('report_date')
        if report_date:
            try:
                report_date = datetime.strptime(report_date, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': '日期格式错误，请使用 YYYY-MM-DD 格式'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            report_date = timezone.now().date() - timedelta(days=1)

        # 检查日报是否已存在
        if DailyReport.objects.filter(report_date=report_date).exists():
            return Response(
                {'error': f'{report_date} 的日报已存在'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 异步生成日报
        task = generate_daily_report.delay(str(report_date))

        return Response({
            'status': 'processing',
            'task_id': task.id,
            'message': f'日报生成任务已提交: {report_date}'
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'])
    def regenerate(self, request, pk=None):
        """重新生成日报"""
        report = self.get_object()
        task = generate_daily_report.delay(str(report.report_date))

        return Response({
            'status': 'processing',
            'task_id': task.id,
            'message': f'日报重新生成任务已提交: {report.report_date}'
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """获取日报汇总"""
        days = int(request.GET.get('days', 30))
        start_date = timezone.now().date() - timedelta(days=days)

        reports = DailyReport.objects.filter(report_date__gte=start_date)

        summary = {
            'date_range': {
                'start': start_date,
                'end': timezone.now().date()
            },
            'total_days': reports.count(),
            'avg_online_rate': reports.aggregate(avg=Avg('online_rate'))['avg'] or 0,
            'avg_resolution_rate': reports.aggregate(avg=Avg('resolution_rate'))['avg'] or 0,
            'total_alerts': reports.aggregate(total=Sum('total_alerts'))['total'] or 0,
            'total_false_alarms': reports.aggregate(total=Sum('false_alarm_count'))['total'] or 0,
            'avg_response_time': reports.aggregate(avg=Avg('avg_response_time'))['avg'] or 0,
            'total_carbon': reports.aggregate(total=Sum('carbon_sequestration'))['total'] or 0,
            'trend': {
                'online_rate': list(reports.values_list('online_rate', flat=True)),
                'resolution_rate': list(reports.values_list('resolution_rate', flat=True)),
                'total_alerts': list(reports.values_list('total_alerts', flat=True)),
                'dates': list(reports.values_list('report_date', flat=True))
            }
        }

        return Response(summary)


class DeviceStatisticsViewSet(viewsets.ModelViewSet):
    """设备统计视图集"""
    queryset = DeviceStatistics.objects.select_related('device').all()
    permission_classes = [IsAuthenticated]
    filterset_class = DeviceStatisticsFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['device__device_id', 'device__device_name']
    ordering_fields = ['stat_date', 'availability_rate', 'alert_count']
    ordering = ['-stat_date']
    lookup_field = 'pk'

    def get_serializer_class(self):
        if self.action == 'list':
            return DeviceStatisticsListSerializer
        elif self.action == 'create':
            return DeviceStatisticsCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return DeviceStatisticsUpdateSerializer
        return DeviceStatisticsDetailSerializer

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """获取设备统计汇总"""
        device_id = request.GET.get('device_id')
        days = int(request.GET.get('days', 30))

        start_date = timezone.now().date() - timedelta(days=days)

        queryset = DeviceStatistics.objects.filter(stat_date__gte=start_date)
        if device_id:
            queryset = queryset.filter(device__device_id=device_id)

        summary = {
            'period': f'{days}天',
            'total_records': queryset.count(),
            'avg_availability': queryset.aggregate(avg=Avg('availability_rate'))['avg'] or 0,
            'avg_data_completeness': queryset.aggregate(avg=Avg('data_completeness'))['avg'] or 0,
            'total_alerts': queryset.aggregate(total=Sum('alert_count'))['total'] or 0,
            'total_faults': queryset.aggregate(total=Sum('fault_count'))['total'] or 0,
            'top_devices': queryset.values(
                'device__device_id', 'device__device_name', 'device__device_type'
            ).annotate(
                total_alerts=Sum('alert_count'),
                avg_availability=Avg('availability_rate')
            ).order_by('-total_alerts')[:10]
        }

        return Response(summary)

    @action(detail=False, methods=['post'])
    def batch_create(self, request):
        """批量创建设备统计"""
        data = request.data
        if not isinstance(data, list):
            return Response(
                {'error': '请提供设备统计列表'},
                status=status.HTTP_400_BAD_REQUEST
            )

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
            except Exception as e:
                errors.append({'data': item, 'error': str(e)})

        return Response({
            'created_count': created_count,
            'total': len(data),
            'errors': errors
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

    def get_serializer_class(self):
        if self.action == 'list':
            return EnvironmentalDataListSerializer
        elif self.action == 'create':
            return EnvironmentalDataCreateSerializer
        return EnvironmentalDataDetailSerializer

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """获取最新的环境数据"""
        region = request.GET.get('region')
        hours = int(request.GET.get('hours', 24))

        start_time = timezone.now() - timedelta(hours=hours)
        queryset = EnvironmentalData.objects.filter(
            stat_date__gte=start_time.date()
        )

        if region:
            queryset = queryset.filter(region=region)

        # 按区域分组获取最新数据
        from django.db.models import Max
        latest_per_region = queryset.values('region').annotate(
            max_date=Max('stat_date'),
            max_hour=Max('stat_hour')
        )

        result = []
        for item in latest_per_region:
            data = queryset.filter(
                region=item['region'],
                stat_date=item['max_date'],
                stat_hour=item['max_hour']
            ).first()
            if data:
                result.append(data)

        serializer = EnvironmentalDataListSerializer(result, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def trend(self, request):
        """获取环境数据趋势"""
        region = request.GET.get('region')
        days = int(request.GET.get('days', 7))
        field = request.GET.get('field', 'avg_temperature')

        if region:
            queryset = EnvironmentalData.objects.filter(region=region)
        else:
            queryset = EnvironmentalData.objects.all()

        start_date = timezone.now().date() - timedelta(days=days)
        queryset = queryset.filter(stat_date__gte=start_date)

        # 按日期聚合
        trend_data = queryset.values('stat_date').annotate(
            avg_value=Avg(field),
            max_value=Max(field),
            min_value=Min(field)
        ).order_by('stat_date')

        return Response({
            'field': field,
            'region': region or 'all',
            'period': f'{days}天',
            'data': trend_data
        })

    @action(detail=False, methods=['post'])
    def batch_create(self, request):
        """批量创建环境数据"""
        data = request.data
        if not isinstance(data, list):
            return Response(
                {'error': '请提供环境数据列表'},
                status=status.HTTP_400_BAD_REQUEST
            )

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
            except Exception as e:
                errors.append({'data': item, 'error': str(e)})

        return Response({
            'created_count': created_count,
            'total': len(data),
            'errors': errors
        })