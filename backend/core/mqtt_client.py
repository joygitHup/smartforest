"""
MQTT client for device communication.
"""
import paho.mqtt.client as mqtt
import json
import logging
from django.conf import settings
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


class MQTTClient:
    """MQTT 客户端"""
    
    def __init__(self):
        self.client = mqtt.Client(
            client_id=settings.MQTT_CONFIG['CLIENT_ID'],
            protocol=mqtt.MQTTv311
        )
        self.client.username_pw_set(
            settings.MQTT_CONFIG['USERNAME'],
            settings.MQTT_CONFIG['PASSWORD']
        )
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message
        
        self.channel_layer = get_channel_layer()
    
    def on_connect(self, client, userdata, flags, rc):
        """连接成功回调"""
        logger.info(f'MQTT connected with result code {rc}')
        
        # 订阅设备上报主题
        client.subscribe('device/+/telemetry', qos=1)
        client.subscribe('device/+/alert', qos=1)
        client.subscribe('device/+/status', qos=1)
        client.subscribe('device/+/response', qos=1)
    
    def on_disconnect(self, client, userdata, rc):
        """断开连接回调"""
        logger.warning(f'MQTT disconnected with result code {rc}')
        if rc != 0:
            logger.info('Unexpected disconnection. Trying to reconnect...')
            try:
                client.reconnect()
            except Exception as e:
                logger.error(f'Reconnect failed: {e}')
    
    def on_message(self, client, userdata, msg):
        """消息接收回调"""
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())
            
            # 解析设备ID
            parts = topic.split('/')
            if len(parts) >= 3:
                device_id = parts[1]
                message_type = parts[2]
                
                # 处理不同类型的消息
                if message_type == 'telemetry':
                    self.handle_telemetry(device_id, payload)
                elif message_type == 'alert':
                    self.handle_alert(device_id, payload)
                elif message_type == 'status':
                    self.handle_status(device_id, payload)
                elif message_type == 'response':
                    self.handle_response(device_id, payload)
        
        except Exception as e:
            logger.error(f'Error processing MQTT message: {e}')
    
    def handle_telemetry(self, device_id, payload):
        """处理遥测数据"""
        logger.info(f'Received telemetry from {device_id}')
        
        # 异步处理遥测数据
        from apps.devices.tasks import process_device_telemetry
        process_device_telemetry.delay(device_id, payload)
        
        # WebSocket 推送
        async_to_sync(self.channel_layer.group_send)(
            'dashboard',
            {
                'type': 'telemetry_update',
                'data': {
                    'device_id': device_id,
                    'telemetry': payload
                }
            }
        )
    
    def handle_alert(self, device_id, payload):
        """处理告警"""
        logger.info(f'Received alert from {device_id}')
        
        # 异步处理告警
        from apps.alerts.tasks import process_alert
        alert_data = {
            'device_id': device_id,
            **payload
        }
        process_alert.delay(alert_data)
        
        # WebSocket 推送
        async_to_sync(self.channel_layer.group_send)(
            'dashboard',
            {
                'type': 'alert_notification',
                'data': {
                    'device_id': device_id,
                    'alert': payload
                }
            }
        )
    
    def handle_status(self, device_id, payload):
        """处理设备状态"""
        logger.info(f'Received status from {device_id}')
        
        # 异步更新设备状态
        from apps.devices.tasks import update_device_status
        status = payload.get('status', 'offline')
        last_online_time = payload.get('timestamp')
        update_device_status.delay(device_id, status, last_online_time)
        
        # WebSocket 推送
        async_to_sync(self.channel_layer.group_send)(
            'dashboard',
            {
                'type': 'device_status_update',
                'data': {
                    'device_id': device_id,
                    'status': payload
                }
            }
        )
    
    def handle_response(self, device_id, payload):
        """处理设备指令响应"""
        logger.info(f'Received response from {device_id}')
        
        # WebSocket 推送到设备房间
        async_to_sync(self.channel_layer.group_send)(
            f'device_{device_id}',
            {
                'type': 'device_response',
                'data': payload
            }
        )
    
    def connect(self):
        """连接 MQTT Broker"""
        try:
            self.client.connect(
                settings.MQTT_CONFIG['BROKER_HOST'],
                settings.MQTT_CONFIG['BROKER_PORT'],
                keepalive=60
            )
            self.client.loop_start()
            logger.info('MQTT client started')
        except Exception as e:
            logger.error(f'Failed to connect to MQTT broker: {e}')
            raise
    
    def disconnect(self):
        """断开 MQTT 连接"""
        self.client.loop_stop()
        self.client.disconnect()
        logger.info('MQTT client stopped')
    
    def publish_command(self, device_id, command_type, params):
        """发布设备指令"""
        topic = f'device/{device_id}/command'
        payload = {
            'command_type': command_type,
            'params': params,
            'timestamp': __import__('django.utils', fromlist=['timezone']).timezone.now().isoformat()
        }
        
        result = self.client.publish(
            topic,
            json.dumps(payload),
            qos=settings.MQTT_CONFIG['QOS']
        )
        
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            logger.info(f'Command published to {device_id}: {command_type}')
            return True
        else:
            logger.error(f'Failed to publish command: {result.rc}')
            return False


# 全局 MQTT 客户端实例
mqtt_client = None


def get_mqtt_client():
    """获取 MQTT 客户端实例"""
    global mqtt_client
    if mqtt_client is None:
        mqtt_client = MQTTClient()
    return mqtt_client


def publish_command(device_id, command_type, params):
    """发布设备指令（便捷函数）"""
    client = get_mqtt_client()
    return client.publish_command(device_id, command_type, params)
