"""
User models for forest monitoring system.
"""
from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    # 添加 related_name 解决冲突
    groups = models.ManyToManyField(
        'auth.Group',
        related_name='custom_user_set',  # 自定义反向名称
        blank=True,
        help_text='The groups this user belongs to.',
        verbose_name='groups',
    )
    user_permissions = models.ManyToManyField(
        'auth.Permission',
        related_name='custom_user_set',  # 自定义反向名称
        blank=True,
        help_text='Specific permissions for this user.',
        verbose_name='user permissions',
    )
    """自定义用户模型"""
    ROLE_CHOICES = [
        ('admin', '系统管理员'),
        ('operator', '运维人员'),
        ('forester', '护林员'),
        ('viewer', '查看者'),
    ]
    
    role = models.CharField('角色', max_length=32, choices=ROLE_CHOICES, default='viewer')
    phone = models.CharField('手机号', max_length=20, blank=True)
    department = models.CharField('部门', max_length=128, blank=True)
    region = models.CharField('负责区域', max_length=128, blank=True)
    
    # 护林员专属字段
    badge_number = models.CharField('工号', max_length=64, blank=True)
    patrol_zone = models.CharField('巡护区域', max_length=256, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    
    class Meta:
        db_table = 'users'
        verbose_name = '用户'
        verbose_name_plural = verbose_name
    def __str__(self):
        return self.username


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
    
    # 关联对象
    alert_id = models.CharField('关联告警ID', max_length=64, blank=True)
    device_id = models.CharField('关联设备ID', max_length=64, blank=True)
    
    # 状态
    is_read = models.BooleanField('已读', default=False)
    read_at = models.DateTimeField('阅读时间', null=True, blank=True)
    
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    
    class Meta:
        db_table = 'notifications'
        verbose_name = '通知'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']
