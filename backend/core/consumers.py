"""
WebSocket consumers for real-time communication.
"""
import json
from channels.generic.websocket import AsyncWebSocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken
from django.contrib.auth import get_user_model

User = get_user_model()


class DashboardConsumer(AsyncWebSocketConsumer):
    """指挥中心大屏 WebSocket 消费者"""
    
    async def connect(self):
        """连接处理"""
        # 验证用户
        self.user = await self.get_user_from_token()
        
        if isinstance(self.user, AnonymousUser) or not self.user:
            await self.close()
            return
        
        # 加入大屏组
        self.group_name = 'dashboard'
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # 发送欢迎消息
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'message': 'Connected to dashboard'
        }))
    
    async def disconnect(self, close_code):
        """断开连接处理"""
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """接收消息处理"""
        data = json.loads(text_data)
        message_type = data.get('type')
        
        if message_type == 'ping':
            await self.send(text_data=json.dumps({
                'type': 'pong'
            }))
    
    # 事件处理方法
    
    async def alert_notification(self, event):
        """告警通知推送"""
        await self.send(text_data=json.dumps({
            'type': 'alert',
            'data': event['data']
        }))
    
    async def device_status_update(self, event):
        """设备状态更新推送"""
        await self.send(text_data=json.dumps({
            'type': 'device_status',
            'data': event['data']
        }))
    
    async def telemetry_update(self, event):
        """遥测数据更新推送"""
        await self.send(text_data=json.dumps({
            'type': 'telemetry',
            'data': event['data']
        }))
    
    async def fire_tracing_update(self, event):
        """火情溯源更新推送"""
        await self.send(text_data=json.dumps({
            'type': 'fire_tracing',
            'data': event['data']
        }))
    
    @database_sync_to_async
    def get_user_from_token(self):
        """从 JWT token 获取用户"""
        try:
            # 从 query string 获取 token
            query_string = self.scope.get('query_string', b'').decode()
            params = dict(param.split('=') for param in query_string.split('&') if '=' in param)
            token = params.get('token')
            
            if not token:
                return AnonymousUser()
            
            # 验证 token
            access_token = AccessToken(token)
            user_id = access_token['user_id']
            return User.objects.get(id=user_id)
        except Exception:
            return AnonymousUser()


class DeviceCommandConsumer(AsyncWebSocketConsumer):
    """设备指令 WebSocket 消费者"""
    
    async def connect(self):
        """连接处理"""
        self.user = await self.get_user_from_token()
        
        if isinstance(self.user, AnonymousUser) or not self.user:
            await self.close()
            return
        
        # 获取设备ID
        self.device_id = self.scope['url_route']['kwargs']['device_id']
        self.group_name = f'device_{self.device_id}'
        
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )
        
        await self.accept()
    
    async def disconnect(self, close_code):
        """断开连接处理"""
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """接收消息处理"""
        data = json.loads(text_data)
        
        # 发送指令到设备
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'device_command',
                'command': data
            }
        )
    
    async def device_command(self, event):
        """设备指令推送"""
        await self.send(text_data=json.dumps({
            'type': 'command',
            'data': event['command']
        }))
    
    async def device_response(self, event):
        """设备响应推送"""
        await self.send(text_data=json.dumps({
            'type': 'response',
            'data': event['data']
        }))
    
    @database_sync_to_async
    def get_user_from_token(self):
        """从 JWT token 获取用户"""
        try:
            query_string = self.scope.get('query_string', b'').decode()
            params = dict(param.split('=') for param in query_string.split('&') if '=' in param)
            token = params.get('token')
            
            if not token:
                return AnonymousUser()
            
            access_token = AccessToken(token)
            user_id = access_token['user_id']
            return User.objects.get(id=user_id)
        except Exception:
            return AnonymousUser()
