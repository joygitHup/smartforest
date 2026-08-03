"""
User serializers for API.
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Notification

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """用户序列化器"""
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'phone', 'department', 'region',
            'badge_number', 'patrol_zone', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class UserCreateSerializer(serializers.ModelSerializer):
    """用户创建序列化器"""
    password = serializers.CharField(write_only=True, min_length=8)
    
    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'first_name', 'last_name',
            'role', 'phone', 'department', 'region',
            'badge_number', 'patrol_zone'
        ]
    
    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class NotificationSerializer(serializers.ModelSerializer):
    """通知序列化器"""
    class Meta:
        model = Notification
        fields = '__all__'
        read_only_fields = ['user', 'created_at']
