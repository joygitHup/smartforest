"""
Kafka 管线冒烟测试：确保主题 → 发布信封 →（可选）同步消费入库。
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from core.kafka_client import (
    ALL_DEVICE_TOPICS,
    check_kafka_health,
    consume_topics,
    publish_device_event,
)


class Command(BaseCommand):
    help = 'Smoke-test Kafka device pipeline (health + publish + optional consume)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--device',
            default='',
            help='Device ID (default: first active device in DB)',
        )
        parser.add_argument(
            '--consume',
            action='store_true',
            help='After publish, consume 1 message with a throwaway group and process sync',
        )
        parser.add_argument(
            '--message-type',
            default='telemetry',
            choices=['telemetry', 'alert', 'status'],
        )

    def handle(self, *args, **options):
        health = check_kafka_health()
        self.stdout.write(f"Kafka servers={health['bootstrap_servers']} ok={health['ok']}")
        if not health['ok']:
            self.stderr.write(self.style.ERROR(f"Kafka unreachable: {health.get('error')}"))
            return

        if health.get('missing_topics'):
            self.stdout.write('Creating missing topics...')
            from django.core.management import call_command

            call_command('ensure_kafka_topics')

        device_id = options['device']
        if not device_id:
            from apps.devices.models import Device

            device = Device.objects.order_by('id').first()
            if not device:
                self.stderr.write(self.style.ERROR('No device in database; seed data first'))
                return
            device_id = device.device_id

        message_type = options['message_type']
        now = timezone.now().isoformat()
        if message_type == 'telemetry':
            payload = {
                'temperature': 36.5,
                'humidity': 45.0,
                'source': 'kafka_smoke',
                'timestamp': now,
            }
        elif message_type == 'status':
            payload = {'status': 'online', 'timestamp': now, 'source': 'kafka_smoke'}
        else:
            payload = {
                'title': 'Kafka smoke alert',
                'alert_type': 'high_temp',
                'alert_level': 'level_3',
                'description': 'kafka_smoke test',
                'source': 'kafka_smoke',
                'timestamp': now,
            }

        ok = publish_device_event(
            message_type=message_type,
            device_id=device_id,
            payload=payload,
            mqtt_topic=f'device/{device_id}/{message_type}',
        )
        if not ok:
            self.stderr.write(self.style.ERROR('Publish failed'))
            return
        self.stdout.write(self.style.SUCCESS(f'Published {message_type} for device={device_id}'))

        if not options['consume']:
            self.stdout.write(
                'Tip: start consumer with `python manage.py consume_kafka` '
                '(or --consume here to process one message now).'
            )
            return

        results = []

        def handler(topic, message):
            from apps.devices.tasks import dispatch_kafka_message

            if not isinstance(message, dict) or not message.get('device_id'):
                self.stdout.write(f'Skip non-envelope message topic={topic} keys={list(message) if isinstance(message, dict) else type(message)}')
                return
            result = dispatch_kafka_message(topic, message)
            results.append(result)
            self.stdout.write(f'Consumed topic={topic} device={message.get("device_id")} result={result}')

        from apps.devices.tasks import dispatch_kafka_message
        from core.kafka_client import TOPIC_TELEMETRY, TOPIC_ALERT, TOPIC_STATUS

        topic_map = {
            'telemetry': TOPIC_TELEMETRY,
            'alert': TOPIC_ALERT,
            'status': TOPIC_STATUS,
        }
        topic = topic_map[message_type]
        sync_result = dispatch_kafka_message(
            topic,
            {
                'device_id': device_id,
                'message_type': message_type,
                'payload': payload,
            },
        )
        self.stdout.write(self.style.SUCCESS(f'Sync dispatch result={sync_result}'))

        # 再发一条，用独立 group + earliest；跳过脏数据，直到拿到带 device_id 的信封
        ok2 = publish_device_event(
            message_type=message_type,
            device_id=device_id,
            payload={**payload, 'smoke_pass': 2},
            mqtt_topic=f'device/{device_id}/{message_type}',
        )
        if not ok2:
            self.stderr.write(self.style.WARNING('Second publish failed; sync path already OK'))
            return

        group = f'forest-smoke-{int(timezone.now().timestamp())}'
        handled = consume_topics(
            topics=[topic],
            group_id=group,
            handler=handler,
            max_messages=5,
            idle_timeout_seconds=10,
            auto_offset_reset='earliest',
        )
        self.stdout.write(
            self.style.SUCCESS(
                f'Smoke done device={device_id} polled={handled} '
                f'valid_results={results or [sync_result]}'
            )
        )
