"""
Kafka 生产者 / 消费者封装。

Topic 约定：
- forest.device.telemetry
- forest.device.alert
- forest.device.status
- forest.device.response

分区键：device_id（保证同设备有序）。
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable, Iterable

from django.conf import settings

logger = logging.getLogger(__name__)

TOPIC_TELEMETRY = 'forest.device.telemetry'
TOPIC_ALERT = 'forest.device.alert'
TOPIC_STATUS = 'forest.device.status'
TOPIC_RESPONSE = 'forest.device.response'

ALL_DEVICE_TOPICS = (TOPIC_TELEMETRY, TOPIC_ALERT, TOPIC_STATUS, TOPIC_RESPONSE)

_shared_producer = None


def _bootstrap_servers() -> list[str]:
    servers = getattr(settings, 'KAFKA_BOOTSTRAP_SERVERS', ['localhost:9092'])
    if isinstance(servers, str):
        return [s.strip() for s in servers.split(',') if s.strip()]
    return [s.strip() for s in servers if s and str(s).strip()]


def kafka_num_partitions() -> int:
    return int(getattr(settings, 'KAFKA_NUM_PARTITIONS', 6) or 6)


def kafka_replication_factor() -> int:
    return int(getattr(settings, 'KAFKA_REPLICATION_FACTOR', 1) or 1)


def check_kafka_health(timeout_ms: int = 5000) -> dict[str, Any]:
    """探测 Kafka 是否可连接，并返回主题列表摘要。"""
    servers = _bootstrap_servers()
    result: dict[str, Any] = {
        'ok': False,
        'bootstrap_servers': servers,
        'use_kafka_pipeline': bool(getattr(settings, 'USE_KAFKA_PIPELINE', True)),
        'consumer_group': getattr(settings, 'KAFKA_CONSUMER_GROUP', ''),
        'topics': list(ALL_DEVICE_TOPICS),
        'num_partitions': kafka_num_partitions(),
        'existing_topics': [],
        'error': None,
    }
    try:
        from kafka.admin import KafkaAdminClient

        admin = KafkaAdminClient(
            bootstrap_servers=servers,
            client_id='forest-monitor-health',
            request_timeout_ms=timeout_ms,
        )
        try:
            existing = sorted(admin.list_topics())
            result['existing_topics'] = [t for t in existing if t.startswith('forest.')]
            missing = [t for t in ALL_DEVICE_TOPICS if t not in existing]
            result['missing_topics'] = missing
            result['ok'] = True
        finally:
            admin.close()
    except Exception as exc:
        result['error'] = str(exc)
        logger.warning('Kafka health check failed: %s', exc)
    return result


def get_producer(*, shared: bool = True):
    """获取 KafkaProducer；默认进程内复用，利于 linger 批量发送。"""
    global _shared_producer
    from kafka import KafkaProducer

    if shared and _shared_producer is not None:
        return _shared_producer

    acks = getattr(settings, 'KAFKA_PRODUCER_ACKS', '1')
    linger_ms = int(getattr(settings, 'KAFKA_PRODUCER_LINGER_MS', 50) or 50)
    batch_size = int(getattr(settings, 'KAFKA_PRODUCER_BATCH_SIZE', 32768) or 32768)
    compression = getattr(settings, 'KAFKA_COMPRESSION_TYPE', 'lz4') or None

    kwargs: dict[str, Any] = {
        'bootstrap_servers': _bootstrap_servers(),
        'value_serializer': lambda v: json.dumps(v, ensure_ascii=False, default=str).encode('utf-8'),
        'key_serializer': lambda k: k.encode('utf-8') if k else None,
        'acks': acks,
        'retries': 3,
        'linger_ms': linger_ms,
        'batch_size': batch_size,
        'request_timeout_ms': 15000,
    }
    if compression and compression != 'none':
        kwargs['compression_type'] = compression

    producer = KafkaProducer(**kwargs)
    if shared:
        _shared_producer = producer
    return producer


def publish_device_event(
    message_type: str,
    device_id: str,
    payload: dict[str, Any],
    mqtt_topic: str | None = None,
    producer=None,
    *,
    wait: bool | None = None,
) -> bool:
    """
    发布设备事件到 Kafka。
    key=device_id → 同设备进入同一分区，保证顺序。
    wait: 是否同步等待 ack；默认遥测/状态异步，告警/响应同步。
    """
    topic_map = {
        'telemetry': TOPIC_TELEMETRY,
        'alert': TOPIC_ALERT,
        'status': TOPIC_STATUS,
        'response': TOPIC_RESPONSE,
        'ack': TOPIC_RESPONSE,
        'command_ack': TOPIC_RESPONSE,
    }
    topic = topic_map.get(message_type)
    if not topic:
        logger.error('Unknown message_type for Kafka: %s', message_type)
        return False

    from django.utils import timezone

    envelope = {
        'device_id': device_id,
        'message_type': message_type,
        'payload': payload,
        'mqtt_topic': mqtt_topic or f'device/{device_id}/{message_type}',
        'received_at': timezone.now().isoformat(),
    }

    if wait is None:
        wait = message_type in ('alert', 'response', 'ack', 'command_ack')

    own_producer = producer is None and not getattr(settings, 'KAFKA_SHARED_PRODUCER', True)
    prod = None
    try:
        if producer is not None:
            prod = producer
        elif getattr(settings, 'KAFKA_SHARED_PRODUCER', True):
            prod = get_producer(shared=True)
        else:
            prod = get_producer(shared=False)
            own_producer = True

        future = prod.send(topic, key=device_id, value=envelope)
        if wait:
            future.get(timeout=10)
        if own_producer:
            prod.flush(timeout=5)
            prod.close()
        logger.debug('Kafka published topic=%s device=%s type=%s wait=%s', topic, device_id, message_type, wait)
        return True
    except Exception as exc:
        logger.exception('Kafka publish failed: %s', exc)
        if own_producer and prod is not None:
            try:
                prod.close()
            except Exception:
                pass
        return False


def consume_topics(
    topics: Iterable[str],
    group_id: str,
    handler: Callable[[str, dict[str, Any]], None],
    stop_event=None,
    max_messages: int | None = None,
    idle_timeout_seconds: float | None = None,
    auto_offset_reset: str | None = None,
):
    """
    阻塞消费 Kafka 主题。
    handler(topic, message_dict)
    """
    from kafka import KafkaConsumer
    import time

    max_poll = int(getattr(settings, 'KAFKA_MAX_POLL_RECORDS', 100) or 100)
    consumer = KafkaConsumer(
        *topics,
        bootstrap_servers=_bootstrap_servers(),
        group_id=group_id,
        enable_auto_commit=False,
        auto_offset_reset=auto_offset_reset
        or getattr(settings, 'KAFKA_AUTO_OFFSET_RESET', 'latest'),
        value_deserializer=lambda v: json.loads(v.decode('utf-8')),
        key_deserializer=lambda k: k.decode('utf-8') if k else None,
        consumer_timeout_ms=1000,
        request_timeout_ms=30000,
        max_poll_records=max_poll,
        fetch_min_bytes=1,
        fetch_max_wait_ms=500,
    )
    logger.info(
        'Kafka consumer started group=%s topics=%s servers=%s max_poll=%s',
        group_id,
        list(topics),
        _bootstrap_servers(),
        max_poll,
    )

    handled = 0
    idle_started = time.monotonic()
    try:
        while True:
            if stop_event is not None and stop_event.is_set():
                break
            if max_messages is not None and handled >= max_messages:
                break
            if (
                idle_timeout_seconds is not None
                and (time.monotonic() - idle_started) >= idle_timeout_seconds
            ):
                logger.info('Kafka consumer idle timeout after %ss', idle_timeout_seconds)
                break
            records = consumer.poll(timeout_ms=1000)
            if not records:
                continue
            idle_started = time.monotonic()
            batch_ok = True
            for _tp, messages in records.items():
                for msg in messages:
                    try:
                        value = msg.value if isinstance(msg.value, dict) else {}
                        handler(msg.topic, value)
                        handled += 1
                        if max_messages is not None and handled >= max_messages:
                            break
                    except Exception as exc:
                        batch_ok = False
                        logger.exception('Kafka handler error: %s', exc)
                if max_messages is not None and handled >= max_messages:
                    break
            if batch_ok:
                try:
                    consumer.commit()
                except Exception as commit_exc:
                    logger.warning('Kafka commit failed: %s', commit_exc)
    finally:
        consumer.close()
        logger.info('Kafka consumer stopped handled=%s', handled)
    return handled
