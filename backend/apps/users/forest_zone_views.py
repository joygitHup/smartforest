"""林区主数据 ViewSet。"""
from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.filters import (
    ASGICompatibleDjangoFilterBackend,
    ASGICompatibleOrderingFilter,
    ASGICompatibleSearchFilter,
)
from apps.users.filters import ForestZoneFilter
from apps.users.mixins import OrgManagerPermissionMixin, OrgScopedQuerysetMixin
from apps.users.models import ForestZone
from apps.users.org_scope import org_in_scope
from apps.users.serializers import ForestZoneSerializer


class ForestZoneViewSet(OrgScopedQuerysetMixin, OrgManagerPermissionMixin, viewsets.ModelViewSet):
    """林区 CRUD：按组织子树隔离；写操作需本局管理员。"""

    queryset = ForestZone.objects.select_related('organization').annotate(
        device_count=Count('devices', distinct=True),
    )
    serializer_class = ForestZoneSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = ForestZoneFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['name', 'code', 'region', 'manager', 'contact']
    ordering_fields = ['sort_order', 'id', 'name', 'code', 'created_at']
    ordering = ['sort_order', 'id']
    org_scope_field = 'organization_id'
    org_manager_write_actions = ('create', 'update', 'partial_update', 'destroy')

    def perform_update(self, serializer):
        instance = serializer.instance
        # 停用时不强制解绑设备，但新建设备前端会过滤未启用林区
        super().perform_update(serializer)
        # 同步设备冗余林区名
        if 'name' in serializer.validated_data:
            instance.devices.update(forest_zone=serializer.validated_data['name'])

    def destroy(self, request, *args, **kwargs):
        zone = self.get_object()
        if zone.devices.exists():
            return Response(
                {
                    'error': '林区下仍有设备，请先迁移设备或停用林区',
                    'device_count': zone.devices.count(),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def options_list(self, request):
        """设备/规则下拉：本视野启用林区。"""
        qs = self.get_queryset().filter(is_active=True)
        org_id = request.query_params.get('organization_id')
        if org_id:
            try:
                oid = int(org_id)
            except (TypeError, ValueError):
                return Response({'error': '无效 organization_id'}, status=status.HTTP_400_BAD_REQUEST)
            if not org_in_scope(request.user, oid):
                return Response({'error': '无权访问该组织林区'}, status=status.HTTP_403_FORBIDDEN)
            qs = qs.filter(organization_id=oid)
        data = [
            {
                'id': z.id,
                'name': z.name,
                'code': z.code,
                'organization_id': z.organization_id,
                'region': z.region,
                'regions': z.get_region_list(),
                'device_count': getattr(z, 'device_count', 0),
            }
            for z in qs.order_by('sort_order', 'id')
        ]
        return Response({'count': len(data), 'results': data})

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'active': qs.filter(is_active=True).count(),
            'with_devices': qs.filter(devices__isnull=False).distinct().count(),
        })
