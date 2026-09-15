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
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Device, DeviceTelemetry, DeviceCommand, DeviceStatus, DevicePreset
from .serializers import (
    DeviceListSerializer, DeviceDetailSerializer,
    DeviceCreateSerializer, DeviceUpdateSerializer,
    DeviceTelemetrySerializer, DeviceTelemetryCreateSerializer,
    DeviceCommandSerializer, DeviceCommandCreateSerializer,
    PTZControlSerializer, PTZGotoSerializer, PresetPositionSerializer,
    AimAlertSerializer, DevicePresetSerializer,
    DeviceBatchDeleteSerializer,
    DeviceBatchStatusSerializer, DeviceBatchIdsSerializer,
    DeviceStatisticsSerializer
)
from .filters import DeviceFilter, DeviceTelemetryFilter, DeviceCommandFilter
from .tasks import publish_pending_command, send_device_command, update_device_status
from .command_control import (
    acquire_ptz_lock,
    assert_device_online,
    assert_dual_camera,
    bearing_degrees,
    can_control_device,
    check_ptz_throttle,
    check_restart_cooldown,
    mark_restart_cooldown,
    new_correlation_id,
    release_ptz_lock,
)
from apps.users.mixins import OrgScopedQuerysetMixin


def _enqueue_command(device, command_type, params, operator_id, correlation_id=None):
    """同步落库并立即 MQTT 发布（不依赖 Celery 热加载，避免长期停在「待发送」）。"""
    from apps.devices.tasks import _publish_and_mark_sent, publish_pending_command

    command = DeviceCommand.objects.create(
        device=device,
        command_type=command_type,
        command_params=params or {},
        correlation_id=correlation_id or new_correlation_id(),
        operator_id=operator_id,
        status='pending',
    )
    try:
        _publish_and_mark_sent(command, device.device_id)
        command.refresh_from_db()
        task_id = f'sync-{command.id}'
    except Exception as exc:
        # 同步失败时再丢给 Celery 重试
        try:
            task = publish_pending_command.delay(command.id)
            task_id = task.id
        except Exception:
            command.status = 'failed'
            command.error_message = str(exc)
            command.save(update_fields=['status', 'error_message'])
            task_id = None

    class _TaskInfo:
        def __init__(self, tid):
            self.id = tid

    return command, _TaskInfo(task_id)




class DeviceViewSet(OrgScopedQuerysetMixin, viewsets.ModelViewSet):
    """设备管理视图集 - 支持完整的增删改查"""
    queryset = Device.objects.select_related('organization', 'forest_zone_ref').all()
    authentication_classes = [JWTAuthentication, SessionAuthentication, BasicAuthentication]
    permission_classes = [IsAuthenticated]
    filterset_class = DeviceFilter
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['device_id', 'device_name', 'region', 'forest_zone', 'manufacturer']
    ordering_fields = ['created_at', 'last_online_time', 'device_name', 'battery_level', 'signal_strength']
    ordering = ['-created_at']
    org_scope_field = 'organization_id'

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

        devices = self.get_queryset().filter(id__in=device_ids)
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

    @action(detail=False, methods=['post'])
    def batch_update_status(self, request):
        """批量更新设备状态"""
        serializer = DeviceBatchStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        device_ids = serializer.validated_data['device_ids']
        status_value = serializer.validated_data['status']
        now = timezone.now()

        qs = self.get_queryset().filter(id__in=device_ids)
        update_fields = {
            'status': status_value,
            'last_heartbeat': now,
        }
        if status_value == DeviceStatus.ONLINE:
            update_fields['last_online_time'] = now

        updated = qs.update(**update_fields)
        return Response({
            'updated_count': updated,
            'total': len(device_ids),
            'status': status_value,
            'message': f'已更新 {updated} 台设备状态',
        })

    @action(detail=False, methods=['post'])
    def batch_restart(self, request):
        """批量远程重启"""
        if not can_control_device(request.user):
            return Response({'error': '无权限控制设备'}, status=status.HTTP_403_FORBIDDEN)

        serializer = DeviceBatchIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        device_ids = serializer.validated_data['device_ids']
        devices = self.get_queryset().filter(id__in=device_ids)
        sent = 0
        errors = []

        for device in devices:
            try:
                online_err = assert_device_online(device)
                if online_err:
                    errors.append(f'{device.device_id}: {online_err}')
                    continue
                cool = check_restart_cooldown(device.device_id)
                if cool:
                    errors.append(f'{device.device_id}: {cool}')
                    continue
                _enqueue_command(device, 'restart', {}, request.user.id)
                mark_restart_cooldown(device.device_id)
                sent += 1
            except Exception as exc:
                errors.append(f'{device.device_id}: {exc}')

        return Response({
            'sent_count': sent,
            'total': len(device_ids),
            'errors': errors,
            'message': f'已向 {sent} 台设备发送重启指令',
        })

    @action(detail=True, methods=['get'])
    def effective_rules(self, request, pk=None):
        """当前设备生效的告警规则（只读）"""
        from apps.alerts.rule_engine import get_effective_rules_for_device
        from apps.alerts.serializers import AlertRuleSerializer

        device = self.get_object()
        rules = get_effective_rules_for_device(device)
        data = AlertRuleSerializer(rules, many=True).data
        return Response({
            'device_id': device.device_id,
            'device_name': device.device_name,
            'count': len(data),
            'results': data,
        })

    @action(detail=True, methods=['post'])
    def ptz_control(self, request, pk=None):
        """云台点动 / 停止"""
        if not can_control_device(request.user):
            return Response({'error': '无权限控制设备'}, status=status.HTTP_403_FORBIDDEN)

        device = self.get_object()
        err = assert_dual_camera(device) or assert_device_online(device)
        if err:
            return Response({'error': err}, status=status.HTTP_400_BAD_REQUEST)

        serializer = PTZControlSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        direction = serializer.validated_data['direction']
        speed = serializer.validated_data['speed']

        lock_err = acquire_ptz_lock(device.device_id, request.user.id)
        if lock_err:
            return Response({'error': lock_err}, status=status.HTTP_409_CONFLICT)

        if direction != 'stop':
            throttle_err = check_ptz_throttle(device.device_id, request.user.id)
            if throttle_err:
                return Response({'error': throttle_err}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        else:
            release_ptz_lock(device.device_id, request.user.id)

        corr = new_correlation_id()
        command, task = _enqueue_command(
            device,
            'ptz_control',
            {'direction': direction, 'speed': speed},
            request.user.id,
            corr,
        )

        return Response({
            'status': 'command_sent',
            'task_id': task.id,
            'command_id': command.id,
            'correlation_id': corr,
            'direction': direction,
            'message': f'云台控制指令已发送: {direction}',
        })

    @action(detail=True, methods=['post'])
    def ptz_goto(self, request, pk=None):
        """云台绝对角度 / 预置位跳转底层"""
        if not can_control_device(request.user):
            return Response({'error': '无权限控制设备'}, status=status.HTTP_403_FORBIDDEN)

        device = self.get_object()
        err = assert_dual_camera(device) or assert_device_online(device)
        if err:
            return Response({'error': err}, status=status.HTTP_400_BAD_REQUEST)

        serializer = PTZGotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        lock_err = acquire_ptz_lock(device.device_id, request.user.id)
        if lock_err:
            return Response({'error': lock_err}, status=status.HTTP_409_CONFLICT)

        corr = new_correlation_id()
        params = {
            'pan_angle': serializer.validated_data['pan_angle'],
            'tilt_angle': serializer.validated_data['tilt_angle'],
            'speed': serializer.validated_data.get('speed', 5),
        }
        command, task = _enqueue_command(device, 'ptz_goto', params, request.user.id, corr)
        return Response({
            'status': 'command_sent',
            'task_id': task.id,
            'command_id': command.id,
            'correlation_id': corr,
            'params': params,
            'message': '云台指向指令已发送',
        })

    @action(detail=True, methods=['post'])
    def restart(self, request, pk=None):
        """远程重启设备"""
        if not can_control_device(request.user):
            return Response({'error': '无权限控制设备'}, status=status.HTTP_403_FORBIDDEN)

        device = self.get_object()
        err = assert_device_online(device)
        if err:
            return Response({'error': err}, status=status.HTTP_400_BAD_REQUEST)

        cool = check_restart_cooldown(device.device_id)
        if cool:
            return Response({'error': cool}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        corr = new_correlation_id()
        command, task = _enqueue_command(device, 'restart', {}, request.user.id, corr)
        mark_restart_cooldown(device.device_id)

        return Response({
            'status': 'command_sent',
            'task_id': task.id,
            'command_id': command.id,
            'correlation_id': corr,
            'message': '重启指令已发送，设备可能短暂离线',
        })

    @action(detail=True, methods=['get', 'post', 'delete'], url_path='presets')
    def presets(self, request, pk=None):
        """预置位：GET 列表 / POST 保存 / DELETE 删除"""
        device = self.get_object()
        if request.method == 'GET':
            qs = device.presets.all()
            return Response({
                'count': qs.count(),
                'results': DevicePresetSerializer(qs, many=True).data,
            })

        if not can_control_device(request.user):
            return Response({'error': '无权限控制设备'}, status=status.HTTP_403_FORBIDDEN)
        err = assert_dual_camera(device)
        if err:
            return Response({'error': err}, status=status.HTTP_400_BAD_REQUEST)

        if request.method == 'DELETE':
            preset_id = request.data.get('preset_id') or request.query_params.get('preset_id')
            if not preset_id:
                return Response({'error': '请提供 preset_id'}, status=status.HTTP_400_BAD_REQUEST)
            deleted, _ = DevicePreset.objects.filter(device=device, preset_id=preset_id).delete()
            return Response({'deleted': deleted, 'message': '预置位已删除' if deleted else '预置位不存在'})

        serializer = PresetPositionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        pan = data.get('pan_angle')
        tilt = data.get('tilt_angle')
        if data.get('save_current'):
            if device.pan_angle is None or device.tilt_angle is None:
                return Response({'error': '当前姿态未知，无法保存'}, status=status.HTTP_400_BAD_REQUEST)
            pan = float(device.pan_angle)
            tilt = float(device.tilt_angle)
        name = data.get('name') or f'预置位{data["preset_id"]}'
        preset, _ = DevicePreset.objects.update_or_create(
            device=device,
            preset_id=data['preset_id'],
            defaults={'name': name, 'pan_angle': pan, 'tilt_angle': tilt},
        )
        return Response(DevicePresetSerializer(preset).data)

    @action(detail=True, methods=['post'], url_path='presets/(?P<preset_id>[0-9]+)/goto')
    def preset_goto(self, request, pk=None, preset_id=None):
        """跳转预置位"""
        if not can_control_device(request.user):
            return Response({'error': '无权限控制设备'}, status=status.HTTP_403_FORBIDDEN)
        device = self.get_object()
        err = assert_dual_camera(device) or assert_device_online(device)
        if err:
            return Response({'error': err}, status=status.HTTP_400_BAD_REQUEST)
        preset = device.presets.filter(preset_id=preset_id).first()
        if not preset:
            return Response({'error': '预置位不存在'}, status=status.HTTP_404_NOT_FOUND)

        lock_err = acquire_ptz_lock(device.device_id, request.user.id)
        if lock_err:
            return Response({'error': lock_err}, status=status.HTTP_409_CONFLICT)

        corr = new_correlation_id()
        params = {
            'preset_id': preset.preset_id,
            'pan_angle': float(preset.pan_angle),
            'tilt_angle': float(preset.tilt_angle),
            'speed': int(request.data.get('speed', 5)),
        }
        command, task = _enqueue_command(device, 'ptz_preset', params, request.user.id, corr)
        return Response({
            'status': 'command_sent',
            'task_id': task.id,
            'command_id': command.id,
            'correlation_id': corr,
            'preset': DevicePresetSerializer(preset).data,
            'message': f'已跳转预置位 {preset.preset_id}（{preset.name}）',
        })

    @action(detail=True, methods=['post'])
    def aim_alert(self, request, pk=None):
        """按告警坐标计算方位并指向"""
        if not can_control_device(request.user):
            return Response({'error': '无权限控制设备'}, status=status.HTTP_403_FORBIDDEN)
        device = self.get_object()
        err = assert_dual_camera(device) or assert_device_online(device)
        if err:
            return Response({'error': err}, status=status.HTTP_400_BAD_REQUEST)
        if device.latitude is None or device.longitude is None:
            return Response({'error': '设备缺少经纬度，无法计算方位'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AimAlertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from apps.alerts.models import Alert

        alert = None
        if serializer.validated_data.get('alert_pk'):
            alert = Alert.objects.filter(pk=serializer.validated_data['alert_pk']).first()
        elif serializer.validated_data.get('alert_id'):
            aid = serializer.validated_data['alert_id']
            alert = Alert.objects.filter(pk=aid).first() or Alert.objects.filter(alert_id=str(aid)).first()
        if not alert:
            return Response({'error': '告警不存在'}, status=status.HTTP_404_NOT_FOUND)
        if alert.latitude is None or alert.longitude is None:
            return Response({'error': '告警缺少坐标，无法对准'}, status=status.HTTP_400_BAD_REQUEST)

        pan = bearing_degrees(
            float(device.latitude),
            float(device.longitude),
            float(alert.latitude),
            float(alert.longitude),
        )
        tilt = serializer.validated_data.get('tilt_angle', -5)
        lock_err = acquire_ptz_lock(device.device_id, request.user.id)
        if lock_err:
            return Response({'error': lock_err}, status=status.HTTP_409_CONFLICT)

        corr = new_correlation_id()
        params = {
            'pan_angle': pan,
            'tilt_angle': tilt,
            'speed': serializer.validated_data.get('speed', 5),
            'alert_id': alert.alert_id,
            'source': 'aim_alert',
        }
        command, task = _enqueue_command(device, 'ptz_goto', params, request.user.id, corr)
        return Response({
            'status': 'command_sent',
            'task_id': task.id,
            'command_id': command.id,
            'correlation_id': corr,
            'pan_angle': pan,
            'tilt_angle': tilt,
            'alert_id': alert.alert_id,
            'message': f'已指向告警方位 {pan}°',
        })

    @action(detail=False, methods=['get'])
    def command_audit(self, request):
        """操作审计：指令统计与最近记录（本组织设备视野）"""
        if not can_control_device(request.user):
            return Response({'error': '无权限查看操作审计'}, status=status.HTTP_403_FORBIDDEN)

        from apps.users.org_scope import filter_by_org_scope

        hours = int(request.query_params.get('hours', 24))
        limit = min(int(request.query_params.get('limit', 50)), 200)
        device_id = request.query_params.get('device_id')
        since = timezone.now() - timezone.timedelta(hours=hours)

        qs = filter_by_org_scope(
            DeviceCommand.objects.select_related('device', 'operator', 'device__organization'),
            request.user,
            field='device__organization_id',
        ).filter(created_at__gte=since)
        if device_id:
            qs = qs.filter(device__device_id=device_id)

        by_type = {
            row['command_type']: row['c']
            for row in qs.values('command_type').annotate(c=Count('id'))
        }
        by_status = {
            row['status']: row['c']
            for row in qs.values('status').annotate(c=Count('id'))
        }
        recent = DeviceCommandSerializer(qs.order_by('-created_at')[:limit], many=True).data
        return Response({
            'hours': hours,
            'total': qs.count(),
            'by_type': by_type,
            'by_status': by_status,
            'recent': recent,
        })

    @action(detail=True, methods=['get'])
    def commands(self, request, pk=None):
        """获取设备指令历史"""
        device = self.get_object()
        limit = int(request.query_params.get('limit', 50))
        status_filter = request.query_params.get('status')

        commands = device.commands.select_related('operator').all()
        if status_filter:
            commands = commands.filter(status=status_filter)
        commands = commands[:limit]

        serializer = DeviceCommandSerializer(commands, many=True)
        return Response({'count': len(serializer.data), 'results': serializer.data})

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

    @action(detail=False, methods=['get'])
    def online(self, request):
        """获取所有在线设备"""
        devices = self.get_queryset().filter(status='online')
        serializer = DeviceListSerializer(devices, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def low_battery(self, request):
        """获取低电量设备"""
        devices = self.get_queryset().filter(battery_level__lt=20)
        serializer = DeviceListSerializer(devices, many=True)
        return Response(serializer.data)


class DeviceTelemetryViewSet(OrgScopedQuerysetMixin, viewsets.ModelViewSet):
    """设备遥测数据视图集"""
    queryset = DeviceTelemetry.objects.select_related('device', 'device__organization').all()
    permission_classes = [IsAuthenticated]
    filterset_class = DeviceTelemetryFilter
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['device__device_id', 'device__device_name']
    ordering_fields = ['timestamp', 'created_at', 'temperature', 'humidity']
    ordering = ['-timestamp']
    org_scope_field = 'device__organization_id'
    org_assign_on_create = False

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


class DeviceCommandViewSet(OrgScopedQuerysetMixin, viewsets.ModelViewSet):
    """设备指令视图集"""
    queryset = DeviceCommand.objects.select_related('device', 'device__organization').all()
    permission_classes = [IsAuthenticated]
    filterset_class = DeviceCommandFilter
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['device__device_id', 'device__device_name', 'command_type']
    ordering_fields = ['created_at', 'sent_at', 'executed_at']
    ordering = ['-created_at']
    org_scope_field = 'device__organization_id'
    org_assign_on_create = False

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

        # 查找设备（限制在组织视野内）
        from apps.users.org_scope import filter_by_org_scope
        try:
            device = filter_by_org_scope(
                Device.objects.all(), request.user, field='organization_id'
            ).get(device_id=device_id)
        except Device.DoesNotExist:
            return Response(
                {'error': f'设备 {device_id} 不存在或无权访问'},
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