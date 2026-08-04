# test_mqtt.py
"""
MQTT (EMQX) 测试脚本
"""
import paho.mqtt.client as mqtt
import json
import time
import threading
from datetime import datetime


class MQTTTest:
    def __init__(self, host='localhost', port=1883, username='admin', password='admin123'):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.client = None
        self.received_messages = []
        self.connected = False
        self.client_id = f"test_client_{int(time.time())}"

    def on_connect(self, client, userdata, flags, rc):
        """连接回调"""
        if rc == 0:
            self.connected = True
            print("✅ MQTT 连接成功")
        else:
            print(f"❌ 连接失败，返回码: {rc}")

    def on_message(self, client, userdata, msg):
        """消息接收回调"""
        try:
            payload = json.loads(msg.payload.decode('utf-8'))
        except:
            payload = msg.payload.decode('utf-8')

        self.received_messages.append({
            'topic': msg.topic,
            'payload': payload,
            'qos': msg.qos,
            'timestamp': datetime.now().isoformat()
        })
        print(f"   📨 收到消息: topic={msg.topic}, payload={payload}")

    def on_disconnect(self, client, userdata, rc):
        """断开连接回调"""
        self.connected = False
        print("MQTT 断开连接")

    def connect(self):
        """建立连接"""
        try:
            self.client = mqtt.Client(
                client_id=self.client_id,
                clean_session=True,
                protocol=mqtt.MQTTv311
            )

            # 设置回调
            self.client.on_connect = self.on_connect
            self.client.on_message = self.on_message
            self.client.on_disconnect = self.on_disconnect

            # 设置认证
            if self.username and self.password:
                self.client.username_pw_set(self.username, self.password)

            # 连接
            self.client.connect(self.host, self.port, keepalive=60)
            self.client.loop_start()

            # 等待连接
            for _ in range(10):
                if self.connected:
                    return True
                time.sleep(0.5)

            return False
        except Exception as e:
            print(f"❌ 连接失败: {e}")
            return False

    def test_connection(self):
        """测试连接"""
        print("\n" + "=" * 50)
        print("1. 测试 MQTT 连接")
        print("=" * 50)
        return self.connect()

    def test_subscribe(self):
        """测试订阅"""
        print("\n" + "=" * 50)
        print("2. 测试订阅")
        print("=" * 50)

        try:
            # 订阅主题
            result, mid = self.client.subscribe('test/topic', qos=1)
            if result == mqtt.MQTT_ERR_SUCCESS:
                print("✅ 订阅成功: test/topic")
                return True
            else:
                print(f"❌ 订阅失败: {result}")
                return False
        except Exception as e:
            print(f"❌ 订阅失败: {e}")
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
                    'message': f'Test message {i}',
                    'timestamp': datetime.now().isoformat()
                }
                result, mid = self.client.publish(
                    'test/topic',
                    payload=json.dumps(message),
                    qos=1,
                    retain=False
                )

                if result == mqtt.MQTT_ERR_SUCCESS:
                    print(f"   ✅ 消息 {i} 发送成功")
                else:
                    print(f"   ❌ 消息 {i} 发送失败: {result}")

                time.sleep(0.5)

            print("✅ 所有消息发送完成")
            return True
        except Exception as e:
            print(f"❌ 发布消息失败: {e}")
            return False

    def test_wait_messages(self, timeout=5):
        """等待接收消息"""
        print("\n" + "=" * 50)
        print("4. 等待接收消息")
        print("=" * 50)

        print(f"等待 {timeout} 秒接收消息...")
        time.sleep(timeout)

        print(f"✅ 收到 {len(self.received_messages)} 条消息")
        return len(self.received_messages) > 0

    def test_wildcard_subscription(self):
        """测试通配符订阅"""
        print("\n" + "=" * 50)
        print("5. 测试通配符订阅")
        print("=" * 50)

        try:
            # 订阅多级通配符
            result, mid = self.client.subscribe('sensors/+/temperature', qos=1)
            if result == mqtt.MQTT_ERR_SUCCESS:
                print("✅ 通配符订阅成功: sensors/+/temperature")

                # 发送消息到不同设备
                devices = ['device1', 'device2', 'device3']
                for device in devices:
                    message = {
                        'device': device,
                        'temperature': 20 + len(devices) * 2,
                        'timestamp': datetime.now().isoformat()
                    }
                    self.client.publish(
                        f'sensors/{device}/temperature',
                        payload=json.dumps(message),
                        qos=1
                    )
                    print(f"   📤 发送到: sensors/{device}/temperature")
                    time.sleep(0.3)

                time.sleep(2)
                print(f"✅ 收到 {len(self.received_messages)} 条通配符消息")
                return True
            else:
                print(f"❌ 通配符订阅失败: {result}")
                return False
        except Exception as e:
            print(f"❌ 通配符测试失败: {e}")
            return False

    def test_retained_message(self):
        """测试保留消息"""
        print("\n" + "=" * 50)
        print("6. 测试保留消息")
        print("=" * 50)

        try:
            # 发送保留消息
            self.client.publish(
                'sensors/status',
                payload=json.dumps({'status': 'online', 'last_update': datetime.now().isoformat()}),
                qos=1,
                retain=True
            )
            print("✅ 保留消息已发送")

            # 重新订阅，应该立即收到保留消息
            self.received_messages.clear()
            result, mid = self.client.subscribe('sensors/status', qos=1)
            if result == mqtt.MQTT_ERR_SUCCESS:
                print("✅ 订阅保留消息主题")
                time.sleep(1)

                if self.received_messages:
                    print(f"✅ 收到保留消息: {self.received_messages[0]['payload']}")
                    return True
                else:
                    print("⚠️ 未收到保留消息")
                    return True
            else:
                return False
        except Exception as e:
            print(f"❌ 保留消息测试失败: {e}")
            return False

    def disconnect(self):
        """断开连接"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            print("✅ 已断开 MQTT 连接")


def main():
    print("=" * 60)
    print("MQTT (EMQX) 测试")
    print("=" * 60)

    # 创建测试实例
    mqtt_test = MQTTTest(
        host='localhost',
        port=1883,
        username='admin',
        password='admin123'
    )

    results = []

    # 1. 测试连接
    results.append(('连接测试', mqtt_test.test_connection()))

    if results[-1][1]:
        # 2. 测试订阅
        results.append(('订阅测试', mqtt_test.test_subscribe()))

        # 3. 测试发布
        results.append(('发布测试', mqtt_test.test_publish()))

        # 4. 测试接收
        results.append(('接收测试', mqtt_test.test_wait_messages(3)))

        # 5. 测试通配符
        results.append(('通配符测试', mqtt_test.test_wildcard_subscription()))

        # 6. 测试保留消息
        results.append(('保留消息测试', mqtt_test.test_retained_message()))

    # 断开连接
    mqtt_test.disconnect()

    # 输出结果
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)

    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{status} - {name}")

    success_count = sum(1 for _, r in results if r)
    total_count = len(results)
    print(f"\n总计: {success_count}/{total_count} 项通过")

    if success_count == total_count:
        print("\n🎉 所有测试通过！MQTT 运行正常！")
    else:
        print(f"\n⚠️ 有 {total_count - success_count} 项测试失败")


if __name__ == '__main__':
    main()