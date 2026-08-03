"""
Alert views for API.
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db.models import Count, Q, Avg
from django.db import transaction

from .models import Alert, AlertAction, FireTracing
from .serializers import (
    AlertListSerializer, AlertDetailSerializer,
    AlertActionSerializer, FireTracingSerializer,
    AlertCreateSerializer
)
from .filters import AlertFilter
from .tasks import process_alert, run_fire_tracing


class AlertViewSet(viewsets.ModelViewSet):
    """告警管理视图集"""
    queryset = Alert.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_class = AlertFilter
    search_fields = ['alert_id', 'title', 'region', 'forest_zone']
    ordering_fields = ['occurred_at', 'alert_level', 'status', 'created_at']
    ordering = ['-occurred_at']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return AlertListSerializer
        if self.action == 'create':
            return AlertCreateSerializer
        return AlertDetailSerializer
    
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
    
    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        """确认告警"""
        alert = self.get_object()
        alert.status = 'acknowledged'
        alert.save()
        
        AlertAction.objects.create(
            alert=alert,
            action_type='acknowledge',
            operator=request.user.username if request.user.is_authenticated else 'system',
            content='告警已确认'
        )
        
        return Response({'status': 'acknowledged'})
    
    @action(detail=True, methods=['post'])
    def dispatch(self, request, pk=None):
        """派单"""
        alert = self.get_object()
        assigned_to = request.data.get('assigned_to')
        
        alert.status = 'dispatched'
        alert.assigned_to = assigned_to
        alert.assigned_at = timezone.now()
        alert.save()
        
        AlertAction.objects.create(
            alert=alert,
            action_type='dispatch',
            operator=request.user.username if request.user.is_authenticated else 'system',
            content=f'已派单给: {assigned_to}'
        )
        
        return Response({'status': 'dispatched', 'assigned_to': assigned_to})
    
    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """处置告警"""
        alert = self.get_object()
        resolution_status = request.data.get('status', 'resolved')
        resolution_note = request.data.get('note', '')
        
        alert.status = resolution_status
        alert.resolved_at = timezone.now()
        alert.resolution_note = resolution_note
        alert.save()
        
        AlertAction.objects.create(
            alert=alert,
            action_type='resolve',
            operator=request.user.username if request.user.is_authenticated else 'system',
            content=resolution_note,
            photo_urls=request.data.get('photos', [])
        )
        
        return Response({'status': resolution_status})
    
    @action(detail=True, methods=['post'])
    def mark_false_alarm(self, request, pk=None):
        """标记误报"""
        alert = self.get_object()
        alert.status = 'false_alarm'
        alert.resolved_at = timezone.now()
        alert.resolution_note = request.data.get('note', '误报')
        alert.save()
        
        AlertAction.objects.create(
            alert=alert,
            action_type='false_alarm',
            operator=request.user.username if request.user.is_authenticated else 'system',
            content=request.data.get('note', '误报')
        )
        
        return Response({'status': 'false_alarm'})
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """告警统计"""
        hours = int(request.query_params.get('hours', 24))
        start_time = timezone.now() - timezone.timedelta(hours=hours)
        
        alerts = Alert.objects.filter(occurred_at__gte=start_time)
        
        stats = {
            'total': alerts.count(),
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
            'avg_confidence': alerts.filter(ai_confidence__isnull=False).aggregate(
                avg=Avg('ai_confidence')
            )['avg'] or 0,
        }
        
        return Response(stats)
    
    @action(detail=True, methods=['post'])
    def fire_tracing(self, request, pk=None):
        """启动火情溯源"""
        alert = self.get_object()
        
        if alert.alert_type not in ['fire', 'smoke']:
            return Response(
                {'error': '仅火情或烟雾告警可启动溯源'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        task = run_fire_tracing.delay(alert.id)
        
        return Response({
            'status': 'processing',
            'task_id': task.id,
            'message': '火情溯源任务已提交'
        })


class AlertActionViewSet(viewsets.ReadOnlyModelViewSet):
    """告警处置记录视图集"""
    queryset = AlertAction.objects.all()
    serializer_class = AlertActionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['alert', 'action_type']
    ordering_fields = ['created_at']
    ordering = ['-created_at']


class FireTracingViewSet(viewsets.ReadOnlyModelViewSet):
    """火情溯源视图集"""
    queryset = FireTracing.objects.all()
    serializer_class = FireTracingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['alert']
    ordering_fields = ['created_at']
    ordering = ['-created_at']
