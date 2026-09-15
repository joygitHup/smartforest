"""系统设置 API：平台级名称 + 组织级其它配置。"""
from __future__ import annotations

from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import OrganizationSettings, PlatformSettings
from .org_scope import (
    can_manage_organization_data,
    is_unrestricted_viewer,
    org_in_scope,
)
from core.perf_cache import (
    ORG_SETTINGS_KEY,
    ORG_SETTINGS_TTL,
    PLATFORM_SETTINGS_KEY,
    PLATFORM_SETTINGS_TTL,
    cache_get,
    cache_set,
    invalidate_org_settings,
    invalidate_platform_settings,
)


def _resolve_org_id(request, preferred: int | None = None) -> int:
    if preferred is not None:
        if not org_in_scope(request.user, preferred):
            raise PermissionDenied('无权访问该组织设置')
        return preferred
    user_org = getattr(request.user, 'organization_id', None)
    if user_org:
        return user_org
    if is_unrestricted_viewer(request.user):
        from .org_scope import ensure_root_organization

        return ensure_root_organization().id
    raise ValidationError({'organization_id': '当前用户未归属组织'})


def _org_settings_payload(obj: OrganizationSettings, *, can_edit: bool) -> dict:
    return {
        'organization_id': obj.organization_id,
        'refresh_interval': obj.refresh_interval,
        'default_map_layer': obj.default_map_layer,
        'coordinate_system': obj.coordinate_system,
        'video_capture': obj.video_capture,
        'sensor_interval': obj.sensor_interval,
        'video_codec': obj.video_codec,
        'offline_cache_days': obj.offline_cache_days,
        'resume_upload': obj.resume_upload,
        'notify_in_app': obj.notify_in_app,
        'notify_app_push': obj.notify_app_push,
        'notify_sms': obj.notify_sms,
        'notify_voice_call': obj.notify_voice_call,
        'notify_forestry_line': obj.notify_forestry_line,
        'duty_mode_label': obj.duty_mode_label,
        'data_retention': obj.data_retention,
        'video_storage': obj.video_storage,
        'can_edit': can_edit,
        'updated_at': obj.updated_at.isoformat() if obj.updated_at else None,
    }


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def platform_settings(request):
    """
    GET/PATCH /api/users/platform-settings/
    系统平台名称：全平台生效；仅平台管理员可修改。
    """
    can_edit = is_unrestricted_viewer(request.user)

    if request.method == 'GET':
        cached = cache_get(PLATFORM_SETTINGS_KEY)
        if cached is not None:
            return Response({**cached, 'can_edit': can_edit})
        solo = PlatformSettings.get_solo()
        payload = {
            'platform_name': solo.platform_name,
            'can_edit': can_edit,
            'updated_at': solo.updated_at.isoformat() if solo.updated_at else None,
        }
        cache_set(
            PLATFORM_SETTINGS_KEY,
            {
                'platform_name': payload['platform_name'],
                'updated_at': payload['updated_at'],
            },
            PLATFORM_SETTINGS_TTL,
        )
        return Response(payload)

    if not can_edit:
        raise PermissionDenied('仅平台管理员可修改系统平台名称')

    solo = PlatformSettings.get_solo()
    name = request.data.get('platform_name', None)
    if name is None:
        raise ValidationError({'platform_name': '必填'})
    name = str(name).strip()
    if not name:
        raise ValidationError({'platform_name': '不能为空'})
    if len(name) > 128:
        raise ValidationError({'platform_name': '长度不能超过 128'})

    solo.platform_name = name
    solo.save(update_fields=['platform_name', 'updated_at'])
    invalidate_platform_settings()
    return Response(
        {
            'platform_name': solo.platform_name,
            'can_edit': True,
            'updated_at': solo.updated_at.isoformat() if solo.updated_at else None,
        }
    )


_ORG_FIELD_MAP = {
    'refresh_interval': 'refresh_interval',
    'default_map_layer': 'default_map_layer',
    'coordinate_system': 'coordinate_system',
    'video_capture': 'video_capture',
    'sensor_interval': 'sensor_interval',
    'video_codec': 'video_codec',
    'offline_cache_days': 'offline_cache_days',
    'resume_upload': 'resume_upload',
    'notify_in_app': 'notify_in_app',
    'notify_app_push': 'notify_app_push',
    'notify_sms': 'notify_sms',
    'notify_voice_call': 'notify_voice_call',
    'notify_forestry_line': 'notify_forestry_line',
    'duty_mode_label': 'duty_mode_label',
    'data_retention': 'data_retention',
    'video_storage': 'video_storage',
}


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def organization_settings(request):
    """
    GET/PATCH /api/users/organization-settings/
    组织级设置：仅对本组织生效。
    """
    preferred = request.query_params.get('organization_id') or request.data.get('organization_id')
    preferred_id = None
    if preferred is not None and preferred != '':
        try:
            preferred_id = int(preferred)
        except (TypeError, ValueError) as exc:
            raise ValidationError({'organization_id': '无效'}) from exc

    org_id = _resolve_org_id(request, preferred_id)
    # 本组织登录用户可改本组织设置；平台管理员也可代管
    can_edit = can_manage_organization_data(request.user) or (
        getattr(request.user, 'organization_id', None) == org_id
    )

    if request.method == 'GET':
        cache_key = ORG_SETTINGS_KEY.format(org_id=org_id)
        cached = cache_get(cache_key)
        if cached is not None:
            from .collection_policy import build_collection_config_params

            return Response({
                **cached,
                'can_edit': can_edit,
                'collection_effect': build_collection_config_params(cached),
            })
        obj = OrganizationSettings.get_or_create_for_org(org_id)
        payload = _org_settings_payload(obj, can_edit=can_edit)
        cache_set(
            cache_key,
            {k: v for k, v in payload.items() if k != 'can_edit'},
            ORG_SETTINGS_TTL,
        )
        from .collection_policy import build_collection_config_params

        payload['collection_effect'] = build_collection_config_params(payload)
        return Response(payload)

    obj = OrganizationSettings.get_or_create_for_org(org_id)
    if not can_edit:
        raise PermissionDenied('无权修改该组织设置')

    updated_fields: list[str] = []
    for api_key, model_field in _ORG_FIELD_MAP.items():
        if api_key not in request.data:
            continue
        value = request.data.get(api_key)
        if model_field in {
            'resume_upload',
            'notify_in_app',
            'notify_app_push',
            'notify_sms',
            'notify_voice_call',
            'notify_forestry_line',
        }:
            if not isinstance(value, bool):
                raise ValidationError({api_key: '须为布尔值'})
            setattr(obj, model_field, value)
        else:
            text = str(value).strip() if value is not None else ''
            if not text:
                raise ValidationError({api_key: '不能为空'})
            setattr(obj, model_field, text[:128])
        updated_fields.append(model_field)

    if updated_fields:
        updated_fields.append('updated_at')
        obj.save(update_fields=updated_fields)
        invalidate_org_settings(org_id)

        collection_keys = {
            'video_capture',
            'sensor_interval',
            'video_codec',
            'offline_cache_days',
            'resume_upload',
            'coordinate_system',
        }
        if collection_keys.intersection(updated_fields):
            try:
                from .tasks import push_org_collection_config

                push_org_collection_config.delay(
                    org_id,
                    getattr(request.user, 'id', None),
                )
            except Exception:
                # Celery 不可用时仍保存设置；MQTT 入口会按缓存策略削峰
                pass

    payload = _org_settings_payload(obj, can_edit=True)
    # 附带解析后的生效秒数，便于前端展示
    from .collection_policy import build_collection_config_params

    payload['collection_effect'] = build_collection_config_params(
        {k: v for k, v in payload.items()}
    )
    return Response(payload)
