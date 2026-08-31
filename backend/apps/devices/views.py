# apps/devices/views.py
"""
Device views for API.
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db.models import Count, Q, Avg, Sum
from django.shortcuts import get_object_or_404
from rest_framework.authentication import SessionAuthentication, BasicAuthentication

from .models import Device, DeviceTelemetry, DeviceCommand, DeviceStatus
from .serializers import (
    DeviceListSerializer, DeviceDetailSerializer,
    DeviceCreateSerializer, DeviceUpdateSerializer,
    DeviceTelemetrySerializer, DeviceTelemetryCreateSerializer,
    DeviceCommandSerializer, DeviceCommandCreateSerializer,
    PTZControlSerializer, DeviceBatchDeleteSerializer,
    DeviceStatisticsSerializer
)
from .filters import DeviceFilter, DeviceTelemetryFilter, DeviceCommandFilter
from .tasks import send_ptz_command, send_device_command, update_device_status


class DeviceViewSet(viewsets.ModelViewSet):
    """设备管理视图集 - 支持完整的增删改查"""
    queryset = Device.objects.all()
    authentication_classes = [SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]
    filterset_class = DeviceFilter
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['device_id', 'device_name', 'region', 'forest_zone', 'manufacturer']
    ordering_fields = ['created_at', 'last_online_time', 'device_name', 'battery_level', 'signal_strength']
    ordering = ['-created_at']

    def get_serializer_class(self):
        """根据操作返回不同的序列化器"""
        if self.action == 'list':
            return DeviceListSerializer
        elif self.action == 'create':
            return DeviceCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return DeviceUpdateSerializer
        return DeviceDetailSerializer

    def create(self, request, *args, **kwargs):
        """
        创建设备
        校验 device_id 唯一性
        """
        device_id = request.data.get('device_id')
        if device_id and Device.objects.filter(device_id=device_id).exists():
            return Response(
                {'error': f'设备ID "{device_id}" 已存在，请使用不同的设备ID'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        detail_serializer = DeviceDetailSerializer(serializer.instance)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """
        全量更新设备
        禁止修改 device_id
        """
        partial = kwargs.pop('partial', False)
        instance = self.get_object()

        if 'device_id' in request.data and request.data['device_id'] != instance.device_id:
            return Response(
                {'error': 'device_id 不可修改，请使用其他字段进行更新'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        detail_serializer = DeviceDetailSerializer(instance)
        return Response(detail_serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """部分更新设备"""
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """
        删除设备
        检查是否有关联的遥测数据或指令
        """
        instance = self.get_object()
        telemetry_count = instance.telemetry.count()
        command_count = instance.commands.count()

        if telemetry_count > 0 or command_count > 0:
            force = request.query_params.get('force', 'false').lower() == 'true'
            if not force:
                return Response(
                    {
                        'warning': f'设备有关联数据：遥测 {telemetry_count} 条，指令 {command_count} 条',
                        'suggestion': '如需强制删除，请添加参数 ?force=true',
                        'telemetry_count': telemetry_count,
                        'command_count': command_count
                    },
                    status=status.HTTP_409_CONFLICT
                )

        self.perform_destroy(instance)
        return Response(
            {'message': f'设备 "{instance.device_name}" 已成功删除'},
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['post'])
    def batch_delete(self, request):
        """批量删除设备"""
        serializer = DeviceBatchDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        device_ids = serializer.validated_data['device_ids']
        force = serializer.validated_data['force']

        devices = Device.objects.filter(id__in=device_ids)
        deleted_count = 0
        errors = []

        for device in devices:
            try:
                if not force and (device.telemetry.exists() or device.commands.exists()):
                    errors.append(f'设备 {device.device_id} 有关联数据')
                    continue
                device.delete()
                deleted_count += 1
            except Exception as e:
                errors.append(f'删除 {device.device_id} 失败: {str(e)}')

        return Response({
            'deleted_count': deleted_count,
            'total': len(device_ids),
            'errors': errors
        })

    @action(detail=True, methods=['post'])
    def ptz_control(self, request, pk=None):
        """云台控制"""
        device = self.get_object()
        serializer = PTZControlSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

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

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """手动更新设备状态"""
        device = self.get_object()
        status_value = request.data.get('status')

        if not status_value:
            return Response(
                {'error': '请提供 status 字段'},
                status=status.HTTP_400_BAD_REQUEST
            )

        valid_statuses = [choice[0] for choice in DeviceStatus.choices]
        if status_value not in valid_statuses:
            return Response(
                {'error': f'无效的状态值，可选: {valid_statuses}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        device.status = status_value
        if status_value == 'online':
            device.last_online_time = timezone.now()
        device.last_heartbeat = timezone.now()
        device.save()

        return Response({
            'message': f'设备状态已更新为: {device.get_status_display()}',
            'status': device.status
        })

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """设备统计"""
        queryset = self.get_queryset()

        stats = {
            'total': queryset.count(),
            'online': queryset.filter(status='online').count(),
            'offline': queryset.filter(status='offline').count(),
            'alarm': queryset.filter(status='alarm').count(),
            'maintenance': queryset.filter(status='maintenance').count(),
            'by_type': dict(
                queryset.values_list('device_type').annotate(
                    count=Count('id')
                ).values_list('device_type', 'count')
            ),
            'by_region': dict(
                queryset.values_list('region').annotate(
                    count=Count('id')
                ).values_list('region', 'count')
            ),
            'by_status': dict(
                queryset.values_list('status').annotate(
                    count=Count('id')
                ).values_list('status', 'count')
            ),
            'avg_battery': queryset.aggregate(avg=Avg('battery_level'))['avg'] or 0,
            'avg_signal': queryset.aggregate(avg=Avg('signal_strength'))['avg'] or 0,
        }

        return Response(stats)

    @action(detail=True, methods=['get'])
    def telemetry(self, request, pk=None):
        """获取设备遥测数据"""
        device = self.get_object()
        hours = int(request.query_params.get('hours', 24))
        limit = int(request.query_params.get('limit', 100))

        start_time = timezone.now() - timezone.timedelta(hours=hours)
        telemetry = device.telemetry.filter(timestamp__gte=start_time)[:limit]

        serializer = DeviceTelemetrySerializer(telemetry, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def commands(self, request, pk=None):
        """获取设备指令历史"""
        device = self.get_object()
        limit = int(request.query_params.get('limit', 50))
        status_filter = request.query_params.get('status')

        commands = device.commands.all()
        if status_filter:
            commands = commands.filter(status=status_filter)
        commands = commands[:limit]

        serializer = DeviceCommandSerializer(commands, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def online(self, request):
        """获取所有在线设备"""
        devices = Device.objects.filter(status='online')
        serializer = DeviceListSerializer(devices, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def low_battery(self, request):
        """获取低电量设备"""
        devices = Device.objects.filter(battery_level__lt=20)
        serializer = DeviceListSerializer(devices, many=True)
        return Response(serializer.data)


class DeviceTelemetryViewSet(viewsets.ModelViewSet):
    """设备遥测数据视图集"""
    queryset = DeviceTelemetry.objects.select_related('device').all()
    permission_classes = [IsAuthenticated]
    filterset_class = DeviceTelemetryFilter
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['device__device_id', 'device__device_name']
    ordering_fields = ['timestamp', 'created_at', 'temperature', 'humidity']
    ordering = ['-timestamp']

    def get_serializer_class(self):
        if self.action == 'create':
            return DeviceTelemetryCreateSerializer
        return DeviceTelemetrySerializer

    def create(self, request, *args, **kwargs):
        """创建遥测数据"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """获取所有设备的最新遥测数据"""
        from django.db.models import Max

        latest_timestamps = DeviceTelemetry.objects.values('device').annotate(
            latest=Max('timestamp')
        )

        latest_data = []
        for item in latest_timestamps:
            telemetry = DeviceTelemetry.objects.filter(
                device_id=item['device'],
                timestamp=item['latest']
            ).first()
            if telemetry:
                latest_data.append(telemetry)

        serializer = self.get_serializer(latest_data, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """获取设备遥测统计"""
        telemetry = self.get_object()
        # 计算最近24小时的统计
        start_time = timezone.now() - timezone.timedelta(hours=24)
        recent = DeviceTelemetry.objects.filter(
            device=telemetry.device,
            timestamp__gte=start_time
        )

        stats = {
            'temperature': {
                'avg': recent.aggregate(avg=Avg('temperature'))['avg'],
                'max': recent.aggregate(max=Max('temperature'))['max'],
                'min': recent.aggregate(min=Min('temperature'))['min'],
            },
            'humidity': {
                'avg': recent.aggregate(avg=Avg('humidity'))['avg'],
                'max': recent.aggregate(max=Max('humidity'))['max'],
                'min': recent.aggregate(min=Min('humidity'))['min'],
            },
            'count': recent.count()
        }
        return Response(stats)


class DeviceCommandViewSet(viewsets.ModelViewSet):
    """设备指令视图集"""
    queryset = DeviceCommand.objects.select_related('device').all()
    permission_classes = [IsAuthenticated]
    filterset_class = DeviceCommandFilter
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['device__device_id', 'device__device_name', 'command_type']
    ordering_fields = ['created_at', 'sent_at', 'executed_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return DeviceCommandCreateSerializer
        return DeviceCommandSerializer

    def create(self, request, *args, **kwargs):
        """创建指令并发送"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        device_id = serializer.validated_data['device_id']
        command_type = serializer.validated_data['command_type']
        command_params = serializer.validated_data.get('command_params', {})

        # 查找设备
        try:
            device = Device.objects.get(device_id=device_id)
        except Device.DoesNotExist:
            return Response(
                {'error': f'设备 {device_id} 不存在'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 创建指令记录
        command = DeviceCommand.objects.create(
            device=device,
            command_type=command_type,
            command_params=command_params,
            status='pending'
        )

        # 异步发送指令
        task = send_device_command.delay(
            device_id=device_id,
            command_type=command_type,
            command_params=command_params
        )

        return Response({
            'message': '指令已创建，正在发送',
            'command_id': command.id,
            'task_id': task.id
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """重试失败的指令"""
        command = self.get_object()

        if command.status not in ['failed', 'timeout']:
            return Response(
                {'error': '只有失败或超时的指令才能重试'},
                status=status.HTTP_400_BAD_REQUEST
            )

        command.status = 'pending'
        command.save()

        task = send_device_command.delay(
            device_id=command.device.device_id,
            command_type=command.command_type,
            command_params=command.command_params
        )

        return Response({
            'message': '指令正在重试',
            'command_id': command.id,
            'task_id': task.id
        })

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """取消待发送的指令"""
        command = self.get_object()

        if command.status not in ['pending', 'sent']:
            return Response(
                {'error': '只有待发送或已发送的指令才能取消'},
                status=status.HTTP_400_BAD_REQUEST
            )

        command.status = 'failed'
        command.error_message = '用户取消'
        command.save()

        return Response({
            'message': '指令已取消',
            'command_id': command.id
        })