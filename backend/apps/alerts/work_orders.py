"""工单创建与状态同步辅助。"""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from .models import Alert, WorkOrder, WorkOrderPriority, WorkOrderStatus
from apps.devices.models import Device

User = get_user_model()

_LEVEL_PRIORITY = {
    'level_1': WorkOrderPriority.URGENT,
    'level_2': WorkOrderPriority.HIGH,
    'level_3': WorkOrderPriority.NORMAL,
}

_LEVEL_SLA_HOURS = {
    'level_1': 2,
    'level_2': 8,
    'level_3': 24,
}


def _display_name(user) -> str:
    if not user:
        return ''
    full = f'{getattr(user, "last_name", "")}{getattr(user, "first_name", "")}'.strip()
    if full:
        return full
    return getattr(user, 'username', '') or ''


def is_system_admin(user) -> bool:
    """系统管理员：超管 / staff / role=admin。"""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return True
    if getattr(user, 'role', None) == 'admin':
        return True
    role_ref = getattr(user, 'role_ref', None)
    if role_ref is not None and getattr(role_ref, 'code', None) == 'admin':
        return True
    return False


def resolve_assignee(assignee_id=None, assigned_to: str = ''):
    """根据用户 id 或用户名解析处理人。"""
    user = None
    if assignee_id:
        user = User.objects.filter(pk=assignee_id, is_active=True).first()
    if user is None and assigned_to:
        user = User.objects.filter(username=assigned_to, is_active=True).first()
        if user is None:
            # 兼容按显示名匹配
            qs = User.objects.filter(is_active=True)
            for candidate in qs[:200]:
                if _display_name(candidate) == assigned_to:
                    user = candidate
                    break
    name = _display_name(user) if user else (assigned_to or '')
    return user, name


def generate_work_order_id(alert: Alert) -> str:
    stamp = timezone.localtime().strftime('%Y%m%d%H%M%S')
    return f'WO-{stamp}-{alert.id}'


def resolve_alert_organization_id(alert: Alert, *, heal: bool = True) -> int | None:
    """解析告警所属组织；优先 alert.organization，回退 device.organization，并可回写修复。"""
    org_id = getattr(alert, 'organization_id', None)
    if org_id is None and getattr(alert, 'device_id', None):
        device = getattr(alert, 'device', None)
        org_id = getattr(device, 'organization_id', None) if device is not None else None
        if org_id is None:
            org_id = (
                Device.objects.filter(pk=alert.device_id)
                .values_list('organization_id', flat=True)
                .first()
            )
    if heal and org_id and alert.organization_id != org_id:
        Alert.objects.filter(pk=alert.pk, organization_id__isnull=True).update(
            organization_id=org_id
        )
        alert.organization_id = org_id
    return org_id


@transaction.atomic
def create_work_order_for_alert(
    *,
    alert: Alert,
    creator=None,
    assignee=None,
    assignee_name: str = '',
    note: str = '',
    force_new: bool = False,
) -> WorkOrder:
    """为告警创建（或复用未闭环）工单。"""
    open_statuses = [
        WorkOrderStatus.PENDING,
        WorkOrderStatus.ACCEPTED,
        WorkOrderStatus.IN_PROGRESS,
    ]
    existing = (
        alert.work_orders.filter(status__in=open_statuses)
        .order_by('-created_at')
        .first()
    )
    if existing and not force_new:
        if assignee or assignee_name:
            existing.assignee = assignee
            existing.assignee_name = assignee_name or existing.assignee_name
            existing.save(update_fields=['assignee', 'assignee_name', 'updated_at'])
        # 顺带修复空组织
        org_id = resolve_alert_organization_id(alert, heal=True)
        if org_id and existing.organization_id is None:
            existing.organization_id = org_id
            existing.save(update_fields=['organization_id', 'updated_at'])
        return existing

    now = timezone.now()
    sla_hours = _LEVEL_SLA_HOURS.get(alert.alert_level, 24)
    org_id = resolve_alert_organization_id(alert, heal=True)
    work_order = WorkOrder.objects.create(
        work_order_id=generate_work_order_id(alert),
        alert=alert,
        organization_id=org_id,
        title=alert.title or f'处置工单-{alert.alert_id}',
        description=note or alert.description or f'告警 {alert.alert_id} 派单处置',
        priority=_LEVEL_PRIORITY.get(alert.alert_level, WorkOrderPriority.NORMAL),
        status=WorkOrderStatus.PENDING,
        assignee=assignee,
        assignee_name=assignee_name or _display_name(assignee),
        creator=creator if getattr(creator, 'is_authenticated', False) else None,
        creator_name=_display_name(creator) if getattr(creator, 'is_authenticated', False) else 'system',
        region=alert.region or '',
        forest_zone=alert.forest_zone or '',
        due_at=now + timedelta(hours=sla_hours),
    )
    return work_order


def sync_work_orders_on_alert_status(alert: Alert, note: str = '') -> None:
    """按告警状态同步未闭环工单。"""
    open_qs = alert.work_orders.exclude(
        status__in=[
            WorkOrderStatus.COMPLETED,
            WorkOrderStatus.CANCELLED,
            WorkOrderStatus.REJECTED,
        ]
    )
    now = timezone.now()
    if alert.status == 'processing':
        for wo in open_qs:
            updates = []
            if wo.status == WorkOrderStatus.PENDING:
                wo.status = WorkOrderStatus.IN_PROGRESS
                wo.accepted_at = wo.accepted_at or now
                updates.extend(['status', 'accepted_at'])
            elif wo.status == WorkOrderStatus.ACCEPTED:
                wo.status = WorkOrderStatus.IN_PROGRESS
                updates.append('status')
            if not wo.started_at:
                wo.started_at = now
                updates.append('started_at')
            if updates:
                updates.append('updated_at')
                wo.save(update_fields=updates)
    elif alert.status in ('resolved', 'false_alarm'):
        for wo in open_qs:
            wo.status = WorkOrderStatus.COMPLETED
            wo.completed_at = now
            if note:
                wo.result_note = note
            elif alert.status == 'false_alarm':
                wo.result_note = wo.result_note or '告警标记为误报'
            wo.save(update_fields=['status', 'completed_at', 'result_note', 'updated_at'])
