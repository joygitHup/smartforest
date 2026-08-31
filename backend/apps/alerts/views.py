# apps/alerts/views.py
"""
Alert views for API.
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Count, Q, Avg, Sum
from django.db import transaction

from .models import Alert, AlertAction, FireTracing
from .serializers import (
    AlertListSerializer, AlertDetailSerializer,
    AlertActionSerializer, AlertActionCreateSerializer,
    FireTracingSerializer, FireTracingCreateSerializer,
    AlertCreateSerializer, AlertUpdateSerializer
)
from .filters import AlertFilter, AlertActionFilter, FireTracingFilter
from .tasks import process_alert, run_fire_tracing, send_notification

# ✅ 导入 ASGI 兼容的过滤器
from apps.core.filters import (
    ASGICompatibleDjangoFilterBackend,
    ASGICompatibleSearchFilter,
    ASGICompatibleOrderingFilter,
)


class AlertViewSet(viewsets.ModelViewSet):
    """告警管理视图集"""
    queryset = Alert.objects.select_related('device').all()
    permission_classes = [IsAuthenticated]
    filterset_class = AlertFilter
    # ✅ 使用 ASGI 兼容的过滤器
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['alert_id', 'title', 'region', 'forest_zone', 'device__device_name']
    ordering_fields = ['occurred_at', 'alert_level', 'status', 'created_at', 'ai_confidence']
    ordering = ['-occurred_at']
    lookup_field = 'pk'

    def get_serializer_class(self):
        """根据操作返回不同的序列化器"""
        if self.action == 'list':
            return AlertListSerializer
        elif self.action == 'create':
            return AlertCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return AlertUpdateSerializer
        return AlertDetailSerializer

    # ❌ 删除以下方法（如果有）：
    # def dispatch(self, request, *args, **kwargs):
    #     ...

    def create(self, request, *args, **kwargs):
        """创建告警（用于 MQTT 接收）"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 异步处理告警
        task = process_alert.delay(serializer.validated_data)

        return Response({
            'status': 'processing',
            'task_id': task.id,
            'message': '告警处理任务已提交'
        }, status=status.HTTP_202_ACCEPTED)

    def destroy(self, request, *args, **kwargs):
        """删除告警"""
        instance = self.get_object()
        # 检查是否有关联数据
        if instance.actions.exists():
            return Response(
                {'error': '告警有关联的处置记录，请先删除处置记录'},
                status=status.HTTP_409_CONFLICT
            )
        self.perform_destroy(instance)
        return Response(
            {'message': f'告警 {instance.alert_id} 已删除'},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        """确认告警"""
        alert = self.get_object()
        if alert.status not in ['new', 'escalated']:
            return Response(
                {'error': f'当前状态 {alert.status} 无法确认'},
                status=status.HTTP_400_BAD_REQUEST
            )

        alert.status = 'acknowledged'
        alert.save()

        AlertAction.objects.create(
            alert=alert,
            action_type='acknowledge',
            operator=request.user.username if request.user.is_authenticated else 'system',
            content='告警已确认'
        )

        return Response({
            'status': 'acknowledged',
            'message': f'告警 {alert.alert_id} 已确认'
        })

    # @action(detail=True, methods=['post'])
    # def dispatch(self, request, pk=None):
    #     """派单"""
    #     alert = self.get_object()
    #     assigned_to = request.data.get('assigned_to')
    #
    #     if not assigned_to:
    #         return Response(
    #             {'error': '请提供 assigned_to 字段'},
    #             status=status.HTTP_400_BAD_REQUEST
    #         )
    #
    #     if alert.status not in ['acknowledged', 'new']:
    #         return Response(
    #             {'error': f'当前状态 {alert.status} 无法派单'},
    #             status=status.HTTP_400_BAD_REQUEST
    #         )
    #
    #     alert.status = 'dispatched'
    #     alert.assigned_to = assigned_to
    #     alert.assigned_at = timezone.now()
    #     alert.save()
    #
    #     AlertAction.objects.create(
    #         alert=alert,
    #         action_type='dispatch',
    #         operator=request.user.username if request.user.is_authenticated else 'system',
    #         content=f'已派单给: {assigned_to}'
    #     )
    #
    #     return Response({
    #         'status': 'dispatched',
    #         'assigned_to': assigned_to,
    #         'message': f'已派单给 {assigned_to}'
    #     })

    @action(detail=True, methods=['post'])
    def processing(self, request, pk=None):
        """开始处理"""
        alert = self.get_object()

        if alert.status != 'dispatched':
            return Response(
                {'error': f'当前状态 {alert.status} 无法开始处理'},
                status=status.HTTP_400_BAD_REQUEST
            )

        alert.status = 'processing'
        alert.save()

        AlertAction.objects.create(
            alert=alert,
            action_type='processing',
            operator=request.user.username if request.user.is_authenticated else 'system',
            content=request.data.get('note', '开始处理告警')
        )

        return Response({
            'status': 'processing',
            'message': f'告警 {alert.alert_id} 处理中'
        })

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """处置告警"""
        alert = self.get_object()
        resolution_status = request.data.get('status', 'resolved')
        resolution_note = request.data.get('note', '')
        photos = request.data.get('photos', [])

        if resolution_status not in ['resolved', 'false_alarm']:
            return Response(
                {'error': '状态必须为 resolved 或 false_alarm'},
                status=status.HTTP_400_BAD_REQUEST
            )

        alert.status = resolution_status
        alert.resolved_at = timezone.now()
        if resolution_note:
            alert.resolution_note = resolution_note
        alert.save()

        AlertAction.objects.create(
            alert=alert,
            action_type='resolve' if resolution_status == 'resolved' else 'false_alarm',
            operator=request.user.username if request.user.is_authenticated else 'system',
            content=resolution_note,
            photo_urls=photos
        )

        return Response({
            'status': resolution_status,
            'message': f'告警 {alert.alert_id} 已处置'
        })

    @action(detail=True, methods=['post'])
    def escalate(self, request, pk=None):
        """升级告警"""
        alert = self.get_object()

        # 只有一级告警才能升级
        if alert.alert_level != 'level_1':
            return Response(
                {'error': '仅一级告警可升级'},
                status=status.HTTP_400_BAD_REQUEST
            )

        alert.status = 'escalated'
        alert.save()

        AlertAction.objects.create(
            alert=alert,
            action_type='escalate',
            operator=request.user.username if request.user.is_authenticated else 'system',
            content=request.data.get('note', '告警已升级')
        )

        # 发送通知
        send_notification.delay(alert.id)

        return Response({
            'status': 'escalated',
            'message': f'告警 {alert.alert_id} 已升级'
        })

    @action(detail=True, methods=['post'])
    def fire_tracing(self, request, pk=None):
        """启动火情溯源"""
        alert = self.get_object()

        if alert.alert_type not in ['fire', 'smoke']:
            return Response(
                {'error': '仅火情或烟雾告警可启动溯源'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 检查是否已有溯源记录
        if hasattr(alert, 'fire_tracing'):
            return Response(
                {'error': '该告警已有溯源记录'},
                status=status.HTTP_400_BAD_REQUEST
            )

        task = run_fire_tracing.delay(alert.id)

        return Response({
            'status': 'processing',
            'task_id': task.id,
            'message': '火情溯源任务已提交'
        })

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """告警统计"""
        hours = int(request.GET.get('hours', 24))
        start_time = timezone.now() - timezone.timedelta(hours=hours)

        alerts = Alert.objects.filter(occurred_at__gte=start_time)
        total = alerts.count()

        stats = {
            'period': f'{hours}小时',
            'total': total,
            'by_level': dict(
                alerts.values_list('alert_level').annotate(
                    count=Count('id')
                ).values_list('alert_level', 'count')
            ),
            'by_type': dict(
                alerts.values_list('alert_type').annotate(
                    count=Count('id')
                ).values_list('alert_type', 'count')
            ),
            'by_status': dict(
                alerts.values_list('status').annotate(
                    count=Count('id')
                ).values_list('status', 'count')
            ),
            'by_region': dict(
                alerts.values_list('region').annotate(
                    count=Count('id')
                ).values_list('region', 'count')
            ),
            'by_forest_zone': dict(
                alerts.values_list('forest_zone').annotate(
                    count=Count('id')
                ).values_list('forest_zone', 'count')
            ),
            'avg_confidence': alerts.filter(ai_confidence__isnull=False).aggregate(
                avg=Avg('ai_confidence')
            )['avg'] or 0,
            'unresolved_count': alerts.exclude(status__in=['resolved', 'false_alarm']).count(),
            'resolved_rate': round(
                (alerts.filter(status__in=['resolved', 'false_alarm']).count() / total * 100) if total > 0 else 0,
                2
            )
        }

        return Response(stats)

    @action(detail=True, methods=['get'])
    def actions(self, request, pk=None):
        """获取告警的所有处置记录"""
        alert = self.get_object()
        actions = alert.actions.all().order_by('-created_at')
        serializer = AlertActionSerializer(actions, many=True)
        return Response(serializer.data)


class AlertActionViewSet(viewsets.ModelViewSet):
    """告警处置记录视图集"""
    queryset = AlertAction.objects.select_related('alert').all()
    serializer_class = AlertActionSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = AlertActionFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['operator', 'content', 'alert__alert_id', 'alert__title']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
    lookup_field = 'pk'

    def get_serializer_class(self):
        if self.action in ['create']:
            return AlertActionCreateSerializer
        return AlertActionSerializer

    def create(self, request, *args, **kwargs):
        """创建处置记录"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 获取告警
        alert_id = request.data.get('alert')
        if not alert_id:
            return Response(
                {'error': '请提供 alert 字段'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            alert = Alert.objects.get(id=alert_id)
        except Alert.DoesNotExist:
            return Response(
                {'error': '告警不存在'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 创建处置记录
        action = AlertAction.objects.create(
            alert=alert,
            action_type=serializer.validated_data.get('action_type', 'manual'),
            operator=serializer.validated_data.get('operator', request.user.username),
            content=serializer.validated_data.get('content', ''),
            photo_urls=serializer.validated_data.get('photo_urls', []),
            video_url=serializer.validated_data.get('video_url', ''),
            location=serializer.validated_data.get('location', '')
        )

        result_serializer = AlertActionSerializer(action)
        return Response(result_serializer.data, status=status.HTTP_201_CREATED)


class FireTracingViewSet(viewsets.ReadOnlyModelViewSet):
    """火情溯源视图集"""
    queryset = FireTracing.objects.select_related('alert').all()
    serializer_class = FireTracingSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = FireTracingFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['alert__alert_id', 'alert__title', 'algorithm']
    ordering_fields = ['created_at', 'origin_confidence']
    ordering = ['-created_at']
    lookup_field = 'pk'

    @action(detail=False, methods=['post'])
    def create_tracing(self, request):
        """手动创建火情溯源"""
        serializer = FireTracingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        alert_id = serializer.validated_data['alert_id']

        try:
            alert = Alert.objects.get(id=alert_id)
        except Alert.DoesNotExist:
            return Response(
                {'error': '告警不存在'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 检查是否已有溯源记录
        if hasattr(alert, 'fire_tracing'):
            return Response(
                {'error': '该告警已有溯源记录'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 启动火情溯源
        task = run_fire_tracing.delay(alert.id)

        return Response({
            'status': 'processing',
            'task_id': task.id,
            'message': '火情溯源任务已提交'
        })