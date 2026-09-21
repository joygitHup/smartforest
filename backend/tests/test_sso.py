"""SSO Token Exchange 端到端测试（多中台 + 同中台多 code）。

覆盖场景：
  1. 单中台默认配置（SSO_PARTNERS 为空）
  2. 多中台按 iss 路由（SSO_PARTNERS 非空）
  3. 同中台多 code（audience 为 list）
  4. 未知 iss → 403
  5. verify_token_local 返回 None → 401
  6. 缺 token → 400
  7. 不同 iss 独立映射
  8. Bearer Header 方式

运行：python tests/test_sso.py
"""
import os
import sys
from unittest.mock import patch

import jwt as _jwt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from django.test import override_settings, Client
from django.test.utils import setup_test_environment, teardown_test_environment
from django.test.runner import DiscoverRunner

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django  # noqa: E402
django.setup()

SUB = 'user_zhang_001'


def _payload(iss='integration-platform', aud='app_mu6b9ioz', sub=SUB, **extra):
    base = {
        'sub': sub, 'iss': iss, 'aud': aud,
        'name': '张工', 'email': 'zhang@test.gov.cn',
    }
    base.update(extra)
    return base


def _jwt_token(payload=None):
    """生成 JWT 格式 token（假签名，仅用于 unverified decode 拿 iss）。"""
    p = payload or _payload()
    return _jwt.encode(p, 'fake_secret', algorithm='HS256')


# 多中台配置（测试用）
MULTI_PARTNERS = {
    'integration-platform': {
        'platform_url': 'http://127.0.0.1:8000',
        'audience': ['app_mu6b9ioz', 'app_fire_cmd'],  # 同中台多 code
        'app_id': 'app_001',
    },
    'provincial-emergency': {
        'platform_url': 'http://provincial-hub:8000',
        'audience': 'app_prov_smartforest',
        'app_id': 'app_prov_002',
    },
}


def run_tests():
    client = Client()

    # ========== A. 单中台默认配置（SSO_PARTNERS 为空）==========
    # 1. 首次登录
    with patch('apps.users.sso._verify_with_partner', return_value=_payload()):
        resp = client.post('/api/sso/exchange/',
                           data={'token': _jwt_token()}, content_type='application/json')
    assert resp.status_code == 200, f'首次登录失败: {resp.status_code} {resp.json()}'
    body = resp.json()
    assert body['user']['username'] == 'zhang@test.gov.cn'
    assert body['user']['role'] == 'viewer'
    print(f'[PASS] 1. 单中台默认配置 - 首次登录 (user_id={body["user"]["id"]})')

    # 2. 二次登录复用账号
    from apps.users.models import ExternalIdentity, User
    ext_before = ExternalIdentity.objects.filter(issuer='integration-platform', sub=SUB).count()
    with patch('apps.users.sso._verify_with_partner', return_value=_payload()):
        resp2 = client.post('/api/sso/exchange/',
                            data={'token': _jwt_token()}, content_type='application/json')
    assert resp2.status_code == 200
    assert resp2.json()['user']['id'] == body['user']['id']
    ext_after = ExternalIdentity.objects.filter(issuer='integration-platform', sub=SUB).count()
    assert ext_after == ext_before, '不应重复建 ExternalIdentity'
    print('[PASS] 2. 单中台默认配置 - 二次登录复用账号')

    # 3. Bearer Header 方式
    with patch('apps.users.sso._verify_with_partner',
               return_value=_payload(sub='user_li_002', email='li@test.gov.cn', name='李工')):
        resp3 = client.post('/api/sso/exchange/',
                            **{'HTTP_AUTHORIZATION': f'Bearer {_jwt_token(_payload(sub="user_li_002"))}'})
    assert resp3.status_code == 200
    assert resp3.json()['user']['username'] == 'li@test.gov.cn'
    print('[PASS] 3. Bearer Header 方式')

    # 4. verify 返回 None → 401
    with patch('apps.users.sso._verify_with_partner', return_value=None):
        resp4 = client.post('/api/sso/exchange/',
                            data={'token': _jwt_token()}, content_type='application/json')
    assert resp4.status_code == 401, f'None 应 401，实际: {resp4.status_code}'
    print('[PASS] 4. verify_token=None → 401')

    # 5. payload 缺 sub → 401
    with patch('apps.users.sso._verify_with_partner',
               return_value={'iss': 'integration-platform', 'name': '无名'}):
        resp5 = client.post('/api/sso/exchange/',
                            data={'token': _jwt_token()}, content_type='application/json')
    assert resp5.status_code == 401
    print('[PASS] 5. payload 缺 sub → 401')

    # 6. 缺 token → 400
    resp6 = client.post('/api/sso/exchange/', data={}, content_type='application/json')
    assert resp6.status_code == 400
    print('[PASS] 6. 缺少 token → 400')

    # 清理单中台测试用户
    User.objects.filter(email__in=['zhang@test.gov.cn', 'li@test.gov.cn']).delete()

    # ========== B. 多中台配置（SSO_PARTNERS 非空）==========
    with override_settings(SSO_PARTNERS=MULTI_PARTNERS):
        # 7. 多中台 - integration-platform 路由
        with patch('apps.users.sso._verify_with_partner',
                   return_value=_payload(iss='integration-platform')):
            resp7 = client.post('/api/sso/exchange/',
                                data={'token': _jwt_token(_payload(iss='integration-platform'))},
                                content_type='application/json')
        assert resp7.status_code == 200, f'多中台路由失败: {resp7.status_code}'
        assert resp7.json()['user']['username'] == 'zhang@test.gov.cn'
        print('[PASS] 7. 多中台 - integration-platform 路由')

        # 8. 多中台 - provincial-emergency 路由（不同中台）
        with patch('apps.users.sso._verify_with_partner',
                   return_value=_payload(iss='provincial-emergency',
                                          aud='app_prov_smartforest',
                                          email='zhang@prov.gov.cn')):
            resp8 = client.post('/api/sso/exchange/',
                                data={'token': _jwt_token(_payload(iss='provincial-emergency'))},
                                content_type='application/json')
        assert resp8.status_code == 200
        assert resp8.json()['user']['username'] == 'zhang@prov.gov.cn'
        # 不同 iss → 独立 ExternalIdentity
        ext_prov = ExternalIdentity.objects.filter(
            issuer='provincial-emergency', sub=SUB).count()
        assert ext_prov == 1, '不同 iss 应独立建 ExternalIdentity'
        print('[PASS] 8. 多中台 - provincial-emergency 独立路由')

        # 9. 未知 iss → 403
        # 不 mock _verify_with_partner（iss 路由在 _verify 之前，未知 iss 直接 403）
        bad_iss_token = _jwt.encode(
            {'iss': 'unknown-hub', 'sub': 'x', 'aud': 'x', 'exp': 9999999999},
            'secret', algorithm='HS256',
        )
        resp9 = client.post('/api/sso/exchange/',
                            data={'token': bad_iss_token}, content_type='application/json')
        assert resp9.status_code == 403, f'未知 iss 应 403，实际: {resp9.status_code}'
        print('[PASS] 9. 未知 iss → 403')

        # 10. 同中台多 code（audience list）
        # app_fire_cmd 也在 integration-platform 的 audience list 里
        with patch('apps.users.sso._verify_with_partner',
                   return_value=_payload(iss='integration-platform', aud='app_fire_cmd')):
            resp10 = client.post('/api/sso/exchange/',
                                 data={'token': _jwt_token(_payload(iss='integration-platform'))},
                                 content_type='application/json')
        assert resp10.status_code == 200
        print('[PASS] 10. 同中台多 code - app_fire_cmd 路由成功')

        # 清理多中台测试用户
        User.objects.filter(email__in=[
            'zhang@test.gov.cn', 'zhang@prov.gov.cn',
        ]).delete()

    print('\n=== 全部 10 项测试通过 ===')


if __name__ == '__main__':
    setup_test_environment()
    runner = DiscoverRunner(verbosity=0)
    old_config = runner.setup_databases()
    try:
        run_tests()
    finally:
        runner.teardown_databases(old_config)
        teardown_test_environment()
