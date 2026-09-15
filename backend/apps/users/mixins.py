"""组织数据视野 Mixin。"""
from __future__ import annotations

from rest_framework.exceptions import PermissionDenied, ValidationError

from .org_scope import (
    assert_org_manageable,
    can_manage_organization_data,
    filter_by_org_scope,
    org_in_scope,
    resolve_create_organization_id,
)
from .permissions import is_system_admin


class OrgScopedQuerysetMixin:
    """
    ViewSet 混入：列表/详情强制组织过滤；创建时写入 organization。
    子类可覆盖：
      org_scope_field = 'organization_id'
      org_assign_on_create = True
    """

    org_scope_field = 'organization_id'
    org_assign_on_create = True

    def get_queryset(self):
        qs = super().get_queryset()
        return filter_by_org_scope(qs, self.request.user, field=self.org_scope_field)

    def perform_create(self, serializer):
        if not self.org_assign_on_create:
            return super().perform_create(serializer)

        model = serializer.Meta.model
        has_org = any(f.name == 'organization' for f in model._meta.get_fields())
        if not has_org:
            return super().perform_create(serializer)

        requested = serializer.validated_data.get('organization')
        requested_id = requested.pk if requested is not None else self.request.data.get('organization_id')
        if requested_id is not None:
            try:
                requested_id = int(requested_id)
            except (TypeError, ValueError) as exc:
                raise ValidationError({'organization_id': '无效的组织 ID'}) from exc

        org_id = resolve_create_organization_id(self.request.user, requested_id)
        # 避免 validated_data 中的 organization 与 organization_id 冲突
        serializer.validated_data.pop('organization', None)
        serializer.save(organization_id=org_id)

    def perform_update(self, serializer):
        instance = serializer.instance
        org_id = getattr(instance, 'organization_id', None)
        if org_id is not None and not org_in_scope(self.request.user, org_id):
            raise PermissionDenied('无权修改该组织下的资源')
        # 禁止把资源挪出视野
        new_org = serializer.validated_data.get('organization', None)
        if new_org is not None and not org_in_scope(self.request.user, new_org.pk):
            raise PermissionDenied('无权将资源归属到该组织')
        return super().perform_update(serializer)


class OrgManagerPermissionMixin:
    """写操作要求本局管理员或系统管理员。"""

    org_manager_write_actions = (
        'create', 'update', 'partial_update', 'destroy',
        'batch_delete', 'change_role',
    )

    def get_permissions(self):
        perms = super().get_permissions()
        if getattr(self, 'action', None) in self.org_manager_write_actions:
            from rest_framework.permissions import BasePermission

            class _OrgManager(BasePermission):
                message = '仅本局管理员或系统管理员可操作'

                def has_permission(self, request, view):
                    return can_manage_organization_data(request.user)

            return [_OrgManager()]
        return perms
