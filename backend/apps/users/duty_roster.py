# apps/users/duty_roster.py
"""
值班排班业务：按组织配置班次模式，排班到人/组，解析当前值班人员。
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Iterable, Optional

from django.db import transaction
from django.utils import timezone

DUTY_MODE_THREE = 'three_shift'
DUTY_MODE_TWO = 'two_shift'
DUTY_MODE_CUSTOM = 'custom'

DUTY_MODE_CHOICES = [
    (DUTY_MODE_THREE, '三班倒'),
    (DUTY_MODE_TWO, '两班倒'),
    (DUTY_MODE_CUSTOM, '自定义'),
]

# 预设班次：(code, name, start_hhmm, end_hhmm, sort)
SHIFT_PRESETS: dict[str, list[tuple[str, str, str, str, int]]] = {
    DUTY_MODE_THREE: [
        ('morning', '早班', '08:00', '16:00', 1),
        ('afternoon', '中班', '16:00', '00:00', 2),
        ('night', '晚班', '00:00', '08:00', 3),
    ],
    DUTY_MODE_TWO: [
        ('day', '白班', '08:00', '20:00', 1),
        ('night', '夜班', '20:00', '08:00', 2),
    ],
}


def parse_hhmm(value: str) -> time:
    parts = (value or '00:00').strip().split(':')
    h = int(parts[0]) if parts else 0
    m = int(parts[1]) if len(parts) > 1 else 0
    return time(hour=h % 24, minute=m % 60)


def shift_covers_moment(start: time, end: time, moment: time) -> bool:
    """判断 moment 是否落在 [start, end) 内；支持跨日班次。"""
    if start == end:
        return True  # 全天
    if start < end:
        return start <= moment < end
    # 跨日：如 20:00-08:00
    return moment >= start or moment < end


def ensure_duty_settings(organization_id: int):
    from .models import DutyRosterSettings

    settings, _ = DutyRosterSettings.objects.get_or_create(
        organization_id=organization_id,
        defaults={'duty_mode': DUTY_MODE_THREE},
    )
    sync_shifts_for_mode(organization_id, settings.duty_mode)
    return settings


def sync_shifts_for_mode(organization_id: int, duty_mode: str) -> None:
    """按模式同步班次模板。自定义模式不覆盖已有班次。"""
    from .models import DutyShiftSlot

    if duty_mode == DUTY_MODE_CUSTOM:
        if not DutyShiftSlot.objects.filter(organization_id=organization_id, is_active=True).exists():
            # 自定义默认给一个全天班，避免空排班
            DutyShiftSlot.objects.create(
                organization_id=organization_id,
                code='all_day',
                name='全天',
                start_time=time(0, 0),
                end_time=time(0, 0),
                sort_order=1,
                is_active=True,
            )
        return

    presets = SHIFT_PRESETS.get(duty_mode) or SHIFT_PRESETS[DUTY_MODE_THREE]
    keep_codes = {p[0] for p in presets}
    with transaction.atomic():
        for code, name, start_s, end_s, sort_order in presets:
            DutyShiftSlot.objects.update_or_create(
                organization_id=organization_id,
                code=code,
                defaults={
                    'name': name,
                    'start_time': parse_hhmm(start_s),
                    'end_time': parse_hhmm(end_s),
                    'sort_order': sort_order,
                    'is_active': True,
                },
            )
        DutyShiftSlot.objects.filter(organization_id=organization_id).exclude(
            code__in=keep_codes
        ).update(is_active=False)


def resolve_current_shift(organization_id: int, at: Optional[datetime] = None):
    from .models import DutyShiftSlot

    now = at or timezone.localtime()
    moment = now.time().replace(second=0, microsecond=0)
    slots = list(
        DutyShiftSlot.objects.filter(organization_id=organization_id, is_active=True).order_by(
            'sort_order', 'id'
        )
    )
    for slot in slots:
        if shift_covers_moment(slot.start_time, slot.end_time, moment):
            return slot, now.date() if not (
                slot.start_time > slot.end_time and moment < slot.end_time
            ) else (now.date() - timedelta(days=1))
    return None, now.date()


def assignment_duty_date(slot, at: datetime) -> date:
    """跨日班次在凌晨归属到前一日排班日期。"""
    local = timezone.localtime(at)
    if slot and slot.start_time > slot.end_time and local.time() < slot.end_time:
        return local.date() - timedelta(days=1)
    return local.date()


def get_on_duty_users(organization_id: int, at: Optional[datetime] = None):
    """返回当前时刻值班用户 QuerySet（按组织）。"""
    from django.contrib.auth import get_user_model
    from .models import DutyAssignment

    User = get_user_model()
    now = at or timezone.localtime()
    slot, _ = resolve_current_shift(organization_id, now)
    if not slot:
        return User.objects.none()

    duty_date = assignment_duty_date(slot, now)
    assignment = (
        DutyAssignment.objects.filter(
            organization_id=organization_id,
            duty_date=duty_date,
            shift_id=slot.id,
        )
        .prefetch_related('users', 'group__members')
        .first()
    )
    if not assignment:
        return User.objects.none()

    user_ids: set[int] = set(assignment.users.values_list('id', flat=True))
    if assignment.group_id:
        user_ids.update(assignment.group.members.values_list('id', flat=True))
    if not user_ids:
        return User.objects.none()
    return User.objects.filter(id__in=user_ids, is_active=True)


def get_on_duty_summary(organization_id: int, at: Optional[datetime] = None) -> dict:
    now = at or timezone.localtime()
    ensure_duty_settings(organization_id)
    slot, _ = resolve_current_shift(organization_id, now)
    duty_date = assignment_duty_date(slot, now) if slot else now.date()
    users = list(get_on_duty_users(organization_id, now))
    members = [
        {
            'id': u.id,
            'username': u.username,
            'full_name': (f'{u.last_name or ""}{u.first_name or ""}'.strip() or u.username),
            'phone': getattr(u, 'phone', '') or '',
        }
        for u in users
    ]
    group_name = ''
    from .models import DutyAssignment

    if slot:
        assignment = DutyAssignment.objects.filter(
            organization_id=organization_id,
            duty_date=duty_date,
            shift_id=slot.id,
        ).select_related('group').first()
        if assignment and assignment.group_id:
            group_name = assignment.group.name

    return {
        'organization_id': organization_id,
        'duty_date': duty_date.isoformat(),
        'now': now.isoformat(),
        'shift': (
            {
                'id': slot.id,
                'code': slot.code,
                'name': slot.name,
                'start_time': slot.start_time.strftime('%H:%M'),
                'end_time': slot.end_time.strftime('%H:%M'),
            }
            if slot
            else None
        ),
        'group_name': group_name,
        'members': members,
        'label': _format_duty_label(group_name, members, slot),
    }


def _format_duty_label(group_name: str, members: list[dict], slot) -> str:
    names = [m['full_name'] for m in members]
    people = '、'.join(names) if names else '未排班'
    shift_name = slot.name if slot else '未知班次'
    if group_name:
        return f'{group_name} · {shift_name}（{people}）'
    return f'{shift_name}（{people}）'


def list_assignments(organization_id: int, start: date, end: date) -> list:
    from .models import DutyAssignment

    qs = (
        DutyAssignment.objects.filter(
            organization_id=organization_id,
            duty_date__gte=start,
            duty_date__lte=end,
        )
        .select_related('shift', 'group')
        .prefetch_related('users', 'group__members')
        .order_by('duty_date', 'shift__sort_order')
    )
    result = []
    for a in qs:
        members = list(a.users.all())
        if a.group_id:
            # 展示合并
            seen = {u.id for u in members}
            for u in a.group.members.all():
                if u.id not in seen:
                    members.append(u)
        result.append({
            'id': a.id,
            'duty_date': a.duty_date.isoformat(),
            'shift_id': a.shift_id,
            'shift_name': a.shift.name if a.shift_id else '',
            'shift_code': a.shift.code if a.shift_id else '',
            'group_id': a.group_id,
            'group_name': a.group.name if a.group_id else '',
            'user_ids': [u.id for u in members],
            'members': [
                {
                    'id': u.id,
                    'username': u.username,
                    'full_name': (f'{u.last_name or ""}{u.first_name or ""}'.strip() or u.username),
                    'phone': getattr(u, 'phone', '') or '',
                }
                for u in members
            ],
            'remark': a.remark,
        })
    return result


def upsert_assignment(
    *,
    organization_id: int,
    duty_date: date,
    shift_id: int,
    group_id: Optional[int] = None,
    user_ids: Optional[Iterable[int]] = None,
    remark: str = '',
):
    from .models import DutyAssignment, DutyGroup, DutyShiftSlot

    slot = DutyShiftSlot.objects.filter(
        id=shift_id, organization_id=organization_id, is_active=True
    ).first()
    if not slot:
        raise ValueError('班次不存在或不属于本组织')

    group = None
    if group_id:
        group = DutyGroup.objects.filter(
            id=group_id, organization_id=organization_id, is_active=True
        ).first()
        if not group:
            raise ValueError('值班组不存在或不属于本组织')

    assignment, _ = DutyAssignment.objects.update_or_create(
        organization_id=organization_id,
        duty_date=duty_date,
        shift=slot,
        defaults={
            'group': group,
            'remark': remark or '',
        },
    )
    ids = list(user_ids or [])
    if ids:
        assignment.users.set(ids)
    elif not group_id:
        assignment.users.clear()
    else:
        # 仅用组时清空散点人员，展示走组成员
        assignment.users.clear()
    return assignment
