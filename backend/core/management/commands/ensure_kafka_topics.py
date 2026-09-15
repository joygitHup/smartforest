"""
创建 Kafka 设备主题（若不存在）。
分区数由 KAFKA_NUM_PARTITIONS 控制（默认 6）。
若主题已存在且分区偏少，需手工扩分区或重建主题。
"""
from django.core.management.base import BaseCommand
from django.conf import settings

from core.kafka_client import (
    ALL_DEVICE_TOPICS,
    _bootstrap_servers,
    kafka_num_partitions,
    kafka_replication_factor,
)


class Command(BaseCommand):
    help = 'Ensure Kafka topics for device pipeline exist'

    def handle(self, *args, **options):
        from kafka.admin import KafkaAdminClient, NewTopic
        from kafka.errors import TopicAlreadyExistsError

        servers = _bootstrap_servers()
        partitions = kafka_num_partitions()
        replicas = kafka_replication_factor()
        self.stdout.write(f'Connecting to Kafka: {servers} partitions={partitions} rf={replicas}')
        admin = KafkaAdminClient(
            bootstrap_servers=servers,
            client_id='forest-monitor-admin',
        )
        topics = [
            NewTopic(name=name, num_partitions=partitions, replication_factor=replicas)
            for name in ALL_DEVICE_TOPICS
        ]
        try:
            admin.create_topics(new_topics=topics, validate_only=False)
            self.stdout.write(self.style.SUCCESS(f'Created topics: {list(ALL_DEVICE_TOPICS)}'))
        except TopicAlreadyExistsError:
            self.stdout.write(self.style.WARNING(
                'Topics already exist (partition count not altered). '
                f'Target new-topic partitions={partitions}'
            ))
        except Exception as exc:
            msg = str(exc)
            if 'TopicAlreadyExistsError' in msg or 'already exists' in msg.lower():
                self.stdout.write(self.style.WARNING(f'Topics may already exist: {exc}'))
            else:
                raise
        finally:
            admin.close()

        self.stdout.write(
            f'USE_KAFKA_PIPELINE={getattr(settings, "USE_KAFKA_PIPELINE", True)} '
            f'group={getattr(settings, "KAFKA_CONSUMER_GROUP", "")}'
        )
