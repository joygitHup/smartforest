"""
Report views for API.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Avg, Max, Min, Sum, Count
from django.utils import timezone
from datetime import timedelta

from .models import DailyReport, DeviceStatistics, EnvironmentalData
from .serializers import (
    DailyReportSerializer, DeviceStatisticsSerializer,
    EnvironmentalDataSerializer, ReportOverviewSerializer
)
from devices.models import Device, DeviceTelemetry
from alerts.models import Alert


class DailyReportViewSet(viewsets.ReadOnlyModelViewSet):
    """日报视图集"""
    queryset = DailyReport.objects.all()
    serializer_class = DailyReportSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['report_date']
    
    @action(detail=False, methods=['get'])
    def latest(self, request):
        """获取最新日报"""
        report = DailyReport.objects.first()
        if report:
            serializer = self.get_serializer(report)
            return Response(serializer.data)
        return Response({'message': '暂无日报数据'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['get'])
    def overview(self, request):
        """获取报表概览"""
        days = int(request.query_params.get('days', 7))
        start_date = timezone.now().date() - timedelta(days=days)
        
        reports = DailyReport.objects.filter(report_date__gte=start_date)
        
        overview = {
            'period': f'{start_date} ~ {timezone.now().date()}',
            'total_days': reports.count(),
            'avg_online_rate': reports.aggregate(avg=Avg('online_rate'))['avg'] or 0,
            'total_alerts': reports.aggregate(total=Sum('total_alerts'))['total'] or 0,
            'avg_resolution_rate': reports.aggregate(avg=Avg('resolution_rate'))['avg'] or 0,
            'total_carbon': reports.aggregate(total=Sum('carbon_sequestration'))['total'] or 0,
        }
        
        return Response(overview)


class DeviceStatisticsViewSet(viewsets.ReadOnlyModelViewSet):
    """设备统计视图集"""
    queryset = DeviceStatistics.objects.all()
    serializer_class = DeviceStatisticsSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['device', 'stat_date']
    
    @action(detail=False, methods=['get'])
    def top_fault_devices(self, request):
        """获取故障最多的设备"""
        days = int(request.query_params.get('days', 7))
        start_date = timezone.now().date() - timedelta(days=days)
        
        stats = DeviceStatistics.objects.filter(
            stat_date__gte=start_date
        ).values(
            'device__device_id', 'device__device_name'
        ).annotate(
            total_faults=Sum('fault_count'),
            total_alerts=Sum('alert_count')
        ).order_by('-total_faults')[:10]
        
        return Response(list(stats))


class EnvironmentalDataViewSet(viewsets.ReadOnlyModelViewSet):
    """环境数据视图集"""
    queryset = EnvironmentalData.objects.all()
    serializer_class = EnvironmentalDataSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['region', 'stat_date', 'stat_hour']
    
    @action(detail=False, methods=['get'])
    def trend(self, request):
        """获取环境数据趋势"""
        region = request.query_params.get('region')
        hours = int(request.query_params.get('hours', 24))
        start_time = timezone.now() - timedelta(hours=hours)
        
        queryset = EnvironmentalData.objects.filter(
            stat_date__gte=start_time.date()
        )
        
        if region:
            queryset = queryset.filter(region=region)
        
        data = queryset.values(
            'stat_date', 'stat_hour', 'region'
        ).annotate(
            avg_temp=Avg('avg_temperature'),
            avg_humidity=Avg('avg_humidity'),
            avg_wind=Avg('avg_wind_speed')
        ).order_by('stat_date', 'stat_hour')
        
        return Response(list(data))
    
    @action(detail=False, methods=['get'])
    def by_region(self, request):
        """按区域统计环境数据"""
        date = request.query_params.get('date', timezone.now().date())
        
        data = EnvironmentalData.objects.filter(
            stat_date=date
        ).values('region').annotate(
            avg_temp=Avg('avg_temperature'),
            max_temp=Max('max_temperature'),
            avg_humidity=Avg('avg_humidity'),
            avg_wind=Avg('avg_wind_speed'),
            avg_soil_moisture=Avg('avg_soil_moisture'),
            avg_fuel_moisture=Avg('avg_fuel_moisture')
        )
        
        return Response(list(data))
