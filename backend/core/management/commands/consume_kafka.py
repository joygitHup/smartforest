"""
Kafka 消费者：EMQX Bridge / MQTT 转发写入的消息 → Celery 处理。
"""
import signal
import threading

from django.core.management.base import BaseCommand
from django.conf import settings

from core.kafka_client import ALL_DEVICE_TOPICS, consume_topics


class Command(BaseCommand):
    help = 'Consume Kafka device topics and dispatch Celery tasks'

    def add_arguments(self, parser):
        parser.add_argument(
            '--group',
            default=getattr(settings, 'KAFKA_CONSUMER_GROUP', 'forest-monitor-ingest'),
            help='Kafka consumer group id',
        )
        parser.add_argument(
            '--sync',
            action='store_true',
            help='Process messages in-process (no Celery.delay)',
        )

    def handle(self, *args, **options):
        group_id = options['group']
        sync = options['sync']
        stop_event = threading.Event()

        def _stop(signum, frame):
            self.stdout.write('Stopping Kafka consumer...')
            stop_event.set()

        signal.signal(signal.SIGINT, _stop)
        signal.signal(signal.SIGTERM, _stop)

        self.stdout.write(
            self.style.SUCCESS(
                f'Kafka consumer starting group={group_id} '
                f'topics={list(ALL_DEVICE_TOPICS)} sync={sync} '
                f'servers={getattr(settings, "KAFKA_BOOTSTRAP_SERVERS", [])} '
                f'USE_KAFKA_PIPELINE={getattr(settings, "USE_KAFKA_PIPELINE", True)}'
            )
        )

        def handler(topic, message):
            from apps.devices.tasks import dispatch_kafka_message

            if sync:
                result = dispatch_kafka_message(topic, message)
                self.stdout.write(f'processed topic={topic} result={result}')
            else:
                dispatch_kafka_message.delay(topic, message)
                self.stdout.write(f'enqueued topic={topic} device={message.get("device_id")}')

        consume_topics(
            topics=ALL_DEVICE_TOPICS,
            group_id=group_id,
            handler=handler,
            stop_event=stop_event,
        )
        self.stdout.write(self.style.SUCCESS('Kafka consumer stopped'))
