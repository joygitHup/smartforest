"""
启动本地 MQTT 设备模拟器，并把模拟设备登记到「设备管理」。

用法:
  python manage.py simulate_mqtt_devices
  python manage.py simulate_mqtt_devices --interval 3 --include-demo
  python manage.py simulate_mqtt_devices --devices ZHL-001,ENV-001 --rounds 5
"""
from django.core.management.base import BaseCommand

from core.mqtt_simulator import MQTTDeviceSimulator, ensure_simulator_devices


class Command(BaseCommand):
    help = 'Register MQTT simulator devices and publish telemetry to EMQX'

    def add_arguments(self, parser):
        parser.add_argument(
            '--interval',
            type=float,
            default=5.0,
            help='Publish interval in seconds (default 5)',
        )
        parser.add_argument(
            '--rounds',
            type=int,
            default=0,
            help='Stop after N rounds (0 = run forever)',
        )
        parser.add_argument(
            '--devices',
            default='',
            help='Comma-separated extra device_ids to simulate (must exist or will be auto-created)',
        )
        parser.add_argument(
            '--include-demo',
            action='store_true',
            help='Also simulate seeded demo devices (ZHL/ENV/GW/UAV)',
        )
        parser.add_argument(
            '--no-alert',
            action='store_true',
            help='Do not publish occasional alert messages',
        )
        parser.add_argument(
            '--register-only',
            action='store_true',
            help='Only ensure devices exist in DB, do not publish',
        )

    def handle(self, *args, **options):
        extra = [x.strip() for x in options['devices'].split(',') if x.strip()]
        if options['include_demo']:
            from apps.devices.models import Device

            demo_ids = list(
                Device.objects.exclude(manufacturer='MQTT模拟器')
                .order_by('id')
                .values_list('device_id', flat=True)[:12]
            )
            extra.extend(demo_ids)

        devices = ensure_simulator_devices(extra_ids=extra)
        self.stdout.write(
            self.style.SUCCESS(
                f'Registered/loaded {len(devices)} devices: '
                + ', '.join(d.device_id for d in devices)
            )
        )
        if options['register_only']:
            return

        sim = MQTTDeviceSimulator(
            devices=devices,
            interval=options['interval'],
            publish_alert=not options['no_alert'],
        )
        rounds = options['rounds'] or None
        self.stdout.write(
            f'Starting MQTT simulator → {sim.host}:{sim.port} '
            f'interval={sim.interval}s rounds={rounds or "∞"}'
        )
        self.stdout.write('Topics: device/{id}/telemetry|status|alert')
        self.stdout.write('Ensure mqtt_client + consume_kafka + Celery are running.')
        try:
            sim.run(rounds=rounds)
        except KeyboardInterrupt:
            sim.stop()
            self.stdout.write(self.style.WARNING('Simulator interrupted'))
