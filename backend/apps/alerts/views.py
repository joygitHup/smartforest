# apps/alerts/views.py
"""
Alert views for API.
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Count, Avg

from .models import Alert, AlertAction, FireTracing, AlertRule, AlertReinforcement, WorkOrder
from .serializers import (
    AlertListSerializer, AlertDetailSerializer,
    AlertActionSerializer, AlertActionCreateSerializer,
    FireTracingSerializer, FireTracingCreateSerializer,
    AlertCreateSerializer, AlertUpdateSerializer,
    AlertRuleSerializer, AlertReinforcementSerializer,
    AlertReinforcementCreateSerializer,
    WorkOrderSerializer, WorkOrderCreateSerializer, WorkOrderUpdateSerializer,
)
from .filters import (
    AlertFilter, AlertActionFilter, FireTracingFilter,
    AlertRuleFilter, AlertReinforcementFilter, WorkOrderFilter,
)
from .tasks import process_alert, run_fire_tracing, send_notification
from .export_utils import alerts_to_csv_response
from .work_orders import (
    create_work_order_for_alert,
    resolve_assignee,
    sync_work_orders_on_alert_status,
    is_system_admin,
    _display_name,
)

from apps.users.mixins import OrgScopedQuerysetMixin
from apps.users.org_scope import (
    can_manage_organization_data,
    filter_alert_related_for_user,
    filter_alert_rules_for_user,
    filter_alerts_for_user,
    filter_by_org_scope,
    filter_work_orders_for_user,
    is_unrestricted_viewer,
    org_in_scope,
    resolve_create_organization_id,
)

# ✅ 导入 ASGI 兼容的过滤器
from apps.core.filters import (
    ASGICompatibleDjangoFilterBackend,
    ASGICompatibleSearchFilter,
    ASGICompatibleOrderingFilter,
)


class AlertViewSet(OrgScopedQuerysetMixin, viewsets.ModelViewSet):
    """告警管理视图集"""
    queryset = Alert.objects.select_related('device', 'organization').all()
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
    org_scope_field = 'organization_id'
    org_assign_on_create = False

    def get_queryset(self):
        qs = Alert.objects.select_related('device', 'organization', 'forest_zone_ref').all()
        return filter_alerts_for_user(qs, self.request.user)

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
        """创建告警（异步 Celery 入库）"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Celery JSON 序列化器不能直接传 Decimal/特殊类型
        payload = {}
        for key, value in serializer.validated_data.items():
            if hasattr(value, 'as_tuple'):  # Decimal
                payload[key] = float(value)
            else:
                payload[key] = value

        try:
            task = process_alert.delay(payload)
        except Exception as exc:
            return Response(
                {
                    'error': '提交异步任务失败，请确认 Redis/Celery Worker 已启动',
                    'detail': str(exc),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({
            'status': 'processing',
            'task_id': task.id,
            'message': '告警处理任务已提交，请稍后刷新列表查看'
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

    @action(detail=True, methods=['post'], url_path='dispatch')
    def dispatch_alert(self, request, pk=None):
        """派单（url_path=dispatch，避免与 ViewSet.dispatch 冲突）；可指定处理人并生成工单。"""
        alert = self.get_object()
        assignee_id = request.data.get('assignee_id')
        assigned_to = request.data.get('assigned_to') or ''
        note = request.data.get('note', '')
        create_ticket = request.data.get('create_work_order', True)
        if isinstance(create_ticket, str):
            create_ticket = create_ticket.lower() not in ('0', 'false', 'no')

        assignee, assignee_name = resolve_assignee(assignee_id, assigned_to)
        if not assignee_name:
            assignee_name = (
                request.user.username if request.user.is_authenticated else ''
            )
            if request.user.is_authenticated and not assignee:
                assignee = request.user
                from .work_orders import _display_name
                assignee_name = _display_name(request.user) or request.user.username

        if not assignee_name:
            return Response(
                {'error': '请指定处理人（assignee_id 或 assigned_to）'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if alert.status not in ['acknowledged', 'new', 'escalated']:
            return Response(
                {'error': f'当前状态 {alert.status} 无法派单'},
                status=status.HTTP_400_BAD_REQUEST
            )

        alert.status = 'dispatched'
        alert.assigned_to = assignee_name
        alert.assigned_at = timezone.now()
        alert.save()

        work_order = None
        if create_ticket:
            work_order = create_work_order_for_alert(
                alert=alert,
                creator=request.user if request.user.is_authenticated else None,
                assignee=assignee,
                assignee_name=assignee_name,
                note=note,
            )

        AlertAction.objects.create(
            alert=alert,
            action_type='dispatch',
            operator=request.user.username if request.user.is_authenticated else 'system',
            content=(
                f'已派单给: {assignee_name}'
                + (f'，工单 {work_order.work_order_id}' if work_order else '')
                + (f'。{note}' if note else '')
            ),
        )

        payload = {
            'status': 'dispatched',
            'assigned_to': assignee_name,
            'assignee_id': assignee.id if assignee else None,
            'message': f'已派单给 {assignee_name}',
        }
        if work_order:
            payload['work_order_id'] = work_order.work_order_id
            payload['work_order_pk'] = work_order.id
            payload['message'] = (
                f'已派单给 {assignee_name}，并生成工单 {work_order.work_order_id}'
            )
        return Response(payload)

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
        note = request.data.get('note', '开始处理告警')
        sync_work_orders_on_alert_status(alert, note=note)

        AlertAction.objects.create(
            alert=alert,
            action_type='processing',
            operator=request.user.username if request.user.is_authenticated else 'system',
            content=note,
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
        sync_work_orders_on_alert_status(alert, note=resolution_note)

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
        """告警统计（含未关闭一级/二级数量）— 强制本组织子树隔离"""
        hours = int(request.GET.get('hours', 24))
        start_time = timezone.now() - timezone.timedelta(hours=hours)

        alerts = self.get_queryset().filter(occurred_at__gte=start_time)
        total = alerts.count()
        unresolved_qs = alerts.exclude(status__in=['resolved', 'false_alarm'])

        stats = {
            'period': f'{hours}小时',
            'total': total,
            'by_level': dict(
                alerts.values('alert_level').annotate(count=Count('id')).values_list('alert_level', 'count')
            ),
            'by_type': dict(
                alerts.values('alert_type').annotate(count=Count('id')).values_list('alert_type', 'count')
            ),
            'by_status': dict(
                alerts.values('status').annotate(count=Count('id')).values_list('status', 'count')
            ),
            'by_region': dict(
                alerts.exclude(region='').values('region').annotate(count=Count('id')).values_list('region', 'count')
            ),
            'by_forest_zone': dict(
                alerts.exclude(forest_zone='')
                .values('forest_zone')
                .annotate(count=Count('id'))
                .values_list('forest_zone', 'count')
            ),
            'avg_confidence': alerts.filter(ai_confidence__isnull=False).aggregate(
                avg=Avg('ai_confidence')
            )['avg'] or 0,
            'unresolved_count': unresolved_qs.count(),
            'unresolved_level_1': unresolved_qs.filter(alert_level='level_1').count(),
            'unresolved_level_2': unresolved_qs.filter(alert_level='level_2').count(),
            'resolved_rate': round(
                (alerts.filter(status__in=['resolved', 'false_alarm']).count() / total * 100) if total > 0 else 0,
                2
            ),
        }

        return Response(stats)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """导出告警报表 CSV（支持与列表相同的过滤参数）"""
        queryset = self.filter_queryset(self.get_queryset())
        # 导出上限，避免过大
        queryset = queryset[:5000]
        fmt = request.query_params.get('export_format', 'csv').lower()
        if fmt not in ('csv', 'excel'):
            return Response(
                {'error': '仅支持 export_format=csv 或 export_format=excel'},
                status=status.HTTP_400_BAD_REQUEST
            )
        filename = f"alerts_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return alerts_to_csv_response(queryset, filename=filename)

    @action(detail=True, methods=['post'])
    def reinforce(self, request, pk=None):
        """请求增援"""
        alert = self.get_object()
        serializer = AlertReinforcementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if alert.status in ['resolved', 'false_alarm']:
            return Response(
                {'error': '已关闭的告警无法请求增援'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reinforcement = AlertReinforcement.objects.create(
            alert=alert,
            requester=request.user.username if request.user.is_authenticated else 'anonymous',
            reason=data['reason'],
            contact=data.get('contact', ''),
            required_people=data.get('required_people', 1),
        )

        AlertAction.objects.create(
            alert=alert,
            action_type='reinforce',
            operator=reinforcement.requester,
            content=f'请求增援：{data["reason"]}（人数 {reinforcement.required_people}）',
        )

        # 异步通知
        try:
            send_notification.delay(alert.id)
        except Exception:
            pass

        return Response(
            AlertReinforcementSerializer(reinforcement).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['get'])
    def navigation(self, request, pk=None):
        """导航至火点：返回坐标与第三方地图链接（前端打开即可）"""
        alert = self.get_object()
        lat = alert.latitude
        lng = alert.longitude
        source = 'alert'

        if (lat is None or lng is None) and hasattr(alert, 'fire_tracing') and alert.fire_tracing:
            lat = alert.fire_tracing.origin_latitude
            lng = alert.fire_tracing.origin_longitude
            source = 'fire_tracing'
        elif (lat is None or lng is None) and alert.device_id:
            lat = alert.device.latitude
            lng = alert.device.longitude
            source = 'device'

        if lat is None or lng is None:
            return Response(
                {
                    'alert_id': alert.alert_id,
                    'latitude': None,
                    'longitude': None,
                    'source': source,
                    'amap_url': '',
                    'baidu_url': '',
                    'google_url': '',
                    'message': '暂无可用坐标，无法导航',
                },
                status=status.HTTP_404_NOT_FOUND
            )

        lat_f = float(lat)
        lng_f = float(lng)
        name = alert.title or alert.alert_id

        return Response({
            'alert_id': alert.alert_id,
            'latitude': lat_f,
            'longitude': lng_f,
            'source': source,
            'amap_url': (
                f'https://uri.amap.com/marker?position={lng_f},{lat_f}'
                f'&name={name}&coordinate=gaode&callnative=1'
            ),
            'baidu_url': (
                f'https://api.map.baidu.com/marker?location={lat_f},{lng_f}'
                f'&title={name}&content={alert.alert_id}&output=html&coord_type=gcj02'
            ),
            'google_url': f'https://www.google.com/maps?q={lat_f},{lng_f}',
            'message': 'ok',
        })

    @action(detail=True, methods=['get'])
    def actions(self, request, pk=None):
        """获取告警的所有处置记录"""
        alert = self.get_object()
        actions = alert.actions.all().order_by('-created_at')
        serializer = AlertActionSerializer(actions, many=True)
        return Response(serializer.data)


class AlertActionViewSet(viewsets.ModelViewSet):
    """告警处置记录视图集：管理员看本局全部；普通用户仅看本人相关。"""
    queryset = AlertAction.objects.select_related('alert', 'alert__device', 'alert__organization').all()
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

    def get_queryset(self):
        qs = filter_alert_related_for_user(super().get_queryset(), self.request.user)
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
        if can_manage_organization_data(user) or is_unrestricted_viewer(user):
            return qs
        from django.db.models import Q

        display = _display_name(user) or user.username
        return qs.filter(
            Q(operator=user.username)
            | Q(operator=display)
            | Q(alert__assigned_to=user.username)
            | Q(alert__assigned_to=display)
            | Q(alert__work_orders__assignee=user)
        ).distinct()

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
            alert = filter_alerts_for_user(Alert.objects.all(), request.user).get(id=alert_id)
        except Alert.DoesNotExist:
            return Response(
                {'error': '告警不存在或无权访问'},
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


class FireTracingViewSet(OrgScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """火情溯源视图集"""
    queryset = FireTracing.objects.select_related('alert', 'alert__device', 'alert__organization').all()
    serializer_class = FireTracingSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = FireTracingFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = [
        'alert__alert_id',
        'alert__title',
        'algorithm',
        'alert__region',
        'alert__forest_zone',
        'alert__device__device_id',
        'alert__device__device_name',
    ]
    ordering_fields = ['created_at', 'origin_confidence', 'updated_at']
    ordering = ['-created_at']
    lookup_field = 'pk'
    org_scope_field = 'alert__organization_id'
    org_assign_on_create = False

    def get_queryset(self):
        return filter_alert_related_for_user(
            FireTracing.objects.select_related('alert', 'alert__device', 'alert__organization').all(),
            self.request.user,
        )

    @action(detail=False, methods=['post'])
    def create_tracing(self, request):
        """手动创建火情溯源"""
        serializer = FireTracingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        alert_id = serializer.validated_data['alert_id']

        try:
            alert = filter_alerts_for_user(Alert.objects.all(), request.user).get(id=alert_id)
        except Alert.DoesNotExist:
            return Response(
                {'error': '告警不存在或无权访问'},
                status=status.HTTP_404_NOT_FOUND
            )

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

        # 启动火情溯源
        task = run_fire_tracing.delay(alert.id)

        return Response({
            'status': 'processing',
            'task_id': task.id,
            'message': '火情溯源任务已提交'
        })

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """火情溯源统计"""
        qs = self.filter_queryset(self.get_queryset())
        total = qs.count()
        by_level = dict(
            qs.values('alert__alert_level')
            .annotate(count=Count('id'))
            .values_list('alert__alert_level', 'count')
        )
        by_status = dict(
            qs.values('alert__status')
            .annotate(count=Count('id'))
            .values_list('alert__status', 'count')
        )
        avg_confidence = qs.aggregate(avg=Avg('origin_confidence'))['avg'] or 0
        active_statuses = ['new', 'acknowledged', 'dispatched', 'processing', 'escalated']
        active_count = qs.filter(alert__status__in=active_statuses).count()
        resolved_count = qs.filter(alert__status__in=['resolved', 'false_alarm']).count()

        return Response({
            'total': total,
            'active_count': active_count,
            'resolved_count': resolved_count,
            'by_level': by_level,
            'by_status': by_status,
            'avg_confidence': round(float(avg_confidence), 4),
        })

    @action(detail=True, methods=['get'])
    def report(self, request, pk=None):
        """生成溯源报告（JSON，供前端下载）"""
        tracing = self.get_object()
        data = FireTracingSerializer(tracing).data
        control = tracing.control_strategy if isinstance(tracing.control_strategy, dict) else {}
        report = {
            'report_title': f'火情溯源报告 - {tracing.alert.alert_id}',
            'generated_at': timezone.now().isoformat(),
            'summary': {
                'alert_id': tracing.alert.alert_id,
                'title': tracing.alert.title,
                'level': tracing.alert.get_alert_level_display(),
                'status': tracing.alert.get_status_display(),
                'region': tracing.alert.region,
                'forest_zone': tracing.alert.forest_zone,
                'device': tracing.alert.device.device_name if tracing.alert.device_id else '',
                'occurred_at': tracing.alert.occurred_at.isoformat() if tracing.alert.occurred_at else None,
            },
            'origin': {
                'longitude': float(tracing.origin_longitude),
                'latitude': float(tracing.origin_latitude),
                'confidence': tracing.origin_confidence,
                'algorithm': tracing.algorithm,
                'input_devices': tracing.input_devices,
            },
            'weather': tracing.weather_data,
            'spread': {
                '1h': tracing.spread_prediction_1h,
                '3h': tracing.spread_prediction_3h,
                '6h': tracing.spread_prediction_6h,
            },
            'control_strategy': control,
            'raw': data,
        }
        return Response(report)

class AlertRuleViewSet(OrgScopedQuerysetMixin, viewsets.ModelViewSet):
    """告警规则 CRUD（可见范围与角色一致：系统默认 + 本组织子树，平级隔离）"""
    queryset = AlertRule.objects.select_related(
        'organization', 'forest_zone_ref'
    ).prefetch_related('devices').all()
    serializer_class = AlertRuleSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = AlertRuleFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['name', 'description', 'region', 'device_type']
    ordering_fields = ['alert_level', 'confidence_threshold', 'updated_at', 'created_at']
    ordering = ['alert_level', '-updated_at']
    org_scope_field = 'organization_id'
    org_assign_on_create = False

    def get_queryset(self):
        qs = AlertRule.objects.select_related(
            'organization', 'forest_zone_ref'
        ).prefetch_related('devices').all()
        return filter_alert_rules_for_user(qs, self.request.user)

    def perform_create(self, serializer):
        # 仅平台管理员可创建系统默认规则；下属单位自建强制挂本组织
        if is_unrestricted_viewer(self.request.user) and self.request.data.get('is_system') in (
            True, 'true', 'True', '1', 1,
        ):
            serializer.validated_data.pop('organization', None)
            instance = serializer.save(organization=None, is_system=True)
            from core.perf_cache import invalidate_alert_rules
            invalidate_alert_rules(None)
            return instance
        requested = serializer.validated_data.get('organization')
        requested_id = requested.pk if requested is not None else self.request.data.get('organization_id')
        if requested_id is not None:
            try:
                requested_id = int(requested_id)
            except (TypeError, ValueError) as exc:
                raise PermissionDenied('无效的组织 ID') from exc
        org_id = resolve_create_organization_id(self.request.user, requested_id)
        serializer.validated_data.pop('organization', None)
        instance = serializer.save(organization_id=org_id, is_system=False)
        from core.perf_cache import invalidate_alert_rules
        invalidate_alert_rules(org_id)
        return instance

    def perform_update(self, serializer):
        rule = serializer.instance
        if rule.is_system and not is_unrestricted_viewer(self.request.user):
            raise PermissionDenied('系统默认规则仅平台管理员可修改')
        if 'organization' in serializer.validated_data:
            if rule.is_system:
                raise PermissionDenied('系统默认规则不可变更所属组织')
            new_org = serializer.validated_data.get('organization')
            new_id = new_org.id if new_org is not None else None
            if new_id is not None and not org_in_scope(self.request.user, new_id):
                raise PermissionDenied('无权将规则归属到该组织')
        instance = serializer.save()
        from core.perf_cache import invalidate_alert_rules
        invalidate_alert_rules(None if instance.is_system else instance.organization_id)
        return instance

    def perform_destroy(self, instance):
        org_id = None if instance.is_system else instance.organization_id
        super().perform_destroy(instance)
        from core.perf_cache import invalidate_alert_rules
        invalidate_alert_rules(org_id)

    def destroy(self, request, *args, **kwargs):
        rule = self.get_object()
        if rule.is_system:
            return Response(
                {'error': '系统默认规则不可删除'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not org_in_scope(request.user, rule.organization_id):
            return Response({'error': '无权删除该规则'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class AlertReinforcementViewSet(OrgScopedQuerysetMixin, viewsets.ModelViewSet):
    """增援申请列表 / 更新状态"""
    queryset = AlertReinforcement.objects.select_related('alert', 'alert__organization').all()
    serializer_class = AlertReinforcementSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = AlertReinforcementFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['requester', 'reason', 'alert__alert_id']
    ordering_fields = ['created_at', 'status']
    ordering = ['-created_at']
    http_method_names = ['get', 'patch', 'put', 'head', 'options']
    org_scope_field = 'alert__organization_id'
    org_assign_on_create = False

    def get_queryset(self):
        return filter_alert_related_for_user(
            AlertReinforcement.objects.select_related('alert', 'alert__organization').all(),
            self.request.user,
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        note = instance.handler_note or ''
        AlertAction.objects.create(
            alert=instance.alert,
            action_type='reinforce_update',
            operator=(
                self.request.user.username
                if self.request.user.is_authenticated
                else 'system'
            ),
            content=f'增援状态更新为: {instance.get_status_display()} {note}'.strip(),
        )


class WorkOrderViewSet(OrgScopedQuerysetMixin, viewsets.ModelViewSet):
    """工单管理：默认仅可见「指派给自己 / 自己领取」的工单；本局管理员可见本局全部。"""
    queryset = WorkOrder.objects.select_related('alert', 'assignee', 'creator', 'organization').all()
    permission_classes = [IsAuthenticated]
    filterset_class = WorkOrderFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = [
        'work_order_id', 'title', 'assignee_name', 'creator_name',
        'alert__alert_id', 'region', 'forest_zone',
    ]
    ordering_fields = ['created_at', 'due_at', 'priority', 'status', 'updated_at']
    ordering = ['-created_at']
    org_scope_field = 'organization_id'
    org_assign_on_create = False

    def get_queryset(self):
        qs = filter_work_orders_for_user(
            WorkOrder.objects.select_related(
                'alert', 'assignee', 'creator', 'organization', 'alert__device'
            ).all(),
            self.request.user,
        )
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
        # 本局管理员 / 全平台：看组织视野内全部工单
        if can_manage_organization_data(user) or is_unrestricted_viewer(user):
            return qs
        from django.db.models import Q

        display = _display_name(user) or user.username
        return qs.filter(
            Q(assignee=user)
            | Q(assignee__isnull=True, assignee_name=user.username)
            | Q(assignee__isnull=True, assignee_name=display)
        )

    def get_serializer_class(self):
        if self.action == 'create':
            return WorkOrderCreateSerializer
        if self.action in ['update', 'partial_update']:
            return WorkOrderUpdateSerializer
        return WorkOrderSerializer

    def create(self, request, *args, **kwargs):
        serializer = WorkOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        alert = filter_alerts_for_user(Alert.objects.all(), request.user).filter(
            pk=data['alert_id']
        ).first()
        if not alert:
            return Response({'error': '告警不存在或无权访问'}, status=status.HTTP_404_NOT_FOUND)

        assignee, assignee_name = resolve_assignee(
            data.get('assignee_id'),
            data.get('assigned_to', ''),
        )
        if not assignee_name:
            return Response(
                {'error': '请指定处理人'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 若告警尚未派单，一并派单
        if alert.status in ['new', 'acknowledged', 'escalated']:
            if alert.status in ['new', 'escalated']:
                alert.status = 'acknowledged'
            alert.status = 'dispatched'
            alert.assigned_to = assignee_name
            alert.assigned_at = timezone.now()
            alert.save()
            AlertAction.objects.create(
                alert=alert,
                action_type='dispatch',
                operator=request.user.username,
                content=f'创建工单并派单给: {assignee_name}',
            )

        work_order = create_work_order_for_alert(
            alert=alert,
            creator=request.user,
            assignee=assignee,
            assignee_name=assignee_name,
            note=data.get('note', ''),
            force_new=True,
        )
        if data.get('title'):
            work_order.title = data['title']
            work_order.save(update_fields=['title', 'updated_at'])

        return Response(
            WorkOrderSerializer(work_order).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """接单（领取）：仅处理人本人可接；未绑定用户时绑定为当前用户。"""
        wo = self.get_object()
        if wo.status != 'pending':
            return Response({'error': '仅待接单工单可接单'}, status=status.HTTP_400_BAD_REQUEST)
        if wo.assignee_id and wo.assignee_id != request.user.id and not is_system_admin(request.user):
            return Response({'error': '该工单已指派给他人'}, status=status.HTTP_403_FORBIDDEN)
        wo.status = 'accepted'
        wo.accepted_at = timezone.now()
        if not wo.assignee and request.user.is_authenticated:
            from .work_orders import _display_name
            wo.assignee = request.user
            wo.assignee_name = _display_name(request.user) or request.user.username
        wo.save()
        AlertAction.objects.create(
            alert=wo.alert,
            action_type='manual',
            operator=request.user.username,
            content=f'工单 {wo.work_order_id} 已接单',
        )
        return Response(WorkOrderSerializer(wo).data)

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        """开始处理工单，并同步告警为 processing"""
        wo = self.get_object()
        if wo.status not in ['pending', 'accepted']:
            return Response({'error': '当前状态无法开始处理'}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        wo.status = 'in_progress'
        wo.accepted_at = wo.accepted_at or now
        wo.started_at = now
        wo.save()

        alert = wo.alert
        if alert.status == 'dispatched':
            alert.status = 'processing'
            alert.save(update_fields=['status', 'updated_at'])
            AlertAction.objects.create(
                alert=alert,
                action_type='processing',
                operator=request.user.username,
                content=request.data.get('note', f'工单 {wo.work_order_id} 开始处理'),
            )
        return Response(WorkOrderSerializer(wo).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """完成工单，可选同步关闭告警"""
        wo = self.get_object()
        if wo.status in ['completed', 'cancelled', 'rejected']:
            return Response({'error': '工单已结束'}, status=status.HTTP_400_BAD_REQUEST)
        note = request.data.get('note', '')
        close_alert = request.data.get('close_alert', True)
        if isinstance(close_alert, str):
            close_alert = close_alert.lower() not in ('0', 'false', 'no')
        resolution = request.data.get('alert_status', 'resolved')
        if resolution not in ['resolved', 'false_alarm']:
            resolution = 'resolved'

        wo.status = 'completed'
        wo.completed_at = timezone.now()
        if note:
            wo.result_note = note
        wo.save()

        alert = wo.alert
        if close_alert and alert.status not in ['resolved', 'false_alarm']:
            alert.status = resolution
            alert.resolved_at = timezone.now()
            if note:
                alert.resolution_note = note
            alert.save()
            AlertAction.objects.create(
                alert=alert,
                action_type='resolve' if resolution == 'resolved' else 'false_alarm',
                operator=request.user.username,
                content=note or f'工单 {wo.work_order_id} 完成并关闭告警',
            )
        else:
            AlertAction.objects.create(
                alert=alert,
                action_type='manual',
                operator=request.user.username,
                content=note or f'工单 {wo.work_order_id} 已完成',
            )
        return Response(WorkOrderSerializer(wo).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """取消工单"""
        wo = self.get_object()
        if wo.status in ['completed', 'cancelled']:
            return Response({'error': '工单已结束'}, status=status.HTTP_400_BAD_REQUEST)
        note = request.data.get('note', '工单已取消')
        wo.status = 'cancelled'
        wo.result_note = note
        wo.completed_at = timezone.now()
        wo.save()
        AlertAction.objects.create(
            alert=wo.alert,
            action_type='manual',
            operator=request.user.username,
            content=f'工单 {wo.work_order_id} 已取消：{note}',
        )
        return Response(WorkOrderSerializer(wo).data)
