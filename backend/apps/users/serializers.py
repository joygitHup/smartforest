# apps/users/serializers.py
"""User serializers for API."""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import Notification, Organization, Role, ForestZone, DutyRosterSettings, DutyShiftSlot, DutyGroup, DutyAssignment

User = get_user_model()

ROLE_CHOICES = [
    ('admin', '系统管理员'),
    ('operator', '运维人员'),
    ('forester', '护林员'),
    ('viewer', '查看者'),
]

LEGACY_ROLE_CODES = frozenset(dict(ROLE_CHOICES))


def coerce_legacy_role(code: str | None, fallback: str = 'viewer') -> str:
    """自定义角色编码映射到兼容字段 role；未知编码回落 fallback。"""
    if code and code in LEGACY_ROLE_CODES:
        return code
    return fallback

PERMISSION_CATALOG = [
    {'code': 'dashboard:view', 'name': '查看驾驶舱', 'module': 'dashboard'},
    {'code': 'devices:view', 'name': '查看设备', 'module': 'devices'},
    {'code': 'devices:edit', 'name': '管理设备', 'module': 'devices'},
    {'code': 'alerts:view', 'name': '查看告警', 'module': 'alerts'},
    {'code': 'alerts:handle', 'name': '处理告警', 'module': 'alerts'},
    {'code': 'fire_tracing:view', 'name': '查看火情溯源', 'module': 'fire'},
    {'code': 'reports:view', 'name': '查看报表', 'module': 'reports'},
    {'code': 'reports:generate', 'name': '生成报表', 'module': 'reports'},
    {'code': 'diagnostics:view', 'name': '查看运维诊断', 'module': 'diagnostics'},
    {'code': 'organization:view', 'name': '查看组织', 'module': 'organization'},
    {'code': 'organization:edit', 'name': '管理组织', 'module': 'organization'},
    {'code': 'roles:view', 'name': '查看角色', 'module': 'roles'},
    {'code': 'roles:edit', 'name': '管理角色', 'module': 'roles'},
    {'code': 'users:view', 'name': '查看用户', 'module': 'users'},
    {'code': 'users:edit', 'name': '管理用户', 'module': 'users'},
    {'code': 'forest_zones:view', 'name': '查看林区', 'module': 'forest_zones'},
    {'code': 'forest_zones:edit', 'name': '管理林区', 'module': 'forest_zones'},
    {'code': 'settings:view', 'name': '查看系统设置', 'module': 'settings'},
    {'code': 'settings:edit', 'name': '管理系统设置', 'module': 'settings'},
]


class ForestZoneSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(
        source='organization.name', read_only=True, allow_null=True
    )
    device_count = serializers.IntegerField(read_only=True, required=False)
    regions = serializers.ListField(
        child=serializers.CharField(max_length=128, allow_blank=False),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = ForestZone
        fields = [
            'id', 'name', 'code', 'organization', 'organization_name',
            'region', 'regions', 'boundary', 'manager', 'contact', 'description',
            'sort_order', 'is_active', 'device_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'device_count']
        extra_kwargs = {
            'organization': {'required': False, 'allow_null': True},
            'boundary': {'required': False},
            'region': {'required': False, 'allow_blank': True},
        }

    def validate_code(self, value):
        code = (value or '').strip()
        if not code:
            raise serializers.ValidationError('林区编码不能为空')
        return code

    def validate_name(self, value):
        name = (value or '').strip()
        if not name:
            raise serializers.ValidationError('林区名称不能为空')
        return name

    def validate_regions(self, value):
        items: list[str] = []
        for raw in value or []:
            text = str(raw).strip()
            if text and text not in items:
                items.append(text)
        return items

    def validate(self, attrs):
        org = attrs.get('organization') or getattr(self.instance, 'organization', None)
        code = attrs.get('code') or getattr(self.instance, 'code', None)
        if org and code:
            qs = ForestZone.objects.filter(organization=org, code=code)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({'code': '该组织下林区编码已存在'})

        # 兼容只传 region 的旧客户端：并入 regions
        region = attrs.get('region', None)
        regions = attrs.get('regions', None)
        if regions is None and region is not None:
            text = str(region).strip()
            attrs['regions'] = [text] if text else []
        elif regions is not None and region is not None:
            text = str(region).strip()
            if text and text not in regions:
                attrs['regions'] = [text, *regions]
        if 'regions' in attrs:
            items = attrs['regions']
            attrs['region'] = items[0] if items else ''
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['regions'] = instance.get_region_list()
        data['region'] = data['regions'][0] if data['regions'] else ''
        return data


class OrganizationSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)
    org_type_display = serializers.CharField(source='get_org_type_display', read_only=True)
    children_count = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'code', 'parent', 'parent_name', 'org_type', 'org_type_display',
            'region', 'contact', 'phone', 'address', 'description',
            'sort_order', 'is_active', 'children_count', 'user_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_children_count(self, obj):
        return obj.children.count()

    def get_user_count(self, obj):
        return obj.users.count()


class RoleSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source='organization.name', read_only=True, allow_null=True)

    class Meta:
        model = Role
        fields = [
            'id', 'name', 'code', 'organization', 'organization_name',
            'description', 'permissions', 'is_system',
            'is_enabled', 'user_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'is_system', 'created_at', 'updated_at']
        extra_kwargs = {
            'organization': {'required': False, 'allow_null': True},
        }

    def get_user_count(self, obj):
        return obj.users.count()

    def validate_permissions(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('权限必须是字符串数组')
        return [str(item) for item in value]


class UserListSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    full_name = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source='organization.name', read_only=True, allow_null=True)
    role_ref_name = serializers.CharField(source='role_ref.name', read_only=True, allow_null=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'first_name', 'last_name',
            'email', 'phone', 'role', 'role_display', 'role_ref', 'role_ref_name',
            'organization', 'organization_name', 'department', 'region',
            'badge_number', 'patrol_zone',
            'is_active', 'is_staff', 'is_superuser', 'must_change_password',
            'last_login', 'date_joined',
            'created_at', 'unread_count',
        ]

    def get_full_name(self, obj):
        if obj.first_name or obj.last_name:
            return f'{obj.last_name}{obj.first_name}'.strip()
        return obj.username

    def get_unread_count(self, obj):
        return obj.notifications.filter(is_read=False).count()


class UserDetailSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    full_name = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source='organization.name', read_only=True, allow_null=True)
    role_ref_name = serializers.CharField(source='role_ref.name', read_only=True, allow_null=True)
    organization_id = serializers.PrimaryKeyRelatedField(
        source='organization', queryset=Organization.objects.all(),
        required=False, allow_null=True,
    )
    role_ref_id = serializers.PrimaryKeyRelatedField(
        source='role_ref', queryset=Role.objects.all(),
        required=False, allow_null=True,
    )

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'first_name', 'last_name',
            'email', 'phone', 'role', 'role_display',
            'role_ref', 'role_ref_id', 'role_ref_name',
            'organization', 'organization_id', 'organization_name',
            'department', 'region', 'badge_number', 'patrol_zone',
            'is_active', 'is_staff', 'is_superuser', 'must_change_password',
            'last_login', 'date_joined', 'created_at', 'updated_at', 'unread_count',
        ]
        read_only_fields = [
            'id', 'last_login', 'date_joined', 'created_at', 'updated_at',
            'is_staff', 'is_superuser', 'must_change_password',
        ]

    def get_full_name(self, obj):
        if obj.first_name or obj.last_name:
            return f'{obj.last_name}{obj.first_name}'.strip()
        return obj.username

    def get_unread_count(self, obj):
        return obj.notifications.filter(is_read=False).count()


class UserProfileSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    full_name = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source='organization.name', read_only=True, allow_null=True)
    role_ref_name = serializers.CharField(source='role_ref.name', read_only=True, allow_null=True)
    org_scope = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'first_name', 'last_name',
            'email', 'phone', 'role', 'role_display', 'role_ref', 'role_ref_name',
            'organization', 'organization_name', 'department', 'region',
            'badge_number', 'patrol_zone', 'is_active',
            'is_staff', 'is_superuser', 'must_change_password',
            'last_login', 'date_joined', 'org_scope',
        ]
        read_only_fields = [
            'id', 'username', 'role', 'role_ref', 'organization',
            'is_active', 'is_staff', 'is_superuser', 'must_change_password',
            'last_login', 'date_joined', 'org_scope',
        ]

    def get_full_name(self, obj):
        if obj.first_name or obj.last_name:
            return f'{obj.last_name}{obj.first_name}'.strip()
        return obj.username

    def get_org_scope(self, obj):
        from .org_scope import scope_payload
        return scope_payload(obj)


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True, required=True)
    organization_id = serializers.PrimaryKeyRelatedField(
        source='organization', queryset=Organization.objects.all(),
        required=False, allow_null=True,
    )
    role_ref_id = serializers.PrimaryKeyRelatedField(
        source='role_ref', queryset=Role.objects.all(),
        required=False, allow_null=True,
    )
    # 兼容旧枚举；自定义角色请用 role_ref_id，未知 code 在校验时回落
    role = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'username', 'password', 'password_confirm', 'email', 'phone',
            'first_name', 'last_name', 'role', 'role_ref_id', 'organization_id',
            'department', 'region', 'badge_number', 'patrol_zone',
        ]

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': '两次输入的密码不一致'})
        role_ref = attrs.get('role_ref')
        raw_role = attrs.get('role') or ''
        if role_ref:
            attrs['role'] = coerce_legacy_role(role_ref.code, coerce_legacy_role(raw_role))
        else:
            attrs['role'] = coerce_legacy_role(raw_role)
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        if validated_data.get('role') == 'admin':
            user.is_staff = True
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    organization_id = serializers.PrimaryKeyRelatedField(
        source='organization', queryset=Organization.objects.all(),
        required=False, allow_null=True,
    )
    role_ref_id = serializers.PrimaryKeyRelatedField(
        source='role_ref', queryset=Role.objects.all(),
        required=False, allow_null=True,
    )
    role = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'email', 'phone', 'first_name', 'last_name', 'role', 'role_ref_id',
            'organization_id', 'department', 'region', 'badge_number', 'patrol_zone',
            'is_active',
        ]

    def validate(self, attrs):
        role_ref = attrs.get('role_ref')
        if role_ref is not None:
            attrs['role'] = coerce_legacy_role(role_ref.code, attrs.get('role') or 'viewer')
        elif 'role' in attrs:
            attrs['role'] = coerce_legacy_role(attrs.get('role'))
        return attrs

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if 'role' in validated_data:
            instance.is_staff = validated_data['role'] == 'admin'
        instance.save()
        return instance


DEFAULT_RESET_PASSWORD = 'Qwe123456'


class UserChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=False, allow_blank=True)
    new_password = serializers.CharField(required=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(required=True)

    def validate(self, attrs):
        user = self.context['request'].user
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': '两次输入的新密码不一致'})
        # 被重置后强制改密：可跳过原密码；否则必须校验原密码
        if not getattr(user, 'must_change_password', False):
            old = attrs.get('old_password') or ''
            if not old:
                raise serializers.ValidationError({'old_password': '请输入原密码'})
            if not user.check_password(old):
                raise serializers.ValidationError({'old_password': '原密码错误'})
        elif attrs.get('old_password'):
            if not user.check_password(attrs['old_password']):
                raise serializers.ValidationError({'old_password': '原密码错误'})
        if attrs['new_password'] == DEFAULT_RESET_PASSWORD:
            raise serializers.ValidationError({'new_password': '新密码不能与系统默认重置密码相同'})
        return attrs


class AdminResetPasswordSerializer(serializers.Serializer):
    """管理员重置用户密码；不传则使用默认 Qwe123456。"""
    new_password = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text=f'新密码，留空则重置为 {DEFAULT_RESET_PASSWORD}',
    )

    def validate_new_password(self, value):
        value = (value or '').strip()
        if not value:
            return DEFAULT_RESET_PASSWORD
        validate_password(value)
        return value

    def validate(self, attrs):
        if not attrs.get('new_password'):
            attrs['new_password'] = DEFAULT_RESET_PASSWORD
        return attrs


# 兼容旧命名
ChangePasswordSerializer = UserChangePasswordSerializer


class UserBatchDeleteSerializer(serializers.Serializer):
    user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='要删除的用户 ID 列表',
    )


class UserRoleChangeSerializer(serializers.Serializer):
    role = serializers.CharField(required=False, allow_blank=True)
    role_ref_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        if not attrs.get('role') and attrs.get('role_ref_id') is None:
            raise serializers.ValidationError('请提供 role 或 role_ref_id')
        if attrs.get('role'):
            attrs['role'] = coerce_legacy_role(attrs.get('role'))
        role_ref_id = attrs.get('role_ref_id')
        if role_ref_id is not None:
            role = Role.objects.filter(pk=role_ref_id).first()
            if not role:
                raise serializers.ValidationError({'role_ref_id': '角色不存在'})
            attrs['role'] = coerce_legacy_role(role.code, attrs.get('role') or 'viewer')
        return attrs


class NotificationListSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_notification_type_display', read_only=True)
    type = serializers.CharField(source='notification_type', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'notification_type', 'type_display', 'title', 'content',
            'is_read', 'alert_id', 'device_id', 'created_at', 'read_at',
        ]


class NotificationDetailSerializer(NotificationListSerializer):
    pass


class NotificationCreateSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source='notification_type', required=False)

    class Meta:
        model = Notification
        fields = [
            'user', 'type', 'notification_type', 'title', 'content',
            'alert_id', 'device_id',
        ]

    def validate(self, attrs):
        if not attrs.get('notification_type'):
            raise serializers.ValidationError({'notification_type': '通知类型必填'})
        return attrs


class NotificationMarkReadSerializer(serializers.Serializer):
    notification_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )


class UserStatisticsSerializer(serializers.Serializer):
    total_users = serializers.IntegerField()
    active_users = serializers.IntegerField()
    inactive_users = serializers.IntegerField()
    admin_count = serializers.IntegerField()
    operator_count = serializers.IntegerField()
    forester_count = serializers.IntegerField()
    viewer_count = serializers.IntegerField()
    online_today = serializers.IntegerField()
    new_this_week = serializers.IntegerField()


class DutyRosterSettingsSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    duty_mode_display = serializers.CharField(source='get_duty_mode_display', read_only=True)

    class Meta:
        model = DutyRosterSettings
        fields = [
            'id', 'organization', 'organization_name',
            'duty_mode', 'duty_mode_display',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class DutyShiftSlotSerializer(serializers.ModelSerializer):
    start_time = serializers.TimeField(format='%H:%M')
    end_time = serializers.TimeField(format='%H:%M')
    organization_name = serializers.CharField(source='organization.name', read_only=True, allow_null=True)

    class Meta:
        model = DutyShiftSlot
        fields = [
            'id', 'organization', 'organization_name',
            'code', 'name', 'start_time', 'end_time',
            'sort_order', 'is_active',
        ]
        extra_kwargs = {
            'organization': {'required': False, 'allow_null': True},
        }


class DutyGroupSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True, allow_null=True)
    member_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.all(),
        source='members',
        required=False,
    )
    members_brief = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = DutyGroup
        fields = [
            'id', 'organization', 'organization_name',
            'name', 'code', 'description',
            'member_ids', 'members_brief', 'member_count',
            'is_active', 'sort_order',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
        extra_kwargs = {
            'organization': {'required': False, 'allow_null': True},
        }

    def get_members_brief(self, obj):
        return [
            {
                'id': u.id,
                'username': u.username,
                'full_name': (f'{u.last_name or ""}{u.first_name or ""}'.strip() or u.username),
                'phone': u.phone or '',
            }
            for u in obj.members.all()
        ]

    def get_member_count(self, obj):
        return obj.members.count()


class DutyAssignmentSerializer(serializers.ModelSerializer):
    shift_name = serializers.CharField(source='shift.name', read_only=True)
    shift_code = serializers.CharField(source='shift.code', read_only=True)
    group_name = serializers.CharField(source='group.name', read_only=True, allow_null=True)
    user_ids = serializers.PrimaryKeyRelatedField(
        many=True, source='users', read_only=True,
    )
    members_brief = serializers.SerializerMethodField()

    class Meta:
        model = DutyAssignment
        fields = [
            'id', 'organization', 'duty_date',
            'shift', 'shift_name', 'shift_code',
            'group', 'group_name',
            'user_ids', 'members_brief',
            'remark', 'created_at', 'updated_at',
        ]

    def get_members_brief(self, obj):
        users = list(obj.users.all())
        seen = {u.id for u in users}
        if obj.group_id:
            for u in obj.group.members.all():
                if u.id not in seen:
                    users.append(u)
        return [
            {
                'id': u.id,
                'username': u.username,
                'full_name': (f'{u.last_name or ""}{u.first_name or ""}'.strip() or u.username),
                'phone': u.phone or '',
            }
            for u in users
        ]
