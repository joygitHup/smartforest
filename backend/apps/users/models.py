# apps/users/models.py
"""
User / Organization / Role models for forest monitoring system.
"""
from django.db import models
from django.contrib.auth.models import AbstractUser


class Organization(models.Model):
    """组织机构（可树形）"""
    name = models.CharField('组织名称', max_length=128)
    code = models.CharField('组织编码', max_length=64, unique=True, db_index=True)
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
        verbose_name='上级组织',
    )
    org_type = models.CharField(
        '组织类型',
        max_length=32,
        choices=[
            ('group', '集团/指挥中心'),
            ('bureau', '林业局'),
            ('station', '管护站'),
            ('team', '班组'),
            ('other', '其他'),
        ],
        default='station',
    )
    region = models.CharField('所属区域', max_length=128, blank=True)
    contact = models.CharField('联系人', max_length=64, blank=True)
    phone = models.CharField('联系电话', max_length=32, blank=True)
    address = models.CharField('地址', max_length=256, blank=True)
    description = models.TextField('备注', blank=True)
    sort_order = models.IntegerField('排序', default=0)
    is_active = models.BooleanField('启用', default=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        app_label = 'users'
        db_table = 'organizations'
        verbose_name = '组织'
        verbose_name_plural = verbose_name
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f'{self.name}({self.code})'


class ForestZone(models.Model):
    """林区 / 林班主数据（挂在组织下，按租户隔离）"""
    name = models.CharField('林区名称', max_length=128)
    code = models.CharField('林区编码', max_length=64, db_index=True)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='forest_zones',
        verbose_name='所属组织',
    )
    region = models.CharField(
        '主片区',
        max_length=128,
        blank=True,
        help_text='兼容旧字段；与 regions[0] 同步',
    )
    regions = models.JSONField(
        '片区列表',
        default=list,
        blank=True,
        help_text='一个林区可包含多个片区，如 ["B片区","C片区"]',
    )
    boundary = models.JSONField(
        '边界/范围',
        default=dict,
        blank=True,
        help_text='GeoJSON 或 {center_lng, center_lat, radius_m} 等',
    )
    manager = models.CharField('责任人', max_length=64, blank=True)
    contact = models.CharField('联系方式', max_length=64, blank=True)
    description = models.TextField('备注', blank=True)
    sort_order = models.IntegerField('排序', default=0)
    is_active = models.BooleanField('启用', default=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        app_label = 'users'
        db_table = 'forest_zones'
        verbose_name = '林区'
        verbose_name_plural = verbose_name
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'code'],
                name='uniq_forest_zone_org_code',
            ),
        ]
        indexes = [
            models.Index(fields=['organization', 'is_active']),
            models.Index(fields=['organization', 'name']),
        ]

    def __str__(self):
        return f'{self.name}({self.code})'

    def get_region_list(self) -> list[str]:
        """规范化后的片区名称列表。"""
        items: list[str] = []
        for raw in self.regions or []:
            value = str(raw).strip()
            if value and value not in items:
                items.append(value)
        legacy = (self.region or '').strip()
        if legacy and legacy not in items:
            items.insert(0, legacy)
        return items

    def sync_regions_fields(self) -> None:
        items = self.get_region_list()
        self.regions = items
        self.region = items[0] if items else ''

    def save(self, *args, **kwargs):
        self.sync_regions_fields()
        super().save(*args, **kwargs)


class Role(models.Model):
    """角色（含权限码列表）"""
    DEFAULT_PERMISSIONS = [
        'dashboard:view',
        'devices:view',
        'devices:edit',
        'alerts:view',
        'alerts:handle',
        'fire_tracing:view',
        'reports:view',
        'reports:generate',
        'settings:view',
        'organization:view',
        'organization:edit',
        'roles:view',
        'roles:edit',
        'users:view',
        'users:edit',
        'forest_zones:view',
        'forest_zones:edit',
    ]

    name = models.CharField('角色名称', max_length=64)
    code = models.CharField('角色编码', max_length=64, unique=True, db_index=True)
    organization = models.ForeignKey(
        'Organization',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='roles',
        verbose_name='所属组织',
        help_text='为空表示系统内置角色；自建角色挂所属组织，仅本组织子树可见，平级单位互不可见',
    )
    description = models.TextField('描述', blank=True)
    permissions = models.JSONField('权限列表', default=list)
    is_system = models.BooleanField('系统内置', default=False)
    is_enabled = models.BooleanField('启用', default=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        app_label = 'users'
        db_table = 'roles'
        verbose_name = '角色'
        verbose_name_plural = verbose_name
        ordering = ['id']

    def __str__(self):
        return f'{self.name}({self.code})'


class User(AbstractUser):
    groups = models.ManyToManyField(
        'auth.Group',
        related_name='custom_user_set',
        blank=True,
        help_text='The groups this user belongs to.',
        verbose_name='groups',
    )
    user_permissions = models.ManyToManyField(
        'auth.Permission',
        related_name='custom_user_set',
        blank=True,
        help_text='Specific permissions for this user.',
        verbose_name='user permissions',
    )

    ROLE_CHOICES = [
        ('admin', '系统管理员'),
        ('operator', '运维人员'),
        ('forester', '护林员'),
        ('viewer', '查看者'),
    ]

    # 兼容旧字段：角色编码字符串
    role = models.CharField('角色编码', max_length=32, choices=ROLE_CHOICES, default='viewer')
    # 新：关联角色实体
    role_ref = models.ForeignKey(
        Role,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        verbose_name='角色',
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        verbose_name='所属组织',
    )

    phone = models.CharField('手机号', max_length=20, blank=True)
    department = models.CharField('部门', max_length=128, blank=True)
    region = models.CharField('负责区域', max_length=128, blank=True)

    badge_number = models.CharField('工号', max_length=64, blank=True)
    patrol_zone = models.CharField('巡护区域', max_length=256, blank=True)

    # 管理员重置密码后，下次登录须修改密码
    must_change_password = models.BooleanField('须修改密码', default=False)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        app_label = 'users'
        db_table = 'users'
        verbose_name = '用户'
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.username

    def sync_role_code(self):
        """将 role_ref.code 同步到 role 字段（若匹配内置枚举）"""
        if self.role_ref_id and self.role_ref:
            code = self.role_ref.code
            if code in dict(self.ROLE_CHOICES):
                self.role = code


class ExternalIdentity(models.Model):
    """第三方 SSO 身份映射（issuer + sub → 本地 User）。
    首次 SSO 登录时自动创建，用于 token exchange 场景下的免密登录。"""
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='external_identities',
        verbose_name='关联用户',
    )
    issuer = models.CharField(
        '签发方', max_length=64, db_index=True,
        help_text='第三方 JWT 的 iss 声明值，如 provincial_emergency',
    )
    sub = models.CharField(
        '外部主体标识', max_length=128, db_index=True,
        help_text='第三方 JWT 的 sub 声明值',
    )
    claims = models.JSONField('最近一次 claims 快照', default=dict, blank=True)
    last_login = models.DateTimeField('最近 SSO 登录时间', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        app_label = 'users'
        db_table = 'external_identities'
        verbose_name = '第三方身份'
        verbose_name_plural = verbose_name
        unique_together = ('issuer', 'sub')
        indexes = [
            models.Index(fields=['issuer', 'sub']),
        ]

    def __str__(self):
        return f'{self.issuer}:{self.sub} → user:{self.user_id}'


class Notification(models.Model):
    """通知消息"""
    NOTIFICATION_TYPES = [
        ('alert', '告警通知'),
        ('system', '系统通知'),
        ('task', '任务通知'),
        ('info', '信息通知'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField('通知类型', max_length=32, choices=NOTIFICATION_TYPES)
    title = models.CharField('标题', max_length=256)
    content = models.TextField('内容', blank=True)

    alert_id = models.CharField('关联告警ID', max_length=64, blank=True)
    device_id = models.CharField('关联设备ID', max_length=64, blank=True)

    is_read = models.BooleanField('已读', default=False)
    read_at = models.DateTimeField('阅读时间', null=True, blank=True)

    created_at = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        app_label = 'users'
        db_table = 'notifications'
        verbose_name = '通知'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_notification_type_display()}: {self.title[:20]}'


class DutyRosterSettings(models.Model):
    """组织级值班排班配置"""
    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name='duty_roster_settings',
        verbose_name='所属组织',
    )
    duty_mode = models.CharField(
        '排班模式',
        max_length=32,
        default='three_shift',
        choices=[
            ('three_shift', '三班倒'),
            ('two_shift', '两班倒'),
            ('custom', '自定义'),
        ],
    )
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        app_label = 'users'
        db_table = 'duty_roster_settings'
        verbose_name = '值班排班配置'
        verbose_name_plural = verbose_name

    def __str__(self):
        return f'{self.organization_id}:{self.duty_mode}'


class DutyShiftSlot(models.Model):
    """班次时段（按组织）"""
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='duty_shifts',
        verbose_name='所属组织',
    )
    code = models.CharField('班次编码', max_length=32)
    name = models.CharField('班次名称', max_length=64)
    start_time = models.TimeField('开始时间')
    end_time = models.TimeField('结束时间', help_text='可小于开始时间表示跨日')
    sort_order = models.IntegerField('排序', default=0)
    is_active = models.BooleanField('启用', default=True)

    class Meta:
        app_label = 'users'
        db_table = 'duty_shift_slots'
        verbose_name = '值班班次'
        verbose_name_plural = verbose_name
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'code'],
                name='uniq_duty_shift_org_code',
            ),
        ]

    def __str__(self):
        return f'{self.name}({self.start_time}-{self.end_time})'


class DutyGroup(models.Model):
    """值班组"""
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='duty_groups',
        verbose_name='所属组织',
    )
    name = models.CharField('组名', max_length=64)
    code = models.CharField('组编码', max_length=64, blank=True)
    members = models.ManyToManyField(
        User,
        blank=True,
        related_name='duty_groups',
        verbose_name='组成员',
    )
    description = models.TextField('备注', blank=True)
    is_active = models.BooleanField('启用', default=True)
    sort_order = models.IntegerField('排序', default=0)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        app_label = 'users'
        db_table = 'duty_groups'
        verbose_name = '值班组'
        verbose_name_plural = verbose_name
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'name'],
                name='uniq_duty_group_org_name',
            ),
        ]

    def __str__(self):
        return self.name


class DutyAssignment(models.Model):
    """某日某班次的排班（可指定组或个人）"""
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='duty_assignments',
        verbose_name='所属组织',
    )
    duty_date = models.DateField('值班日期', db_index=True)
    shift = models.ForeignKey(
        DutyShiftSlot,
        on_delete=models.CASCADE,
        related_name='assignments',
        verbose_name='班次',
    )
    group = models.ForeignKey(
        DutyGroup,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assignments',
        verbose_name='值班组',
    )
    users = models.ManyToManyField(
        User,
        blank=True,
        related_name='duty_assignments',
        verbose_name='值班人员',
    )
    remark = models.CharField('备注', max_length=256, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        app_label = 'users'
        db_table = 'duty_assignments'
        verbose_name = '值班排班'
        verbose_name_plural = verbose_name
        ordering = ['-duty_date', 'shift__sort_order']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'duty_date', 'shift'],
                name='uniq_duty_assignment_org_date_shift',
            ),
        ]

    def __str__(self):
        return f'{self.duty_date} {self.shift_id}'


class PlatformSettings(models.Model):
    """全平台级设置（单例）。平台名称仅平台管理员可改。"""
    singleton_key = models.PositiveSmallIntegerField(
        '单例键',
        default=1,
        unique=True,
        editable=False,
    )
    platform_name = models.CharField(
        '系统平台名称',
        max_length=128,
        default='林智森林智能监控平台',
    )
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        app_label = 'users'
        db_table = 'platform_settings'
        verbose_name = '平台设置'
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.platform_name

    @classmethod
    def get_solo(cls) -> 'PlatformSettings':
        obj, _ = cls.objects.get_or_create(
            singleton_key=1,
            defaults={'platform_name': '林智森林智能监控平台'},
        )
        return obj


class OrganizationSettings(models.Model):
    """组织级系统设置（对本组织生效）。"""
    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name='system_settings',
        verbose_name='所属组织',
    )
    refresh_interval = models.CharField('数据刷新间隔', max_length=32, default='10秒')
    default_map_layer = models.CharField('默认地图图层', max_length=64, default='标准地图')
    coordinate_system = models.CharField('坐标系', max_length=32, default='WGS-84')
    video_capture = models.CharField('视频采集模式', max_length=64, default='连续采集')
    sensor_interval = models.CharField('传感上报间隔', max_length=32, default='5分钟')
    video_codec = models.CharField('视频编码', max_length=64, default='H.265 (自适应)')
    offline_cache_days = models.CharField('离线缓存', max_length=32, default='≥7天')
    resume_upload = models.BooleanField('断点续传', default=True)
    notify_in_app = models.BooleanField('站内通知', default=True)
    notify_app_push = models.BooleanField('App 推送', default=True)
    notify_sms = models.BooleanField('短信通知', default=True)
    notify_voice_call = models.BooleanField('语音呼叫', default=True)
    notify_forestry_line = models.BooleanField('林业专线', default=True)
    duty_mode_label = models.CharField('值班模式展示', max_length=64, default='三班倒')
    data_retention = models.CharField('数据保留', max_length=64, default='90天')
    video_storage = models.CharField('视频存储策略', max_length=128, default='告警片段保留30天')
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        app_label = 'users'
        db_table = 'organization_settings'
        verbose_name = '组织系统设置'
        verbose_name_plural = verbose_name

    def __str__(self):
        return f'org={self.organization_id} settings'

    @classmethod
    def get_or_create_for_org(cls, organization_id: int) -> 'OrganizationSettings':
        obj, _ = cls.objects.get_or_create(organization_id=organization_id)
        return obj

