"""
系统运维：Prometheus / Django metrics 健康与摘要。
"""
from __future__ import annotations

import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsSystemAdmin

logger = logging.getLogger(__name__)


def _host_snapshot() -> dict[str, Any]:
    """本机 CPU / 内存 / 磁盘真实快照。"""
    import shutil
    from pathlib import Path

    disk_path = str(Path(settings.BASE_DIR).anchor or '.')
    try:
        usage = shutil.disk_usage(disk_path)
        disk = {
            'total_gb': round(usage.total / (1024 ** 3), 2),
            'used_gb': round(usage.used / (1024 ** 3), 2),
            'free_gb': round(usage.free / (1024 ** 3), 2),
            'percent': round(usage.used * 100 / usage.total, 1) if usage.total else 0,
            'path': disk_path,
        }
    except Exception as exc:
        disk = {'error': str(exc)}

    try:
        import psutil

        # 首次调用可能为 0，短采样
        cpu = psutil.cpu_percent(interval=0.2)
        vm = psutil.virtual_memory()
        net = psutil.net_io_counters()
        return {
            'ok': True,
            'cpu_percent': cpu,
            'cpu_count': psutil.cpu_count() or 0,
            'memory_percent': vm.percent,
            'memory_total_gb': round(vm.total / (1024 ** 3), 2),
            'memory_used_gb': round(vm.used / (1024 ** 3), 2),
            'disk': disk,
            'net': {
                'bytes_sent_mb': round(net.bytes_sent / (1024 ** 2), 1),
                'bytes_recv_mb': round(net.bytes_recv / (1024 ** 2), 1),
            },
            'boot_time': psutil.boot_time(),
        }
    except Exception as exc:
        return {
            'ok': False,
            'error': str(exc),
            'disk': disk,
            'hint': '请安装 psutil: pip install psutil',
        }


def _check_tcp(host: str, port: int, timeout: float = 1.5) -> dict[str, Any]:
    import socket

    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return {'ok': True}
    except Exception as exc:
        return {'ok': False, 'error': str(exc)}


def _check_redis() -> dict[str, Any]:
    try:
        from django.core.cache import cache

        cache.set('ops_diag_ping', '1', 5)
        ok = cache.get('ops_diag_ping') == '1'
        return {'ok': ok, 'backend': 'django.cache'}
    except Exception as exc:
        return {'ok': False, 'error': str(exc)}


def _check_postgres() -> dict[str, Any]:
    try:
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
        return {'ok': True, 'vendor': connection.vendor}
    except Exception as exc:
        return {'ok': False, 'error': str(exc)}


def _check_tdengine() -> dict[str, Any]:
    try:
        from core.tdengine_client import get_tdengine_client

        client = get_tdengine_client()
        client.connect()
        return {'ok': True}
    except Exception as exc:
        return {'ok': False, 'error': str(exc)}


def _build_events(limit: int = 80, user=None) -> list[dict[str, Any]]:
    """从业务库汇总真实诊断事件（按当前用户组织视野过滤）。"""
    from django.utils import timezone
    from apps.devices.models import Device, DeviceCommand
    from apps.alerts.models import Alert
    from apps.users.org_scope import filter_alerts_for_user, filter_by_org_scope

    events: list[dict[str, Any]] = []
    now = timezone.now()

    devices_qs = Device.objects.all()
    commands_qs = DeviceCommand.objects.select_related('device', 'operator')
    alerts_qs = Alert.objects.select_related('device')
    if user is not None:
        devices_qs = filter_by_org_scope(devices_qs, user)
        commands_qs = filter_by_org_scope(
            commands_qs, user, field='device__organization_id'
        )
        alerts_qs = filter_alerts_for_user(alerts_qs, user)

    for d in devices_qs.filter(status='offline').order_by('-last_heartbeat')[:20]:
        events.append(
            {
                'id': f'dev-off-{d.id}',
                'timestamp': (d.last_heartbeat or d.updated_at or now).isoformat(),
                'level': 'error',
                'source': d.device_id,
                'message': f'设备离线：{d.device_name}，最后心跳 {d.last_heartbeat or "-"}',
                'category': 'device',
            }
        )

    for d in devices_qs.filter(status='alarm').order_by('-updated_at')[:15]:
        events.append(
            {
                'id': f'dev-alarm-{d.id}',
                'timestamp': (d.updated_at or now).isoformat(),
                'level': 'warn',
                'source': d.device_id,
                'message': f'设备告警状态：{d.device_name}',
                'category': 'device',
            }
        )

    for d in (
        devices_qs.filter(battery_level__lt=20)
        .exclude(battery_level__isnull=True)
        .order_by('battery_level')[:15]
    ):
        events.append(
            {
                'id': f'dev-bat-{d.id}',
                'timestamp': (d.updated_at or now).isoformat(),
                'level': 'warn',
                'source': d.device_id,
                'message': f'电池电量偏低：{d.device_name} 当前 {d.battery_level}%',
                'category': 'device',
            }
        )

    for c in commands_qs.filter(status__in=['failed', 'timeout']).order_by('-created_at')[:20]:
        events.append(
            {
                'id': f'cmd-{c.id}',
                'timestamp': c.created_at.isoformat(),
                'level': 'error' if c.status == 'failed' else 'warn',
                'source': c.device.device_id,
                'message': f'指令{c.get_status_display()}：{c.command_type}'
                + (f' — {c.error_message}' if c.error_message else ''),
                'category': 'command',
            }
        )

    for c in commands_qs.order_by('-created_at')[:15]:
        if c.status in ('failed', 'timeout'):
            continue
        op = ''
        if c.operator_id:
            op = f'（{c.operator.username}）'
        events.append(
            {
                'id': f'cmd-ok-{c.id}',
                'timestamp': c.created_at.isoformat(),
                'level': 'info',
                'source': c.device.device_id,
                'message': f'指令{c.get_status_display()}：{c.command_type}{op}',
                'category': 'command',
            }
        )

    for a in alerts_qs.order_by('-occurred_at', '-created_at')[:25]:
        level = 'error' if a.alert_level == 'level_1' else 'warn' if a.alert_level == 'level_2' else 'info'
        device_id = a.device.device_id if a.device_id else 'System'
        events.append(
            {
                'id': f'alert-{a.id}',
                'timestamp': (a.occurred_at or a.created_at or now).isoformat(),
                'level': level,
                'source': device_id,
                'message': f'[{a.get_alert_level_display()}] {a.title}（{a.get_status_display()}）',
                'category': 'alert',
            }
        )

    events.sort(key=lambda e: e.get('timestamp') or '', reverse=True)
    return events[:limit]


def _http_get_json(url: str, timeout: float = 3.0) -> tuple[dict[str, Any] | None, str | None]:
    try:
        req = urllib.request.Request(url, headers={'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            import json

            return json.loads(resp.read().decode('utf-8')), None
    except Exception as exc:
        return None, str(exc)


def _http_get_text(url: str, timeout: float = 3.0) -> tuple[str | None, int | None, str | None]:
    try:
        req = urllib.request.Request(url, headers={'Accept': 'text/plain'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode('utf-8', errors='replace'), resp.status, None
    except urllib.error.HTTPError as exc:
        return None, exc.code, str(exc)
    except Exception as exc:
        return None, None, str(exc)


def _prometheus_base() -> str:
    return getattr(settings, 'PROMETHEUS_URL', 'http://127.0.0.1:9090').rstrip('/')


def _parse_prom_samples(text: str, limit: int = 40) -> list[dict[str, str]]:
    """从 Prometheus exposition 文本中抽取若干指标名。"""
    names: list[dict[str, str]] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name = line.split('{', 1)[0].split(' ', 1)[0].strip()
        if not name or name in seen:
            continue
        seen.add(name)
        names.append({'name': name})
        if len(names) >= limit:
            break
    return names


class OpsOverviewView(APIView):
    """GET /api/ops/overview/ — Prometheus + Django /metrics/ + 关联服务端口"""

    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def get(self, request):
        prom_url = _prometheus_base()
        django_metrics_url = getattr(
            settings,
            'DJANGO_METRICS_URL',
            'http://127.0.0.1:8000/metrics/',
        )

        # Prometheus 就绪（返回纯文本）
        ready_text, ready_status, ready_err = _http_get_text(f'{prom_url}/-/ready')
        prometheus_ready = ready_status == 200 or (
            bool(ready_text) and 'ready' in (ready_text or '').lower()
        )
        prometheus_ready_error = None if prometheus_ready else (ready_err or 'not ready')

        targets_data, targets_err = _http_get_json(f'{prom_url}/api/v1/targets')
        targets: list[dict[str, Any]] = []
        if targets_data and targets_data.get('status') == 'success':
            active = (targets_data.get('data') or {}).get('activeTargets') or []
            for t in active:
                labels = t.get('labels') or {}
                targets.append(
                    {
                        'job': labels.get('job'),
                        'instance': labels.get('instance'),
                        'health': t.get('health'),
                        'last_error': t.get('lastError') or '',
                        'last_scrape': t.get('lastScrape'),
                        'scrape_url': t.get('scrapeUrl'),
                    }
                )

        up_data, up_err = _http_get_json(
            f'{prom_url}/api/v1/query?{urllib.parse.urlencode({"query": "up"})}'
        )
        up_series: list[dict[str, Any]] = []
        if up_data and up_data.get('status') == 'success':
            for row in ((up_data.get('data') or {}).get('result') or []):
                metric = row.get('metric') or {}
                value = row.get('value') or [None, None]
                up_series.append(
                    {
                        'job': metric.get('job'),
                        'instance': metric.get('instance'),
                        'value': value[1] if len(value) > 1 else None,
                    }
                )

        # Django /metrics/ exposition
        metrics_text, metrics_status, metrics_err = _http_get_text(django_metrics_url)
        django_metrics = {
            'url': django_metrics_url,
            'ok': metrics_status == 200 and bool(metrics_text),
            'status_code': metrics_status,
            'error': metrics_err,
            'sample_count': len(metrics_text.splitlines()) if metrics_text else 0,
            'metric_names': _parse_prom_samples(metrics_text or ''),
        }

        # MinIO（用户提到的 9000/9001）与 Prometheus UI
        minio_api = getattr(settings, 'AWS_S3_ENDPOINT_URL', 'http://127.0.0.1:9000')
        minio_console = getattr(settings, 'MINIO_CONSOLE_URL', 'http://127.0.0.1:9001')
        minio_text, minio_status, minio_err = _http_get_text(minio_api.rstrip('/') + '/minio/health/live')

        return Response(
            {
                'prometheus': {
                    'url': prom_url,
                    'ui': prom_url,
                    'ready': prometheus_ready,
                    'ready_error': prometheus_ready_error,
                    'targets_error': targets_err,
                    'up_query_error': up_err,
                    'targets': targets,
                    'up': up_series,
                },
                'django_metrics': django_metrics,
                'services': [
                    {
                        'name': 'Prometheus',
                        'url': prom_url,
                        'port_hint': '9090',
                        'ok': prometheus_ready,
                    },
                    {
                        'name': 'Django Metrics',
                        'url': django_metrics_url,
                        'port_hint': '8000/metrics',
                        'ok': django_metrics['ok'],
                    },
                    {
                        'name': 'MinIO API',
                        'url': minio_api,
                        'port_hint': '9000',
                        'ok': minio_status == 200 or (minio_text is not None and not minio_err),
                        'error': minio_err,
                    },
                    {
                        'name': 'MinIO Console',
                        'url': minio_console,
                        'port_hint': '9001',
                        'ok': None,
                    },
                ],
            }
        )


class OpsMetricsQueryView(APIView):
    """
    GET /api/ops/metrics/query/?query=up
    代理 Prometheus 即时查询，避免前端直连跨域。
    """

    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def get(self, request):
        query = (request.query_params.get('query') or 'up').strip()
        if not query:
            return Response({'error': 'query required'}, status=400)
        prom_url = _prometheus_base()
        url = f'{prom_url}/api/v1/query?{urllib.parse.urlencode({"query": query})}'
        data, err = _http_get_json(url, timeout=5.0)
        if err or not data:
            return Response({'ok': False, 'error': err or 'empty response', 'query': query}, status=502)
        return Response({'ok': True, 'query': query, 'prometheus': data})


class OpsDiagnosticsView(APIView):
    """
    GET /api/ops/diagnostics/
    运维诊断真实数据：主机资源、依赖服务、设备统计、事件流。
    """

    permission_classes = [IsAuthenticated, IsSystemAdmin]

    def get(self, request):
        from django.utils import timezone
        from django.conf import settings as dj_settings
        from apps.devices.models import Device, DeviceCommand
        from apps.alerts.models import Alert
        from apps.users.org_scope import (
            filter_alerts_for_user,
            filter_by_org_scope,
            scope_payload,
        )
        from core.kafka_client import check_kafka_health

        host = _host_snapshot()
        mqtt_cfg = getattr(dj_settings, 'MQTT_CONFIG', {}) or {}
        mqtt_host = mqtt_cfg.get('BROKER_HOST', 'localhost')
        mqtt_port = int(mqtt_cfg.get('BROKER_PORT', 1883))

        prom_url = _prometheus_base()
        ready_text, ready_status, ready_err = _http_get_text(f'{prom_url}/-/ready')
        prometheus_ok = ready_status == 200 or (
            bool(ready_text) and 'ready' in (ready_text or '').lower()
        )

        minio_api = getattr(dj_settings, 'AWS_S3_ENDPOINT_URL', 'http://127.0.0.1:9000')
        minio_text, minio_status, minio_err = _http_get_text(
            minio_api.rstrip('/') + '/minio/health/live'
        )
        minio_ok = minio_status == 200 or (minio_text is not None and not minio_err)

        metrics_url = getattr(dj_settings, 'DJANGO_METRICS_URL', 'http://127.0.0.1:8000/metrics')
        _, metrics_status, metrics_err = _http_get_text(metrics_url)

        kafka = check_kafka_health()
        pg = _check_postgres()
        redis = _check_redis()
        mqtt = _check_tcp(mqtt_host, mqtt_port)
        td = _check_tdengine()
        services = [
            {'name': 'PostgreSQL', **pg},
            {'name': 'Redis', **redis},
            {
                'name': 'Kafka',
                'ok': bool(kafka.get('ok')),
                'error': kafka.get('error'),
                'topics': kafka.get('existing_topics'),
            },
            {'name': 'MQTT Broker', 'host': f'{mqtt_host}:{mqtt_port}', **mqtt},
            {
                'name': 'Prometheus',
                'ok': prometheus_ok,
                'url': prom_url,
                'error': None if prometheus_ok else ready_err,
            },
            {
                'name': 'Django Metrics',
                'ok': metrics_status == 200,
                'url': metrics_url,
                'error': metrics_err,
            },
            {'name': 'MinIO', 'ok': minio_ok, 'url': minio_api, 'error': minio_err},
            {'name': 'TDengine', **td},
        ]

        devices_qs = filter_by_org_scope(Device.objects.all(), request.user)
        commands_qs = filter_by_org_scope(
            DeviceCommand.objects.all(),
            request.user,
            field='device__organization_id',
        )
        alerts_qs = filter_alerts_for_user(Alert.objects.all(), request.user)

        device_stats = {
            'total': devices_qs.count(),
            'online': devices_qs.filter(status='online').count(),
            'offline': devices_qs.filter(status='offline').count(),
            'alarm': devices_qs.filter(status='alarm').count(),
            'maintenance': devices_qs.filter(status='maintenance').count(),
            'low_battery': devices_qs.filter(battery_level__lt=20)
            .exclude(battery_level__isnull=True)
            .count(),
        }
        cmd_stats = {
            'pending': commands_qs.filter(status='pending').count(),
            'failed_24h': commands_qs.filter(
                status__in=['failed', 'timeout'],
                created_at__gte=timezone.now() - timezone.timedelta(hours=24),
            ).count(),
            'sent_24h': commands_qs.filter(
                created_at__gte=timezone.now() - timezone.timedelta(hours=24),
            ).count(),
        }
        alert_stats = {
            'open': alerts_qs.exclude(status__in=['resolved', 'false_alarm']).count(),
            'level_1_open': alerts_qs.filter(alert_level='level_1')
            .exclude(status__in=['resolved', 'false_alarm'])
            .count(),
            'last_24h': alerts_qs.filter(
                created_at__gte=timezone.now() - timezone.timedelta(hours=24)
            ).count(),
        }

        ok_services = sum(1 for s in services if s.get('ok'))
        total_services = len(services)
        # 健康度：服务可用性 60% + 设备在线率 40%（设备按组织视野）
        svc_score = (ok_services / total_services) * 60 if total_services else 0
        online_rate = (
            (device_stats['online'] / device_stats['total']) * 40 if device_stats['total'] else 40
        )
        health_score = round(svc_score + online_rate, 1)

        events = _build_events(limit=100, user=request.user)
        org_scope = scope_payload(request.user)
        return Response(
            {
                'generated_at': timezone.now().isoformat(),
                'org_scope': org_scope,
                'health_score': health_score,
                'health_label': (
                    '运行正常'
                    if health_score >= 85
                    else '存在风险'
                    if health_score >= 60
                    else '需要关注'
                ),
                'host': host,
                'services': services,
                'devices': device_stats,
                'commands': cmd_stats,
                'alerts': alert_stats,
                'pipeline': {
                    'enabled': bool(kafka.get('use_kafka_pipeline')),
                    'kafka_ok': bool(kafka.get('ok')),
                    'path': (
                        'MQTT → Kafka → Celery → DB'
                        if kafka.get('use_kafka_pipeline')
                        else 'MQTT → Celery → DB'
                    ),
                },
                'events': events,
                'event_counts': {
                    'all': len(events),
                    'error': sum(1 for e in events if e.get('level') == 'error'),
                    'warn': sum(1 for e in events if e.get('level') == 'warn'),
                    'info': sum(1 for e in events if e.get('level') == 'info'),
                },
            }
        )
