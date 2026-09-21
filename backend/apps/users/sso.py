"""第三方 SSO Token Exchange 视图（基于 integration_hub SDK，支持多中台）。

流程：
1. 第三方平台经中台跳转用户到前端 /sso/callback?token=<jwt>
2. 前端 POST 本视图 /api/sso/exchange/ {token}
3. 本视图按 token 的 iss 路由到对应中台配置（SSO_PARTNERS 字典）：
   - 单中台：走 SDK 全局 configure + verify_token
   - 多中台：按 iss 选 partner 配置，调 verify_token_local(cfg=partner) + 回调兜底
4. valid → 映射本地 User + 签发 SimpleJWT
5. invalid → 401（前端跳 /login）

多中台配置见 settings.SSO_PARTNERS（key=iss，value={platform_url, audience, app_id}）
audience 支持 str 或 list（同中台多 code 场景）
"""
from __future__ import annotations

import logging
import secrets
from typing import Any

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import ExternalIdentity, User

logger = logging.getLogger(__name__)

__all__ = ['SSOExchangeView']


def _verify_with_partner(token: str, partner: dict) -> dict | None:
    """按指定中台配置验签（不依赖 SDK 全局 configure，线程安全）。

    1. 本地 JWKS 验签（SDK verify_token_local，传 cfg）
    2. 失败回退调中台 /api/sso/validate（requests.post）
    """
    cfg = {
        'platform_url': partner['platform_url'],
        'audience': partner['audience'],
        'app_id': partner.get('app_id', ''),
        'app_secret': partner.get('app_secret', ''),
    }
    # 1. SDK 本地验签
    try:
        from integration_hub.sso.jwt_mode import verify_token_local
        payload = verify_token_local(token, cfg)
        if payload is not None:
            return payload
    except Exception as e:
        logger.warning('verify_token_local failed (iss=%s): %s',
                       partner.get('iss', ''), e)

    # 2. 回调中台 validate 兜底
    try:
        resp = requests.post(
            f"{partner['platform_url'].rstrip('/')}/api/sso/validate",
            json={'token': token, 'appId': partner.get('app_id', '')},
            timeout=10,
            headers={'Content-Type': 'application/json'},
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get('valid'):
                # 中台返回的 user dict，规整为 payload 格式
                user_info = data.get('user') or {}
                return {
                    'sub': user_info.get('id') or user_info.get('sub') or data.get('sub', ''),
                    'iss': partner.get('iss', 'integration-platform'),
                    'aud': partner['audience'],
                    'name': user_info.get('name') or data.get('name', ''),
                    'email': user_info.get('email') or data.get('email', ''),
                }
    except requests.RequestException as e:
        logger.warning('platform validate unreachable (iss=%s): %s',
                       partner.get('iss', ''), e)
    return None


class SSOExchangeView(APIView):
    """POST /api/sso/exchange/ — 第三方 token 换发本系统 SimpleJWT。

    输入：
    - Body: {"token": "<third_party_jwt>"}
    - 或 Header: Authorization: Bearer <third_party_jwt>

    返回 200: {access, refresh, user}
    错误：400 missing token / 401 invalid / 403 unknown iss / 503 unreachable
    """

    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request: Any) -> Response:
        raw_token = self._extract_token(request)
        if not raw_token:
            return Response(
                {'detail': 'missing token'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. 不验签先解 payload 拿 iss（确定走哪个中台）
        import jwt as _jwt
        try:
            unverified = _jwt.decode(raw_token, options={'verify_signature': False})
        except _jwt.PyJWTError as e:
            return Response(
                {'detail': f'token decode failed: {e}'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        iss = unverified.get('iss', '')

        # 2. 路由到对应中台配置
        partner = self._resolve_partner(iss)
        if partner is None:
            logger.warning('SSO rejected unknown issuer: %s', iss)
            return Response(
                {'detail': f'unknown issuer: {iss}'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # 3. 按中台配置验签
        try:
            payload = _verify_with_partner(raw_token, partner)
        except Exception as e:
            logger.exception('SSO verify failed: iss=%s', iss)
            return Response(
                {'detail': f'SSO verify failed: {e}'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not payload:
            logger.info('SSO token rejected (iss=%s)', iss)
            return Response(
                {'detail': 'token invalid'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # 4. 提取用户信息
        sub = payload.get('sub') or payload.get('id') or ''
        if not sub:
            return Response(
                {'detail': 'token missing sub claim'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        issuer = payload.get('iss', iss)  # 优先用 payload 自带 iss
        name = payload.get('name') or payload.get('display_name') or ''
        email = payload.get('email') or ''
        client_ip = self._get_client_ip(request)

        # 5. 映射/创建本地 User
        try:
            user = self._upsert_user(issuer, str(sub), {
                'sub': sub, 'iss': issuer, 'name': name, 'email': email,
                'raw': payload,
            })
        except Exception as e:
            logger.exception('SSO user provisioning failed: iss=%s sub=%s', issuer, sub)
            return Response(
                {'detail': f'user provisioning failed: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        logger.info(
            'SSO login success: iss=%s sub=%s user=%s ip=%s',
            issuer, sub, user.id, client_ip,
        )

        # 6. 签发本系统 SimpleJWT
        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id, 'username': user.username,
                'role': user.role, 'email': user.email,
            },
        })

    # ---------- helpers ----------

    @staticmethod
    def _resolve_partner(iss: str) -> dict | None:
        """按 iss 路由到中台配置。兼容单中台和多中台。"""
        partners: dict = getattr(settings, 'SSO_PARTNERS', {}) or {}
        if partners:
            partner = partners.get(iss)
            if partner:
                return {**partner, 'iss': iss}
            return None
        # 兼容：SSO_PARTNERS 未配时走单中台默认配置
        default_url = getattr(settings, 'SSO_PLATFORM_URL', '')
        default_aud = getattr(settings, 'SSO_AUDIENCE', '')
        if default_url and default_aud:
            return {
                'platform_url': default_url,
                'audience': default_aud,
                'app_id': getattr(settings, 'SSO_APP_ID', ''),
                'iss': iss or 'integration-platform',
            }
        return None

    @staticmethod
    def _extract_token(request: Any) -> str | None:
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if auth_header.startswith('Bearer '):
            return auth_header[7:].strip()
        body_token = request.data.get('token')
        if isinstance(body_token, str) and body_token:
            return body_token.strip()
        return None

    @staticmethod
    def _get_client_ip(request: Any) -> str:
        xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if xff:
            return xff.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', '')

    @staticmethod
    def _upsert_user(issuer: str, sub: str, payload: dict) -> User:
        """按 (issuer, sub) 找现有 ExternalIdentity → User；首次自动建号。"""
        now = timezone.now()
        existing = ExternalIdentity.objects.select_related('user').filter(
            issuer=issuer, sub=sub,
        ).first()
        if existing:
            existing.last_login = now
            existing.claims = payload
            existing.save(update_fields=['last_login', 'claims'])
            return existing.user

        email = payload.get('email') or ''
        name = payload.get('name') or ''
        user: User | None = None
        if email:
            user = User.objects.filter(email=email).first()

        with transaction.atomic():
            if user is None:
                username = email or f'sso_{issuer}_{sub[:32]}'
                if User.objects.filter(username=username).exists():
                    username = f'{username}_{secrets.token_hex(3)}'
                user = User.objects.create_user(username=username, email=email, password=None)
                user.set_unusable_password()
                user.role = getattr(settings, 'SSO_DEFAULT_ROLE', 'viewer')
                user.is_active = True
                user.must_change_password = False
                if name:
                    user.first_name = name[:30]
                user.save()
            ExternalIdentity.objects.create(
                user=user, issuer=issuer, sub=sub, claims=payload, last_login=now,
            )
        return user
