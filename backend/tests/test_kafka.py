# test_kafka.py
"""
Kafka 本地测试脚本（修复版）
"""
from kafka import KafkaProducer, KafkaConsumer
from kafka.admin import KafkaAdminClient
from kafka.errors import KafkaError
import json
import time
import sys


def test_kafka_connection():
    """测试 Kafka 连接"""
    try:
        admin = KafkaAdminClient(
            bootstrap_servers=['localhost:9092'],
            request_timeout_ms=5000
        )

        # 获取集群信息 - 修复：list_topics() 返回的是对象
        topics = admin.list_topics()
        topic_list = list(topics) if hasattr(topics, '__iter__') else []
        print(f"✅ 连接成功！集群有 {len(topic_list)} 个 topic")

        if len(topic_list) > 0:
            print(f"   Topics: {topic_list[:10]}")
        else:
            print("   ⚠️ 当前没有 topic")

        admin.close()
        return True

    except Exception as e:
        print(f"❌ 连接失败: {e}")
        return False


def test_producer():
    """测试生产者"""
    try:
        producer = KafkaProducer(
            bootstrap_servers=['localhost:9092'],
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            acks='all',
            retries=3,
            max_block_ms=10000
        )

        print("✅ Kafka 生产者连接成功")

        # 发送测试消息
        for i in range(5):
            message = {
                'id': i,
                'message': f'Test message {i}',
                'timestamp': time.time()
            }
            future = producer.send('test-topic', value=message)
            result = future.get(timeout=10)
            print(f"   ✅ 消息 {i} 发送成功: partition={result.partition}, offset={result.offset}")

        producer.flush()
        producer.close()
        return True

    except Exception as e:
        print(f"❌ 生产者错误: {e}")
        return False


def test_consumer():
    """测试消费者"""
    try:
        consumer = KafkaConsumer(
            'test-topic',
            bootstrap_servers=['localhost:9092'],
            auto_offset_reset='earliest',
            enable_auto_commit=True,
            group_id='test-group',
            value_deserializer=lambda v: json.loads(v.decode('utf-8')),
            max_poll_records=10,
            consumer_timeout_ms=5000
        )

        print("✅ Kafka 消费者连接成功")
        print("等待接收消息...")

        messages_received = 0
        for msg in consumer:
            print(f"   📨 收到消息: {msg.value}")
            messages_received += 1
            if messages_received >= 5:
                break

        consumer.close()
        return messages_received > 0

    except Exception as e:
        print(f"❌ 消费者错误: {e}")
        return False


def create_topic_if_not_exists():
    """检查并创建 topic"""
    try:
        from kafka.admin import KafkaAdminClient, NewTopic
        from kafka.errors import TopicAlreadyExistsError

        admin = KafkaAdminClient(
            bootstrap_servers=['localhost:9092'],
            request_timeout_ms=10000
        )

        # 获取现有 topics
        existing_topics = list(admin.list_topics())
        print(f"📋 现有 topics: {existing_topics}")

        if 'test-topic' not in existing_topics:
            print("   ⚠️ test-topic 不存在，正在创建...")
            try:
                new_topic = NewTopic(
                    name='test-topic',
                    num_partitions=3,
                    replication_factor=1
                )
                admin.create_topics([new_topic])
                print("   ✅ test-topic 创建成功")
            except TopicAlreadyExistsError:
                print("   ℹ️ topic 已存在")
            except Exception as e:
                print(f"   ❌ 创建 topic 失败: {e}")
        else:
            print("   ✅ test-topic 已存在")

        admin.close()
        return True

    except Exception as e:
        print(f"❌ 操作失败: {e}")
        return False


def test_simple():
    """简化版测试（最快）"""
    print("\n" + "=" * 50)
    print("简化版 Kafka 测试")
    print("=" * 50)

    try:
        # 1. 发送消息
        print("\n1. 发送消息...")
        producer = KafkaProducer(
            bootstrap_servers=['localhost:9092'],
            value_serializer=lambda x: json.dumps(x).encode('utf-8')
        )
        producer.send('test-topic', {'msg': 'Hello Kafka!'})
        producer.flush()
        producer.close()
        print("   ✅ 消息发送成功")
    except Exception as e:
        print(f"   ❌ 发送失败: {e}")
        return False

    time.sleep(1)

    try:
        # 2. 接收消息
        print("\n2. 接收消息...")
        consumer = KafkaConsumer(
            'test-topic',
            bootstrap_servers=['localhost:9092'],
            auto_offset_reset='earliest',
            value_deserializer=lambda x: json.loads(x.decode('utf-8')),
            consumer_timeout_ms=3000
        )

        received = False
        for msg in consumer:
            print(f"   📨 收到: {msg.value}")
            received = True
            break

        consumer.close()

        if received:
            print("   ✅ 接收成功")
        else:
            print("   ⚠️ 没有收到消息（topic 可能为空）")

        return True

    except Exception as e:
        print(f"   ❌ 接收失败: {e}")
        return False


def main():
    print("=" * 60)
    print("Kafka 本地测试")
    print("=" * 60)

    # 0. 检查连接
    print("\n0. 检查 Kafka 连接...")
    if not test_kafka_connection():
        print("❌ Kafka 连接失败，请确保服务已启动")
        print("   启动命令: docker-compose up -d")
        return

    # 1. 创建 topic
    print("\n1. 检查 topic...")
    if not create_topic_if_not_exists():
        print("⚠️ topic 操作失败，继续尝试...")

    # 2. 测试生产者
    print("\n2. 测试生产者...")
    if test_producer():
        print("✅ 生产者测试通过")
    else:
        print("❌ 生产者测试失败")
        return

    # 等待消息到达
    time.sleep(2)

    # 3. 测试消费者
    print("\n3. 测试消费者...")
    if test_consumer():
        print("✅ 消费者测试通过")
    else:
        print("❌ 消费者测试失败")

    print("\n" + "=" * 60)
    print("测试完成！")
    print("=" * 60)


if __name__ == '__main__':
    main()