# apps/users/duty_views.py
"""值班排班 API。"""
from __future__ import annotations

from datetime import date, timedelta

from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.filters import (
    ASGICompatibleDjangoFilterBackend,
    ASGICompatibleOrderingFilter,
    ASGICompatibleSearchFilter,
)

from .duty_roster import (
    DUTY_MODE_CHOICES,
    ensure_duty_settings,
    get_on_duty_summary,
    list_assignments,
    sync_shifts_for_mode,
    upsert_assignment,
)
from .models import DutyGroup, DutyShiftSlot
from .org_scope import (
    can_manage_organization_data,
    filter_by_org_scope,
    is_unrestricted_viewer,
    org_in_scope,
    resolve_create_organization_id,
)
from .serializers import (
    DutyAssignmentSerializer,
    DutyGroupSerializer,
    DutyRosterSettingsSerializer,
    DutyShiftSlotSerializer,
)


def _resolve_org_id(request, preferred: int | None = None) -> int:
    if preferred is not None:
        if not org_in_scope(request.user, preferred):
            raise PermissionDenied('无权访问该组织排班')
        return preferred
    user_org = getattr(request.user, 'organization_id', None)
    if user_org:
        return user_org
    if is_unrestricted_viewer(request.user):
        from .org_scope import ensure_root_organization
        return ensure_root_organization().id
    raise ValidationError({'organization_id': '当前用户未归属组织'})


class DutyGroupViewSet(viewsets.ModelViewSet):
    queryset = DutyGroup.objects.select_related('organization').prefetch_related('members').all()
    serializer_class = DutyGroupSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['sort_order', 'id', 'name']
    ordering = ['sort_order', 'id']

    def get_queryset(self):
        qs = filter_by_org_scope(self.queryset, self.request.user)
        org_id = self.request.query_params.get('organization_id')
        if org_id:
            try:
                oid = int(org_id)
            except (TypeError, ValueError):
                return qs.none()
            if not org_in_scope(self.request.user, oid):
                return qs.none()
            qs = qs.filter(organization_id=oid)
        return qs

    def perform_create(self, serializer):
        if not can_manage_organization_data(self.request.user):
            raise PermissionDenied('仅本局管理员可管理值班组')
        requested = serializer.validated_data.get('organization')
        requested_id = requested.pk if requested is not None else self.request.data.get('organization_id')
        if requested_id is not None:
            requested_id = int(requested_id)
        org_id = resolve_create_organization_id(self.request.user, requested_id)
        serializer.validated_data.pop('organization', None)
        members = serializer.validated_data.pop('members', None)
        group = serializer.save(organization_id=org_id)
        if members is not None:
            group.members.set(members)

    def perform_update(self, serializer):
        if not can_manage_organization_data(self.request.user):
            raise PermissionDenied('仅本局管理员可管理值班组')
        instance = self.get_object()
        if not org_in_scope(self.request.user, instance.organization_id):
            raise PermissionDenied('超出本组织管理范围')
        members = serializer.validated_data.pop('members', None)
        group = serializer.save()
        if members is not None:
            group.members.set(members)

    def perform_destroy(self, instance):
        if not can_manage_organization_data(self.request.user):
            raise PermissionDenied('仅本局管理员可管理值班组')
        if not org_in_scope(self.request.user, instance.organization_id):
            raise PermissionDenied('超出本组织管理范围')
        instance.delete()


class DutyShiftSlotViewSet(viewsets.ModelViewSet):
    """自定义模式下可维护班次；预设模式只读。"""
    queryset = DutyShiftSlot.objects.select_related('organization').all()
    serializer_class = DutyShiftSlotSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
    ordering = ['sort_order', 'id']

    def get_queryset(self):
        qs = filter_by_org_scope(
            self.queryset.filter(is_active=True), self.request.user
        )
        org_id = self.request.query_params.get('organization_id')
        if org_id:
            try:
                oid = int(org_id)
            except (TypeError, ValueError):
                return qs.none()
            if not org_in_scope(self.request.user, oid):
                return qs.none()
            qs = qs.filter(organization_id=oid)
        return qs

    def _assert_custom_mode(self, org_id: int):
        settings = ensure_duty_settings(org_id)
        if settings.duty_mode != 'custom' and self.action in (
            'create', 'update', 'partial_update', 'destroy',
        ):
            raise ValidationError({'duty_mode': '仅自定义模式下可编辑班次，请先切换排班模式'})

    def perform_create(self, serializer):
        if not can_manage_organization_data(self.request.user):
            raise PermissionDenied('仅本局管理员可管理班次')
        requested = serializer.validated_data.get('organization')
        requested_id = requested.pk if requested is not None else self.request.data.get('organization_id')
        if requested_id is not None:
            requested_id = int(requested_id)
        org_id = resolve_create_organization_id(self.request.user, requested_id)
        self._assert_custom_mode(org_id)
        serializer.validated_data.pop('organization', None)
        serializer.save(organization_id=org_id, is_active=True)

    def perform_update(self, serializer):
        if not can_manage_organization_data(self.request.user):
            raise PermissionDenied('仅本局管理员可管理班次')
        instance = self.get_object()
        self._assert_custom_mode(instance.organization_id)
        serializer.save()

    def perform_destroy(self, instance):
        if not can_manage_organization_data(self.request.user):
            raise PermissionDenied('仅本局管理员可管理班次')
        self._assert_custom_mode(instance.organization_id)
        instance.is_active = False
        instance.save(update_fields=['is_active'])


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def duty_roster_settings(request):
    """获取/更新本组织排班模式。"""
    org_param = request.query_params.get('organization_id') or request.data.get('organization_id')
    preferred = int(org_param) if org_param not in (None, '') else None
    org_id = _resolve_org_id(request, preferred)
    settings = ensure_duty_settings(org_id)

    if request.method == 'GET':
        shifts = DutyShiftSlot.objects.filter(organization_id=org_id, is_active=True).order_by(
            'sort_order', 'id'
        )
        return Response({
            'settings': DutyRosterSettingsSerializer(settings).data,
            'shifts': DutyShiftSlotSerializer(shifts, many=True).data,
            'duty_mode_choices': [
                {'value': v, 'label': l} for v, l in DUTY_MODE_CHOICES
            ],
            'current': get_on_duty_summary(org_id),
        })

    if not can_manage_organization_data(request.user):
        raise PermissionDenied('仅本局管理员可修改排班模式')

    mode = request.data.get('duty_mode')
    if mode not in dict(DUTY_MODE_CHOICES):
        raise ValidationError({'duty_mode': '无效的排班模式'})
    settings.duty_mode = mode
    settings.save(update_fields=['duty_mode', 'updated_at'])
    sync_shifts_for_mode(org_id, mode)
    shifts = DutyShiftSlot.objects.filter(organization_id=org_id, is_active=True).order_by(
        'sort_order', 'id'
    )
    return Response({
        'settings': DutyRosterSettingsSerializer(settings).data,
        'shifts': DutyShiftSlotSerializer(shifts, many=True).data,
        'current': get_on_duty_summary(org_id),
        'message': '排班模式已更新',
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def duty_roster_current(request):
    org_param = request.query_params.get('organization_id')
    preferred = int(org_param) if org_param not in (None, '') else None
    org_id = _resolve_org_id(request, preferred)
    ensure_duty_settings(org_id)
    return Response(get_on_duty_summary(org_id))


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def duty_assignments(request):
    """按日期查询/写入排班。"""
    org_param = request.query_params.get('organization_id') or request.data.get('organization_id')
    preferred = int(org_param) if org_param not in (None, '') else None
    org_id = _resolve_org_id(request, preferred)
    ensure_duty_settings(org_id)

    if request.method == 'GET':
        start_s = request.query_params.get('start')
        end_s = request.query_params.get('end')
        today = date.today()
        try:
            start = date.fromisoformat(start_s) if start_s else today
            end = date.fromisoformat(end_s) if end_s else today + timedelta(days=6)
        except ValueError as exc:
            raise ValidationError({'date': '日期格式应为 YYYY-MM-DD'}) from exc
        if end < start:
            raise ValidationError({'end': '结束日期不能早于开始日期'})
        if (end - start).days > 62:
            raise ValidationError({'end': '查询跨度不能超过 62 天'})
        return Response({
            'organization_id': org_id,
            'start': start.isoformat(),
            'end': end.isoformat(),
            'results': list_assignments(org_id, start, end),
            'current': get_on_duty_summary(org_id),
        })

    if not can_manage_organization_data(request.user):
        raise PermissionDenied('仅本局管理员可编排值班')

    duty_date_s = request.data.get('duty_date')
    shift_id = request.data.get('shift_id')
    if not duty_date_s or not shift_id:
        raise ValidationError({'duty_date': 'duty_date 与 shift_id 必填'})
    try:
        duty_date = date.fromisoformat(str(duty_date_s))
        shift_id = int(shift_id)
    except (TypeError, ValueError) as exc:
        raise ValidationError({'duty_date': '参数格式无效'}) from exc

    group_id = request.data.get('group_id')
    if group_id in ('', None):
        group_id = None
    else:
        group_id = int(group_id)

    user_ids = request.data.get('user_ids') or []
    if not isinstance(user_ids, list):
        raise ValidationError({'user_ids': '须为数组'})
    try:
        user_ids = [int(x) for x in user_ids]
    except (TypeError, ValueError) as exc:
        raise ValidationError({'user_ids': '用户 ID 无效'}) from exc

    # 用户须在组织视野内
    from django.contrib.auth import get_user_model
    User = get_user_model()
    scoped_ids = set(
        filter_by_org_scope(User.objects.filter(id__in=user_ids), request.user).values_list(
            'id', flat=True
        )
    )
    if set(user_ids) - scoped_ids:
        raise PermissionDenied('不可指派视野外用户值班')

    try:
        assignment = upsert_assignment(
            organization_id=org_id,
            duty_date=duty_date,
            shift_id=shift_id,
            group_id=group_id,
            user_ids=user_ids,
            remark=request.data.get('remark') or '',
        )
    except ValueError as exc:
        raise ValidationError({'detail': str(exc)}) from exc

    return Response(
        DutyAssignmentSerializer(assignment).data,
        status=status.HTTP_200_OK,
    )
