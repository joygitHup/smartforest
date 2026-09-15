"""
逻辑租户：按组织树划定数据视野。

- 用户所属组织及其全部下级 = 可见范围（「本局世界」）
- 无组织且非系统管理员 → 空视野
- 系统管理员（超管/staff/role=admin 且无组织限制需要）→ 全量
  说明：挂在指挥中心根节点下的管理员，因子树覆盖全部下属局，天然具备跨局汇总能力。
"""
from __future__ import annotations

from typing import Iterable, Optional

from django.db.models import Q, QuerySet

from .permissions import is_system_admin

ROOT_ORG_CODE = 'HQ'
ROOT_ORG_NAME = '高层指挥中心'


def get_descendant_org_ids(root_id: int, *, include_self: bool = True) -> set[int]:
    """BFS 收集组织子树 ID。"""
    from .models import Organization

    if root_id is None:
        return set()
    result: set[int] = {root_id} if include_self else set()
    frontier = [root_id]
    while frontier:
        children = list(
            Organization.objects.filter(parent_id__in=frontier).values_list('id', flat=True)
        )
        frontier = [cid for cid in children if cid not in result]
        result.update(frontier)
    return result


def ensure_root_organization():
    """确保存在租户根（指挥中心）。"""
    from .models import Organization

    root, _ = Organization.objects.get_or_create(
        code=ROOT_ORG_CODE,
        defaults={
            'name': ROOT_ORG_NAME,
            'org_type': 'group',
            'region': '',
            'description': '系统默认租户根，下属林业局挂在此节点下',
            'sort_order': 0,
            'is_active': True,
        },
    )
    # 将其它无父组织挂到指挥中心下，避免多根并列导致「看不见」
    Organization.objects.filter(parent__isnull=True).exclude(pk=root.pk).update(parent=root)
    return root


def is_unrestricted_viewer(user) -> bool:
    """
    可跨全部组织查看。
    仅超管，或未挂组织的 staff（平台运维）。
    挂在某林业局的 role=admin 不算全平台，只看本局子树。
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    if getattr(user, 'is_staff', False) and not getattr(user, 'organization_id', None):
        return True
    return False


def get_user_org_scope_ids(user) -> Optional[set[int]]:
    """
    返回当前用户可见的 organization_id 集合。
    None 表示不限制（全量）；空 set 表示无数据可见。
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return set()
    if is_unrestricted_viewer(user):
        return None
    org_id = getattr(user, 'organization_id', None)
    if not org_id:
        # 兼容：无组织的 role=admin 视为平台管理员（历史账号）
        if is_system_admin(user):
            return None
        return set()
    return get_descendant_org_ids(org_id, include_self=True)


def org_in_scope(user, organization_id: Optional[int]) -> bool:
    scope = get_user_org_scope_ids(user)
    if scope is None:
        return True
    if organization_id is None:
        return False
    return organization_id in scope


def filter_by_org_scope(
    queryset: QuerySet,
    user,
    *,
    field: str = 'organization_id',
) -> QuerySet:
    """按组织视野过滤 QuerySet。field 支持 organization_id / device__organization_id 等。"""
    scope = get_user_org_scope_ids(user)
    if scope is None:
        return queryset
    if not scope:
        return queryset.none()
    return queryset.filter(**{f'{field}__in': scope})


def filter_roles_for_user(queryset: QuerySet, user) -> QuerySet:
    """
    角色可见范围：
    - 平台管理员（unrestricted）：全部
    - 下属单位：系统内置角色（is_system）+ 本组织子树内自建角色
    - 平级单位互不可见各自新建的角色（因子树不包含兄弟节点）
    """
    scope = get_user_org_scope_ids(user)
    if scope is None:
        return queryset
    if not scope:
        # 无组织视野时仍可看系统默认角色，便于登录后基础配置展示
        return queryset.filter(is_system=True)
    return queryset.filter(Q(is_system=True) | Q(organization_id__in=scope))


def role_visible_to_user(user, role) -> bool:
    """判断某角色是否对当前用户可见/可分配。"""
    if not role:
        return False
    scope = get_user_org_scope_ids(user)
    if scope is None:
        return True
    if getattr(role, 'is_system', False):
        return True
    org_id = getattr(role, 'organization_id', None)
    return bool(org_id and org_id in scope)


def filter_alert_rules_for_user(queryset: QuerySet, user) -> QuerySet:
    """
    告警规则可见范围（与角色一致）：
    - 平台管理员：全部
    - 下属单位：系统默认规则 + 本组织子树自建规则
    - 平级单位互不可见各自新建的规则
    """
    scope = get_user_org_scope_ids(user)
    if scope is None:
        return queryset
    if not scope:
        return queryset.filter(is_system=True)
    return queryset.filter(Q(is_system=True) | Q(organization_id__in=scope))


def filter_alerts_for_user(queryset: QuerySet, user) -> QuerySet:
    """
    告警可见范围：
    - 优先 Alert.organization_id
    - 兼容历史脏数据：organization 为空时回退 device.organization_id
    """
    scope = get_user_org_scope_ids(user)
    if scope is None:
        return queryset
    if not scope:
        return queryset.none()
    return queryset.filter(
        Q(organization_id__in=scope)
        | Q(organization_id__isnull=True, device__organization_id__in=scope)
    )


def filter_alert_related_for_user(
    queryset: QuerySet,
    user,
    *,
    alert_field: str = 'alert',
) -> QuerySet:
    """告警关联资源（处置记录/溯源等）按告警组织视野过滤，兼容空 organization。"""
    scope = get_user_org_scope_ids(user)
    if scope is None:
        return queryset
    if not scope:
        return queryset.none()
    return queryset.filter(
        Q(**{f'{alert_field}__organization_id__in': scope})
        | Q(
            **{
                f'{alert_field}__organization_id__isnull': True,
                f'{alert_field}__device__organization_id__in': scope,
            }
        )
    )


def filter_work_orders_for_user(queryset: QuerySet, user) -> QuerySet:
    """
    工单可见范围：
    - 优先 WorkOrder.organization_id
    - 兼容空组织：回退 alert.organization / alert.device.organization
    """
    scope = get_user_org_scope_ids(user)
    if scope is None:
        return queryset
    if not scope:
        return queryset.none()
    return queryset.filter(
        Q(organization_id__in=scope)
        | Q(organization_id__isnull=True, alert__organization_id__in=scope)
        | Q(
            organization_id__isnull=True,
            alert__organization_id__isnull=True,
            alert__device__organization_id__in=scope,
        )
    )


def resolve_create_organization_id(user, requested_id: Optional[int] = None) -> Optional[int]:
    """
    创建资源时解析 organization_id：
    - 指定了 requested_id：必须在视野内
    - 未指定：默认用户所属组织；系统管理员无组织时落到指挥中心根
    """
    from rest_framework.exceptions import PermissionDenied, ValidationError

    scope = get_user_org_scope_ids(user)
    if requested_id is not None:
        if scope is not None and requested_id not in scope:
            raise PermissionDenied('无权将资源归属到该组织')
        return requested_id

    org_id = getattr(user, 'organization_id', None)
    if org_id:
        return org_id
    if is_unrestricted_viewer(user):
        return ensure_root_organization().id
    raise ValidationError({'organization': '当前用户未归属组织，无法创建资源'})


def assert_org_manageable(user, organization_id: Optional[int]) -> None:
    from rest_framework.exceptions import PermissionDenied

    if not org_in_scope(user, organization_id):
        raise PermissionDenied('超出本组织管理范围')


def can_manage_organization_data(user) -> bool:
    """本局管理员或系统管理员可管理组织内用户/角色/组织节点。"""
    if is_system_admin(user):
        return True
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'role', None) == 'admin':
        return True
    role_ref = getattr(user, 'role_ref', None)
    if role_ref is not None and getattr(role_ref, 'code', None) == 'admin':
        return True
    return False


def scope_payload(user) -> dict:
    """给前端的视野摘要。"""
    scope = get_user_org_scope_ids(user)
    org = getattr(user, 'organization', None)
    return {
        'unrestricted': scope is None,
        'organization_id': getattr(user, 'organization_id', None),
        'organization_name': org.name if org else None,
        'organization_code': org.code if org else None,
        'scope_org_ids': sorted(scope) if scope is not None else None,
        'scope_label': (
            '全平台'
            if scope is None
            else (org.name if org else '无组织')
        ),
    }
