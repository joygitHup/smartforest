"""
造演示数据，保证指挥中心 / 设备 / 告警 / 溯源 / 报表可演示。

用法:
  python manage.py seed_demo_data
  python manage.py seed_demo_data --flush   # 先清理业务数据再写入
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.alerts.models import Alert, AlertAction, AlertRule, FireTracing
from apps.devices.models import Device, DeviceTelemetry
from apps.reports.models import DailyReport, DeviceStatistics, EnvironmentalData
from apps.reports.tasks import generate_full_daily_pipeline
from apps.users.models import Organization, Role, User

SYSTEM_ROLES = [
    (
        'admin',
        '系统管理员',
        True,
        [
            'dashboard:view', 'devices:view', 'devices:edit',
            'alerts:view', 'alerts:handle', 'fire_tracing:view',
            'reports:view', 'reports:generate', 'diagnostics:view',
            'organization:view', 'organization:edit',
            'roles:view', 'roles:edit', 'users:view', 'users:edit',
            'settings:view', 'settings:edit',
        ],
    ),
    (
        'operator',
        '运维人员',
        True,
        [
            'dashboard:view', 'devices:view', 'devices:edit',
            'alerts:view', 'alerts:handle', 'fire_tracing:view',
            'reports:view', 'diagnostics:view',
            'organization:view', 'users:view', 'settings:view',
        ],
    ),
    (
        'forester',
        '护林员',
        True,
        [
            'dashboard:view', 'devices:view', 'alerts:view', 'alerts:handle',
            'fire_tracing:view', 'reports:view',
        ],
    ),
    (
        'viewer',
        '查看者',
        True,
        [
            'dashboard:view', 'devices:view', 'alerts:view',
            'fire_tracing:view', 'reports:view',
        ],
    ),
]


REGIONS = [
    ('白桦林保护区', '白桦林区'),
    ('红松保护区', '红松核心区'),
    ('樟子松林区', '樟子松监测带'),
    ('落叶松林区', '落叶松巡护区'),
    ('云杉林区', '云杉东坡'),
]

DEVICE_SPECS = [
    # 坐标落在中国境内演示林区（内蒙古赤峰 / 大兴安岭南缘：约 E117.9–118.1 / N42.35–42.42）
    ('ZHL-001', '双目云台-白桦01', 'dual_camera', 117.900000, 42.350000, 0),
    ('ZHL-002', '双目云台-红松02', 'dual_camera', 117.938000, 42.354000, 1),
    ('ZHL-003', '双目云台-樟子松03', 'dual_camera', 117.976000, 42.358000, 2),
    ('ZHL-004', '双目云台-落叶松04', 'dual_camera', 118.014000, 42.350000, 3),
    ('ENV-001', '环境站-白桦A', 'env_sensor', 118.052000, 42.354000, 0),
    ('ENV-002', '环境站-红松B', 'env_sensor', 118.090000, 42.358000, 1),
    ('ENV-003', '环境站-樟子松C', 'env_sensor', 117.912000, 42.378000, 2),
    ('GW-001', '边缘网关-北区', 'ai_gateway', 117.950000, 42.382000, 0),
    ('GW-002', '边缘网关-南区', 'ai_gateway', 117.988000, 42.386000, 2),
    ('UAV-001', '巡检无人机-01', 'drone', 118.026000, 42.378000, 1),
    ('UAV-002', '巡检无人机-02', 'drone', 118.064000, 42.382000, 3),
    ('ZHL-005', '双目云台-云杉05', 'dual_camera', 118.102000, 42.386000, 4),
]


class Command(BaseCommand):
    help = 'Seed demo data for SmartForest command center'

    def add_arguments(self, parser):
        parser.add_argument(
            '--flush',
            action='store_true',
            help='Clear business tables before seeding (keeps users)',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        today = timezone.localdate()
        now = timezone.now()

        self._ensure_admin()
        self._seed_organizations_and_roles()

        if options['flush']:
            self.stdout.write('Flushing business data...')
            FireTracing.objects.all().delete()
            AlertAction.objects.all().delete()
            Alert.objects.all().delete()
            DeviceTelemetry.objects.all().delete()
            DeviceStatistics.objects.all().delete()
            EnvironmentalData.objects.all().delete()
            DailyReport.objects.all().delete()
            Device.objects.all().delete()

        devices = self._seed_devices(now)
        self._seed_telemetry(devices, now)
        alerts = self._seed_alerts(devices, now)
        self._seed_fire_tracing(alerts, now)
        self._seed_alert_rules()
        self._seed_reports(devices, today)
        # 再跑一遍聚合管线，覆盖今日日报/设备统计/环境
        try:
            generate_full_daily_pipeline.apply(args=[str(today)]).get()
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f'Pipeline skipped: {exc}'))

        self.stdout.write(self.style.SUCCESS(
            f'Demo data ready: devices={Device.objects.count()} '
            f'alerts={Alert.objects.count()} fire={FireTracing.objects.count()} '
            f'daily={DailyReport.objects.count()}'
        ))
        self.stdout.write('Login: admin / admin123')

    def _ensure_admin(self):
        user, created = User.objects.get_or_create(
            username='admin',
            defaults={
                'email': 'admin@smartforest.local',
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
                'department': '指挥中心',
            },
        )
        user.set_password('admin123')
        user.role = 'admin'
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.save()
        self.stdout.write(f'Admin user {"created" if created else "updated"}: admin/admin123')

        for username, role, dept in (
            ('operator', 'operator', '运维班组'),
            ('forester', 'forester', '护林队'),
        ):
            u, _ = User.objects.get_or_create(
                username=username,
                defaults={'role': role, 'department': dept, 'email': f'{username}@smartforest.local'},
            )
            u.set_password('admin123')
            u.role = role
            u.is_active = True
            u.save()

    def _seed_organizations_and_roles(self):
        root, _ = Organization.objects.update_or_create(
            code='HQ',
            defaults={
                'name': '林智指挥中心',
                'org_type': 'group',
                'region': '总部',
                'contact': '张指挥',
                'phone': '13800000001',
                'sort_order': 0,
                'is_active': True,
                'parent': None,
            },
        )
        bureau, _ = Organization.objects.update_or_create(
            code='FOREST-BUREAU',
            defaults={
                'name': '北方林业局',
                'org_type': 'bureau',
                'region': '白桦林保护区',
                'contact': '李局长',
                'phone': '13800000002',
                'sort_order': 1,
                'is_active': True,
                'parent': root,
            },
        )
        Organization.objects.update_or_create(
            code='STATION-01',
            defaults={
                'name': '白桦管护站',
                'org_type': 'station',
                'region': '白桦林保护区',
                'contact': '王站长',
                'phone': '13800000003',
                'sort_order': 1,
                'is_active': True,
                'parent': bureau,
            },
        )
        Organization.objects.update_or_create(
            code='STATION-02',
            defaults={
                'name': '红松管护站',
                'org_type': 'station',
                'region': '红松保护区',
                'contact': '赵站长',
                'phone': '13800000004',
                'sort_order': 2,
                'is_active': True,
                'parent': bureau,
            },
        )

        role_map = {}
        for code, name, is_system, permissions in SYSTEM_ROLES:
            role, _ = Role.objects.update_or_create(
                code=code,
                defaults={
                    'name': name,
                    'description': f'{name}（系统内置）',
                    'permissions': permissions,
                    'is_system': is_system,
                    'is_enabled': True,
                    'organization': None,
                },
            )
            role_map[code] = role

        org_by_user = {
            'admin': root,
            'operator': bureau,
            'forester': Organization.objects.filter(code='STATION-01').first() or bureau,
        }
        for user in User.objects.filter(username__in=org_by_user.keys()):
            user.organization = org_by_user.get(user.username)
            user.role_ref = role_map.get(user.role)
            user.save(update_fields=['organization', 'role_ref', 'updated_at'])

        self.stdout.write(
            f'Organizations={Organization.objects.count()} Roles={Role.objects.count()}'
        )

    def _seed_devices(self, now):
        devices = []
        statuses = ['online', 'online', 'online', 'online', 'alarm', 'offline', 'online']
        for i, (did, name, dtype, lng, lat, ri) in enumerate(DEVICE_SPECS):
            region, zone = REGIONS[ri]
            status = statuses[i % len(statuses)]
            device, _ = Device.objects.update_or_create(
                device_id=did,
                defaults={
                    'device_name': name,
                    'device_type': dtype,
                    'status': status,
                    'longitude': Decimal(str(lng)),
                    'latitude': Decimal(str(lat)),
                    'altitude': Decimal(str(800 + i * 12)),
                    'region': region,
                    'forest_zone': zone,
                    'firmware_version': '1.2.0',
                    'hardware_version': 'A3',
                    'manufacturer': '林智智造',
                    'communication_type': '4g' if dtype != 'drone' else 'lora',
                    'signal_strength': 3 + (i % 3),
                    'battery_level': 40 + (i * 5) % 55,
                    'pan_angle': Decimal(str((i * 15) % 360)),
                    'tilt_angle': Decimal(str(-10 + (i % 5) * 5)),
                    'last_online_time': now - timedelta(minutes=i * 3),
                    'last_heartbeat': now - timedelta(minutes=i),
                },
            )
            devices.append(device)
        self.stdout.write(f'Devices: {len(devices)}')
        return devices

    def _seed_telemetry(self, devices, now):
        created = 0
        for device in devices:
            for h in range(24):
                ts = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=23 - h)
                temp = 18 + h * 0.6 + random.uniform(-1, 1.5)
                DeviceTelemetry.objects.update_or_create(
                    device=device,
                    timestamp=ts,
                    defaults={
                        'temperature': round(temp, 1),
                        'humidity': round(35 + random.uniform(0, 40), 1),
                        'wind_speed': round(random.uniform(0.5, 8), 1),
                        'wind_direction': random.randint(0, 359),
                        'light_intensity': round(random.uniform(100, 80000), 1),
                        'soil_moisture_10cm': round(random.uniform(10, 40), 1),
                        'fuel_moisture': round(random.uniform(8, 25), 1),
                        'thermal_max_temp': round(temp + random.uniform(5, 40), 1),
                        'thermal_avg_temp': round(temp + 2, 1),
                        'video_status': 'normal',
                    },
                )
                created += 1
        self.stdout.write(f'Telemetry points upserted: ~{created}')

    def _seed_alerts(self, devices, now):
        samples = [
            ('fire', 'level_1', 'new', '红松保护区疑似火点'),
            ('smoke', 'level_2', 'processing', '樟子松林区烟雾告警'),
            ('high_temp', 'level_2', 'acknowledged', '落叶松高温超阈'),
            ('device_fault', 'level_3', 'dispatched', '边缘网关通信异常'),
            ('low_battery', 'level_3', 'new', '无人机电量过低'),
            ('fire', 'level_1', 'escalated', '云杉林区火情升级'),
            ('env_threshold', 'level_3', 'resolved', '白桦湿度过低已恢复'),
            ('offline', 'level_2', 'false_alarm', '云台离线误报'),
            ('smoke', 'level_2', 'new', '南部边界烟雾探测'),
            ('high_temp', 'level_1', 'processing', '红松核心区热成像高温'),
        ]
        alerts = []
        for i, (atype, level, status, title) in enumerate(samples):
            device = devices[i % len(devices)]
            occurred = now - timedelta(hours=i * 1.5, minutes=i * 7)
            alert_id = f'ALERT-DEMO-{today_compact(now)}-{i+1:03d}'
            alert, _ = Alert.objects.update_or_create(
                alert_id=alert_id,
                defaults={
                    'device': device,
                    'alert_type': atype,
                    'alert_level': level,
                    'status': status,
                    'title': title,
                    'description': f'{title}（演示数据）',
                    'longitude': device.longitude,
                    'latitude': device.latitude,
                    'region': device.region,
                    'forest_zone': device.forest_zone,
                    'ai_confidence': round(0.55 + (i % 5) * 0.08, 2),
                    'ai_category': atype,
                    'occurred_at': occurred,
                    'resolved_at': occurred + timedelta(minutes=25) if status in ('resolved', 'false_alarm') else None,
                    'resolution_note': '演示处置完成' if status in ('resolved', 'false_alarm') else '',
                },
            )
            AlertAction.objects.get_or_create(
                alert=alert,
                action_type='create',
                defaults={
                    'operator': 'system',
                    'content': '系统生成演示告警',
                },
            )
            alerts.append(alert)
        self.stdout.write(f'Alerts: {len(alerts)}')
        return alerts

    def _seed_fire_tracing(self, alerts, now):
        count = 0
        for alert in alerts:
            if alert.alert_type not in ('fire', 'smoke'):
                continue
            lng = float(alert.longitude or 117.95)
            lat = float(alert.latitude or 42.39)
            FireTracing.objects.update_or_create(
                alert=alert,
                defaults={
                    'origin_longitude': Decimal(str(round(lng, 6))),
                    'origin_latitude': Decimal(str(round(lat, 6))),
                    'origin_confidence': 0.72 + (count % 3) * 0.05,
                    'algorithm': 'FARSITE',
                    'input_devices': [alert.device.device_id] if alert.device_id else [],
                    'weather_data': {
                        'wind_speed': 3.5 + count,
                        'wind_direction': 180,
                        'temperature': 28 + count,
                        'humidity': 40 - count * 2,
                    },
                    'spread_prediction_1h': {'radius_km': 0.5, 'area_km2': 0.78, 'direction': 'north'},
                    'spread_prediction_3h': {'radius_km': 1.5, 'area_km2': 7.07, 'direction': 'north'},
                    'spread_prediction_6h': {'radius_km': 3.0, 'area_km2': 28.27, 'direction': 'northeast'},
                    'control_strategy': {
                        'isolation_belt': [
                            {'longitude': lng - 0.01, 'latitude': lat + 0.01},
                            {'longitude': lng + 0.01, 'latitude': lat + 0.01},
                        ],
                        'firefighting_devices': ['ZHL-001', 'ZHL-002'],
                        'support_routes': [
                            {'start': '指挥中心', 'end': '起火点', 'distance_km': 5.2 + count}
                        ],
                    },
                },
            )
            count += 1
        self.stdout.write(f'Fire tracing: {count}')

    def _seed_alert_rules(self):
        rules = [
            ('一级火情自动研判', 'fire', 'level_1', 0.8, None, None),
            ('二级火情预警规则', 'fire', 'level_2', 0.6, None, None),
            ('烟雾提示规则', 'smoke', 'level_3', 0.5, None, None),
            ('高温阈值规则', 'high_temp', 'level_2', 0.0, 45.0, None),
        ]
        for name, atype, level, conf, temp, hum in rules:
            AlertRule.objects.update_or_create(
                name=name,
                defaults={
                    'alert_type': atype,
                    'alert_level': level,
                    'confidence_threshold': conf,
                    'temperature_threshold': temp,
                    'humidity_threshold': hum,
                    'push_channels': ['in_app'],
                    'response_seconds': 60,
                    'is_enabled': True,
                    'is_system': True,
                    'organization': None,
                    'description': '演示规则',
                },
            )

    def _seed_reports(self, devices, today):
        # 近 7 天日报骨架
        for d in range(7):
            day = today - timedelta(days=d)
            online = max(1, len(devices) - (d % 3))
            total_alerts = 5 + d * 2
            DailyReport.objects.update_or_create(
                report_date=day,
                defaults={
                    'total_devices': len(devices),
                    'online_devices': online,
                    'online_rate': round(online / len(devices) * 100, 2),
                    'total_alerts': total_alerts,
                    'resolved_alerts': total_alerts - 1,
                    'resolution_rate': round((total_alerts - 1) / total_alerts * 100, 2),
                    'avg_response_time': 120 + d * 10,
                    'false_alarm_count': 1,
                    'false_alarm_rate': round(100 / total_alerts, 2),
                    'avg_temperature': 24 + d * 0.5,
                    'max_temperature': 32 + d * 0.3,
                    'avg_humidity': 50 - d,
                    'avg_wind_speed': 3.2,
                    'carbon_sequestration': round(len(devices) * 0.5 + 2 + d * 0.1, 2),
                },
            )

        for device in devices:
            DeviceStatistics.objects.update_or_create(
                device=device,
                stat_date=today,
                defaults={
                    'uptime_hours': 20 + random.uniform(0, 4),
                    'availability_rate': round(random.uniform(88, 99.5), 2),
                    'alert_count': random.randint(0, 4),
                    'fault_count': random.randint(0, 1),
                    'data_completeness': round(random.uniform(85, 100), 2),
                },
            )

        for region, _ in REGIONS:
            for hour in range(0, 24, 2):
                EnvironmentalData.objects.update_or_create(
                    region=region,
                    stat_date=today,
                    stat_hour=hour,
                    defaults={
                        'avg_temperature': round(18 + hour * 0.5 + random.uniform(-1, 1), 1),
                        'max_temperature': round(22 + hour * 0.5, 1),
                        'min_temperature': round(15 + hour * 0.3, 1),
                        'avg_humidity': round(40 + random.uniform(0, 30), 1),
                        'max_humidity': 80,
                        'min_humidity': 30,
                        'avg_wind_speed': round(random.uniform(1, 6), 1),
                        'max_wind_speed': round(random.uniform(6, 12), 1),
                        'avg_light_intensity': 10000 + hour * 1000,
                        'avg_soil_moisture': 20,
                        'avg_fuel_moisture': 12,
                    },
                )


def today_compact(now: datetime) -> str:
    return timezone.localtime(now).strftime('%Y%m%d')
