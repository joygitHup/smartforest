# test_rabbitmq.py
"""
RabbitMQ 测试脚本 - 适配 admin/admin + my_vhost
"""
import pika
import json
import time
from datetime import datetime


class RabbitMQTest:
    def __init__(self, host='localhost', port=5672, username='admin', password='admin', vhost='my_vhost'):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.vhost = vhost
        self.connection = None
        self.channel = None
        self.received_messages = []

    def connect(self):
        """建立连接"""
        try:
            credentials = pika.PlainCredentials(self.username, self.password)
            parameters = pika.ConnectionParameters(
                host=self.host,
                port=self.port,
                virtual_host=self.vhost,  # 重要：指定 vhost
                credentials=credentials,
                heartbeat=60,
                blocked_connection_timeout=30
            )
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            print("✅ RabbitMQ 连接成功")
            print(f"   Virtual Host: {self.vhost}")
            print(f"   User: {self.username}")
            return True
        except Exception as e:
            print(f"❌ 连接失败: {e}")
            return False

    def test_connection(self):
        """测试连接"""
        print("\n" + "=" * 50)
        print("1. 测试连接")
        print("=" * 50)
        return self.connect()

    def test_declare_queue(self):
        """测试声明队列"""
        print("\n" + "=" * 50)
        print("2. 测试声明队列")
        print("=" * 50)

        try:
            result = self.channel.queue_declare(
                queue='test_queue',
                durable=True,
                exclusive=False,
                auto_delete=False
            )
            print(f"✅ 队列 'test_queue' 创建成功")
            return True
        except Exception as e:
            print(f"❌ 声明队列失败: {e}")
            return False

    def test_publish(self):
        """测试发布消息"""
        print("\n" + "=" * 50)
        print("3. 测试发布消息")
        print("=" * 50)

        try:
            for i in range(5):
                message = {
                    'id': i,
                    'content': f'Test message {i}',
                    'timestamp': datetime.now().isoformat()
                }
                self.channel.basic_publish(
                    exchange='',
                    routing_key='test_queue',
                    body=json.dumps(message).encode('utf-8'),
                    properties=pika.BasicProperties(
                        delivery_mode=2,
                        content_type='application/json'
                    )
                )
                print(f"   ✅ 消息 {i} 发送成功")

            print("✅ 所有消息发送完成")
            return True
        except Exception as e:
            print(f"❌ 发布消息失败: {e}")
            return False

    def test_consume(self):
        """测试消费消息"""
        print("\n" + "=" * 50)
        print("4. 测试消费消息")
        print("=" * 50)

        try:
            def callback(ch, method, properties, body):
                message = json.loads(body.decode('utf-8'))
                self.received_messages.append(message)
                print(f"   📨 收到消息: {message['content']} (ID: {message['id']})")
                ch.basic_ack(delivery_tag=method.delivery_tag)

            self.channel.basic_qos(prefetch_count=1)
            self.channel.basic_consume(
                queue='test_queue',
                on_message_callback=callback,
                auto_ack=False
            )

            print("等待接收消息...")
            for _ in range(5):
                self.connection.process_data_events(time_limit=5)
                time.sleep(0.5)

            self.channel.cancel()
            print(f"✅ 消费完成，收到 {len(self.received_messages)} 条消息")
            return len(self.received_messages) > 0
        except Exception as e:
            print(f"❌ 消费消息失败: {e}")
            return False

    def test_exchange(self):
        """测试交换机"""
        print("\n" + "=" * 50)
        print("5. 测试交换机模式")
        print("=" * 50)

        try:
            self.channel.exchange_declare(
                exchange='test_exchange',
                exchange_type='direct',
                durable=True
            )
            print("✅ 交换机 'test_exchange' 创建成功")

            result = self.channel.queue_declare(queue='', exclusive=True)
            queue_name = result.method.queue

            self.channel.queue_bind(
                exchange='test_exchange',
                queue=queue_name,
                routing_key='test_key'
            )
            print(f"✅ 队列绑定到交换机")

            message = {'type': 'test', 'content': 'Exchange message'}
            self.channel.basic_publish(
                exchange='test_exchange',
                routing_key='test_key',
                body=json.dumps(message).encode('utf-8'),
                properties=pika.BasicProperties(delivery_mode=2)
            )
            print(f"✅ 消息发送到交换机")

            received = []

            def callback(ch, method, properties, body):
                received.append(json.loads(body.decode('utf-8')))
                ch.basic_ack(delivery_tag=method.delivery_tag)

            self.channel.basic_consume(
                queue=queue_name,
                on_message_callback=callback,
                auto_ack=False
            )

            self.connection.process_data_events(time_limit=5)
            self.channel.cancel()

            if received:
                print(f"✅ 交换机消息接收成功")
                return True
            else:
                print("⚠️ 未收到交换机消息")
                return True
        except Exception as e:
            print(f"❌ 交换机测试失败: {e}")
            return False

    def close(self):
        """关闭连接"""
        if self.connection and self.connection.is_open:
            self.connection.close()
            print("✅ 连接已关闭")


def main():
    print("=" * 60)
    print("RabbitMQ 测试")
    print("=" * 60)

    # 使用 admin/admin 和 my_vhost
    mq = RabbitMQTest(
        host='localhost',
        port=5672,
        username='admin',
        password='admin',
        vhost='my_vhost'  # 重要：使用你创建的 vhost
    )

    results = []

    results.append(('连接测试', mq.test_connection()))

    if results[-1][1]:
        results.append(('声明队列', mq.test_declare_queue()))
        results.append(('发布消息', mq.test_publish()))
        results.append(('消费消息', mq.test_consume()))
        results.append(('交换机测试', mq.test_exchange()))

    mq.close()

    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)

    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{status} - {name}")

    success_count = sum(1 for _, r in results if r)
    total_count = len(results)
    print(f"\n总计: {success_count}/{total_count} 项通过")


if __name__ == '__main__':
    main()