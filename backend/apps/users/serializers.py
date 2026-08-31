# apps/users/serializers.py
"""
User serializers for API.
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.validators import EmailValidator
from .models import Notification

User = get_user_model()

# 角色选择（与 models.py 保持一致）
ROLE_CHOICES = [
    ('admin', '系统管理员'),
    ('operator', '运维人员'),
    ('forester', '护林员'),
    ('viewer', '查看者'),
]


class UserListSerializer(serializers.ModelSerializer):
    """用户列表序列化器"""
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    full_name = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'first_name', 'last_name',
            'email', 'phone', 'role', 'role_display',
            'department', 'region', 'is_active', 'is_staff', 'is_superuser',
            'last_login', 'date_joined', 'created_at', 'unread_count'
        ]

    def get_full_name(self, obj):
        """获取全名"""
        if obj.first_name or obj.last_name:
            return f"{obj.last_name}{obj.first_name}".strip()
        return obj.username

    def get_unread_count(self, obj):
        """获取未读通知数量"""
        return obj.notifications.filter(is_read=False).count()


class UserDetailSerializer(serializers.ModelSerializer):
    """用户详情序列化器"""
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    full_name = serializers.SerializerMethodField()
    unread_notification_count = serializers.SerializerMethodField()
    recent_notifications = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = '__all__'

    def get_full_name(self, obj):
        """获取全名"""
        if obj.first_name or obj.last_name:
            return f"{obj.last_name}{obj.first_name}".strip()
        return obj.username

    def get_unread_notification_count(self, obj):
        """获取未读通知数量"""
        return obj.notifications.filter(is_read=False).count()

    def get_recent_notifications(self, obj):
        """获取最近5条通知"""
        notifications = obj.notifications.all()[:5]
        return NotificationListSerializer(notifications, many=True).data


class UserCreateSerializer(serializers.ModelSerializer):
    """创建用户序列化器"""
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True, required=True)
    role = serializers.ChoiceField(choices=ROLE_CHOICES, default='viewer')

    class Meta:
        model = User
        fields = [
            'username', 'password', 'confirm_password',
            'first_name', 'last_name', 'email', 'phone',
            'role', 'department', 'region',
            'badge_number', 'patrol_zone',
            'is_active', 'is_staff', 'is_superuser'
        ]

    def validate(self, data):
        """验证密码是否一致"""
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': '两次输入的密码不一致'})
        return data

    def validate_username(self, value):
        """验证用户名唯一性"""
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('用户名已存在')
        return value

    def validate_email(self, value):
        """验证邮箱格式"""
        if value and User.objects.filter(email=value).exists():
            raise serializers.ValidationError('邮箱已被使用')
        return value

    def validate_phone(self, value):
        """验证手机号格式"""
        if value and not value.isdigit():
            raise serializers.ValidationError('手机号只能包含数字')
        return value

    def create(self, validated_data):
        """创建用户"""
        validated_data.pop('confirm_password')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """更新用户序列化器"""
    username = serializers.CharField(read_only=True)
    password = serializers.CharField(write_only=True, required=False, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True, required=False)
    role = serializers.ChoiceField(choices=ROLE_CHOICES, required=False)

    class Meta:
        model = User
        fields = [
            'username', 'password', 'confirm_password',
            'first_name', 'last_name', 'email', 'phone',
            'role', 'department', 'region',
            'badge_number', 'patrol_zone',
            'is_active', 'is_staff', 'is_superuser'
        ]

    def validate(self, data):
        """验证密码是否一致"""
        if 'password' in data or 'confirm_password' in data:
            password = data.get('password')
            confirm_password = data.get('confirm_password')
            if password != confirm_password:
                raise serializers.ValidationError({'confirm_password': '两次输入的密码不一致'})
        return data

    def update(self, instance, validated_data):
        """更新用户"""
        password = validated_data.pop('password', None)
        validated_data.pop('confirm_password', None)

        if password:
            instance.set_password(password)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance


class UserProfileSerializer(serializers.ModelSerializer):
    """用户个人资料序列化器"""
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'first_name', 'last_name',
            'email', 'phone', 'role', 'role_display',
            'department', 'region', 'badge_number', 'patrol_zone',
            'last_login', 'date_joined'
        ]
        read_only_fields = ['username', 'last_login', 'date_joined']

    def get_full_name(self, obj):
        """获取全名"""
        if obj.first_name or obj.last_name:
            return f"{obj.last_name}{obj.first_name}".strip()
        return obj.username


class UserChangePasswordSerializer(serializers.Serializer):
    """用户修改密码序列化器"""
    old_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True, required=True)

    def validate(self, data):
        """验证密码是否一致"""
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': '两次输入的密码不一致'})
        return data

    def validate_old_password(self, value):
        """验证旧密码"""
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('旧密码错误')
        return value


class UserBatchDeleteSerializer(serializers.Serializer):
    """批量删除用户序列化器"""
    user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='要删除的用户ID列表'
    )


class UserRoleChangeSerializer(serializers.Serializer):
    """用户角色变更序列化器"""
    role = serializers.ChoiceField(choices=ROLE_CHOICES)


class NotificationListSerializer(serializers.ModelSerializer):
    """通知列表序列化器"""
    notification_type_display = serializers.CharField(
        source='get_notification_type_display',
        read_only=True
    )
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'user', 'username', 'notification_type', 'notification_type_display',
            'title', 'content', 'alert_id', 'device_id',
            'is_read', 'read_at', 'created_at'
        ]


class NotificationDetailSerializer(serializers.ModelSerializer):
    """通知详情序列化器"""
    notification_type_display = serializers.CharField(
        source='get_notification_type_display',
        read_only=True
    )
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Notification
        fields = '__all__'


class NotificationCreateSerializer(serializers.ModelSerializer):
    """创建通知序列化器"""

    class Meta:
        model = Notification
        fields = [
            'user', 'notification_type', 'title', 'content',
            'alert_id', 'device_id'
        ]


class NotificationMarkReadSerializer(serializers.Serializer):
    """标记通知已读序列化器"""
    notification_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text='要标记为已读的通知ID列表，不传则标记所有'
    )