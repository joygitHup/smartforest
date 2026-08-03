"""
Device views for API.
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db.models import Count, Q

from .models import Device, DeviceTelemetry, DeviceCommand
from .serializers import (
    DeviceListSerializer, DeviceDetailSerializer,
    DeviceTelemetrySerializer, DeviceCommandSerializer,
    PTZControlSerializer
)
from .filters import DeviceFilter
from .tasks import send_ptz_command, send_device_command


class DeviceViewSet(viewsets.ModelViewSet):
    """设备管理视图集"""
    queryset = Device.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_class = DeviceFilter
    search_fields = ['device_id', 'device_name', 'region', 'forest_zone']
    ordering_fields = ['created_at', 'last_online_time', 'device_name']
    ordering = ['-created_at']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return DeviceListSerializer
        return DeviceDetailSerializer
    
    @action(detail=True, methods=['post'])
    def ptz_control(self, request, pk=None):
        """云台控制"""
        device = self.get_object()
        serializer = PTZControlSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # 发送云台控制指令
        task = send_ptz_command.delay(
            device_id=device.device_id,
            direction=serializer.validated_data['direction'],
            speed=serializer.validated_data['speed']
        )
        
        return Response({
            'status': 'command_sent',
            'task_id': task.id,
            'message': f'云台控制指令已发送: {serializer.validated_data["direction"]}'
        })
    
    @action(detail=True, methods=['post'])
    def restart(self, request, pk=None):
        """远程重启设备"""
        device = self.get_object()
        task = send_device_command.delay(
            device_id=device.device_id,
            command_type='restart',
            command_params={}
        )
        
        return Response({
            'status': 'command_sent',
            'task_id': task.id,
            'message': '重启指令已发送'
        })
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """设备统计"""
        stats = {
            'total': Device.objects.count(),
            'online': Device.objects.filter(status='online').count(),
            'offline': Device.objects.filter(status='offline').count(),
            'alarm': Device.objects.filter(status='alarm').count(),
            'by_type': dict(
                Device.objects.values_list('device_type').annotate(
                    count=Count('id')
                ).values_list('device_type', 'count')
            ),
            'by_region': dict(
                Device.objects.values_list('region').annotate(
                    count=Count('id')
                ).values_list('region', 'count')
            )
        }
        return Response(stats)
    
    @action(detail=True, methods=['get'])
    def telemetry(self, request, pk=None):
        """获取设备遥测数据"""
        device = self.get_object()
        hours = int(request.query_params.get('hours', 24))
        
        start_time = timezone.now() - timezone.timedelta(hours=hours)
        telemetry = device.telemetry.filter(timestamp__gte=start_time)
        
        serializer = DeviceTelemetrySerializer(telemetry, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def commands(self, request, pk=None):
        """获取设备指令历史"""
        device = self.get_object()
        commands = device.commands.all()[:50]
        
        serializer = DeviceCommandSerializer(commands, many=True)
        return Response(serializer.data)


class DeviceTelemetryViewSet(viewsets.ReadOnlyModelViewSet):
    """设备遥测数据视图集"""
    queryset = DeviceTelemetry.objects.all()
    serializer_class = DeviceTelemetrySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['device', 'device__device_type', 'device__region']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']


class DeviceCommandViewSet(viewsets.ModelViewSet):
    """设备指令视图集"""
    queryset = DeviceCommand.objects.all()
    serializer_class = DeviceCommandSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['device', 'status', 'command_type']
    ordering_fields = ['created_at', 'sent_at']
    ordering = ['-created_at']
