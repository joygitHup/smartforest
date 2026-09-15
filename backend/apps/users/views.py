# apps/users/views.py
"""
User views for API.
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404

from .models import User, Notification
from .serializers import (
    UserListSerializer, UserDetailSerializer, UserCreateSerializer,
    UserUpdateSerializer, UserProfileSerializer, UserChangePasswordSerializer,
    UserBatchDeleteSerializer, UserRoleChangeSerializer,
    AdminResetPasswordSerializer, DEFAULT_RESET_PASSWORD,
    NotificationListSerializer, NotificationDetailSerializer,
    NotificationCreateSerializer, NotificationMarkReadSerializer
)
from .filters import UserFilter, NotificationFilter
from .mixins import OrgManagerPermissionMixin
from .org_scope import (
    can_manage_organization_data,
    filter_by_org_scope,
    filter_roles_for_user,
    is_unrestricted_viewer,
    org_in_scope,
    resolve_create_organization_id,
    role_visible_to_user,
)

# ✅ 导入 ASGI 兼容的过滤器
from apps.core.filters import (
    ASGICompatibleDjangoFilterBackend,
    ASGICompatibleSearchFilter,
    ASGICompatibleOrderingFilter,
)


class UserViewSet(OrgManagerPermissionMixin, viewsets.ModelViewSet):
    """用户管理视图集（按组织子树隔离）"""
    queryset = User.objects.select_related('organization', 'role_ref').all()
    permission_classes = [IsAuthenticated]
    filterset_class = UserFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['username', 'first_name', 'last_name', 'email', 'phone', 'department']
    ordering_fields = ['id', 'username', 'date_joined', 'last_login', 'created_at']
    ordering = ['-date_joined']
    lookup_field = 'pk'
    org_manager_write_actions = (
        'create', 'destroy', 'batch_delete', 'change_role', 'reset_password',
    )

    def get_queryset(self):
        qs = super().get_queryset()
        # profile / 自身相关不按列表视野裁剪详情对象以外的逻辑：列表强制 scope
        if self.action in ['profile', 'update_profile', 'change_password', 'me']:
            return qs
        return filter_by_org_scope(qs, self.request.user, field='organization_id')

    def get_serializer_class(self):
        """根据操作返回不同的序列化器"""
        if self.action == 'list':
            return UserListSerializer
        elif self.action == 'create':
            return UserCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        elif self.action == 'profile':
            return UserProfileSerializer
        elif self.action == 'change_role':
            return UserRoleChangeSerializer
        return UserDetailSerializer

    def get_permissions(self):
        if self.action in self.org_manager_write_actions:
            return super().get_permissions()
        if self.action in ['update', 'partial_update']:
            # 管理员或本人
            pass
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        """创建用户（强制归属本组织子树）"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        requested = serializer.validated_data.get('organization')
        requested_id = requested.pk if requested is not None else request.data.get('organization_id')
        if requested_id is not None:
            try:
                requested_id = int(requested_id)
            except (TypeError, ValueError):
                return Response({'error': '无效的组织 ID'}, status=status.HTTP_400_BAD_REQUEST)
        org_id = resolve_create_organization_id(request.user, requested_id)
        serializer.validated_data.pop('organization', None)
        role_ref = serializer.validated_data.get('role_ref')
        if role_ref is not None and not role_visible_to_user(request.user, role_ref):
            raise PermissionDenied('无权分配该角色（平级单位自建角色不可见）')
        user = serializer.save(organization_id=org_id)

        detail_serializer = UserDetailSerializer(user)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        role_ref = serializer.validated_data.get('role_ref')
        if role_ref is not None and not role_visible_to_user(self.request.user, role_ref):
            raise PermissionDenied('无权分配该角色（平级单位自建角色不可见）')
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        """删除用户"""
        instance = self.get_object()

        # 不能删除自己
        if instance == request.user:
            return Response(
                {'error': '不能删除当前登录用户'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 不能删除最后一个管理员
        if instance.is_superuser and User.objects.filter(is_superuser=True).count() <= 1:
            return Response(
                {'error': '不能删除最后一个超级管理员'},
                status=status.HTTP_400_BAD_REQUEST
            )

        self.perform_destroy(instance)
        return Response(
            {'message': f'用户 {instance.username} 已删除'},
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['post'])
    def batch_delete(self, request):
        """批量删除用户"""
        if not request.user.is_staff:
            return Response(
                {'error': '只有管理员可以批量删除用户'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = UserBatchDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_ids = serializer.validated_data['user_ids']

        # 不能删除自己
        if request.user.id in user_ids:
            return Response(
                {'error': '不能删除当前登录用户'},
                status=status.HTTP_400_BAD_REQUEST
            )

        users = User.objects.filter(id__in=user_ids)
        deleted_count = users.count()
        users.delete()

        return Response({
            'message': f'成功删除 {deleted_count} 个用户',
            'deleted_count': deleted_count
        })

    @action(detail=False, methods=['get'])
    def profile(self, request):
        """获取当前用户个人信息"""
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['put', 'patch'])
    def update_profile(self, request):
        """更新当前用户个人信息"""
        serializer = UserProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)

        # 只允许更新部分字段
        allowed_fields = ['first_name', 'last_name', 'email', 'phone', 'department', 'region']
        for field in allowed_fields:
            if field in request.data:
                setattr(request.user, field, request.data[field])
        request.user.save()

        return Response(UserProfileSerializer(request.user).data)

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        """当前用户修改自己的密码（含被重置后的强制改密）。前端改密成功后应退出并跳转登录页。"""
        serializer = UserChangePasswordSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data['new_password'])
        request.user.must_change_password = False
        request.user.save(update_fields=['password', 'must_change_password', 'updated_at'])

        return Response({
            'message': '密码修改成功，请重新登录',
            'must_change_password': False,
            'require_relogin': True,
        })

    @action(detail=True, methods=['post'], url_path='reset_password')
    def reset_password(self, request, pk=None):
        """
        重置他人密码（默认 Qwe123456，可自定义）。
        - 平台管理员（全平台视野）：可重置任意用户
        - 组织管理员：仅可重置本组织子树内用户
        被重置用户下次登录须修改密码；请使用「修改密码」改自己的密码。
        """
        if not can_manage_organization_data(request.user):
            return Response(
                {'error': '无权限，仅平台管理员或组织管理员可重置密码'},
                status=status.HTTP_403_FORBIDDEN,
            )

        user = self.get_object()
        if user.id == request.user.id:
            return Response(
                {'error': '不能通过此接口重置自己的密码，请使用个人中心修改密码'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 组织管理员不得越权：目标须在本组织子树内
        if not is_unrestricted_viewer(request.user):
            if not org_in_scope(request.user, getattr(user, 'organization_id', None)):
                return Response(
                    {'error': '无权重置该用户密码（超出本组织管理范围）'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            # 禁止组织管理员重置平台级账号（超管 / 无组织 staff）
            if getattr(user, 'is_superuser', False) or (
                getattr(user, 'is_staff', False) and not getattr(user, 'organization_id', None)
            ):
                return Response(
                    {'error': '无权重置平台管理员账号密码'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = AdminResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_password = serializer.validated_data['new_password']

        user.set_password(new_password)
        user.must_change_password = True
        user.save(update_fields=['password', 'must_change_password', 'updated_at'])

        scope_hint = (
            '全平台'
            if is_unrestricted_viewer(request.user)
            else '本组织'
        )
        return Response({
            'message': (
                f'已重置用户 {user.username} 的密码（{scope_hint}），'
                f'该用户下次登录须修改密码'
            ),
            'username': user.username,
            'user_id': user.id,
            'must_change_password': True,
            'used_default_password': new_password == DEFAULT_RESET_PASSWORD,
            'default_password_hint': DEFAULT_RESET_PASSWORD if new_password == DEFAULT_RESET_PASSWORD else None,
        })

    @action(detail=True, methods=['post'])
    def change_role(self, request, pk=None):
        """修改用户角色"""
        if not request.user.is_staff:
            return Response({'error': '无权限'}, status=status.HTTP_403_FORBIDDEN)
        user = self.get_object()
        serializer = UserRoleChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        role_code = serializer.validated_data.get('role')
        role_ref_id = serializer.validated_data.get('role_ref_id')
        if role_ref_id is not None:
            from .models import Role
            try:
                role_obj = Role.objects.get(id=role_ref_id)
            except Role.DoesNotExist:
                return Response({'error': '角色不存在'}, status=status.HTTP_404_NOT_FOUND)
            if not role_visible_to_user(request.user, role_obj):
                return Response(
                    {'error': '无权分配该角色（平级单位自建角色不可见）'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            user.role_ref = role_obj
            if role_obj.code in dict(User.ROLE_CHOICES):
                user.role = role_obj.code
        elif role_code:
            user.role = role_code
            from .models import Role
            role_obj = filter_roles_for_user(
                Role.objects.filter(code=role_code), request.user
            ).first()
            if role_obj:
                user.role_ref = role_obj
        user.save()

        return Response({
            'message': f'用户 {user.username} 角色已更新',
            'role': user.role,
            'role_ref': user.role_ref_id,
            'role_display': (
                user.role_ref.name if user.role_ref_id else user.get_role_display()
            ),
        })

    @action(detail=False, methods=['get'])
    def roles(self, request):
        """获取角色选项（按组织视野：系统默认 + 本组织子树自建）"""
        from .models import Role
        qs = filter_roles_for_user(
            Role.objects.filter(is_enabled=True), request.user
        ).order_by('id')
        if qs.exists():
            return Response([
                {
                    'value': r.code,
                    'label': r.name,
                    'id': r.id,
                    'permissions': r.permissions,
                    'is_system': r.is_system,
                    'organization_id': r.organization_id,
                }
                for r in qs
            ])
        roles = [
            {'value': 'admin', 'label': '系统管理员'},
            {'value': 'operator', 'label': '运维人员'},
            {'value': 'forester', 'label': '护林员'},
            {'value': 'viewer', 'label': '查看者'},
        ]
        return Response(roles)

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """用户统计"""
        stats = {
            'total': User.objects.count(),
            'active': User.objects.filter(is_active=True).count(),
            'inactive': User.objects.filter(is_active=False).count(),
            'by_role': dict(
                User.objects.values_list('role').annotate(
                    count=Count('id')
                ).values_list('role', 'count')
            ),
            'by_department': dict(
                User.objects.exclude(department='')
                .values_list('department')
                .annotate(count=Count('id'))
                .values_list('department', 'count')
            ),
            'recent_joined': User.objects.filter(
                date_joined__gte=timezone.now() - timezone.timedelta(days=7)
            ).count(),
            'last_login_today': User.objects.filter(
                last_login__date=timezone.now().date()
            ).count(),
            'superusers': User.objects.filter(is_superuser=True).count(),
            'staff': User.objects.filter(is_staff=True).count(),
        }
        return Response(stats)

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        """切换用户激活状态"""
        user = self.get_object()

        # 不能停用自己的账号
        if user == request.user:
            return Response(
                {'error': '不能停用当前登录用户'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.is_active = not user.is_active
        user.save()

        return Response({
            'message': f'用户 {user.username} 已{"激活" if user.is_active else "停用"}',
            'is_active': user.is_active
        })


class NotificationViewSet(viewsets.ModelViewSet):
    """通知管理视图集"""
    queryset = Notification.objects.select_related('user').all()
    permission_classes = [IsAuthenticated]
    filterset_class = NotificationFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['title', 'content', 'user__username']
    ordering_fields = ['created_at', 'is_read']
    ordering = ['-created_at']
    lookup_field = 'pk'

    def get_serializer_class(self):
        if self.action == 'list':
            return NotificationListSerializer
        elif self.action == 'create':
            return NotificationCreateSerializer
        return NotificationDetailSerializer

    def get_queryset(self):
        """只返回当前用户的通知"""
        queryset = super().get_queryset()
        return queryset.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        """创建通知（管理员使用）"""
        if not request.user.is_staff:
            return Response(
                {'error': '只有管理员可以创建通知'},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().create(request, *args, **kwargs)

    @action(detail=False, methods=['post'])
    def mark_read(self, request):
        """标记通知为已读"""
        serializer = NotificationMarkReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        notification_ids = serializer.validated_data.get('notification_ids')

        if notification_ids:
            # 标记指定通知为已读
            notifications = Notification.objects.filter(
                id__in=notification_ids,
                user=request.user
            )
            count = notifications.update(is_read=True, read_at=timezone.now())
        else:
            # 标记所有通知为已读
            count = Notification.objects.filter(
                user=request.user,
                is_read=False
            ).update(is_read=True, read_at=timezone.now())

        return Response({
            'message': f'已标记 {count} 条通知为已读',
            'count': count
        })

    @action(detail=True, methods=['post'])
    def mark_read_single(self, request, pk=None):
        """标记单条通知为已读"""
        notification = self.get_object()
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save()

        return Response({'message': '通知已标记为已读'})

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """获取未读通知数量"""
        count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).count()
        return Response({'unread_count': count})

    @action(detail=False, methods=['delete'])
    def clear_read(self, request):
        """清除已读通知"""
        count = Notification.objects.filter(
            user=request.user,
            is_read=True
        ).delete()[0]

        return Response({
            'message': f'已清除 {count} 条已读通知',
            'count': count
        })

    @action(detail=False, methods=['delete'])
    def clear_all(self, request):
        """清除所有通知"""
        count = Notification.objects.filter(user=request.user).delete()[0]

        return Response({
            'message': f'已清除 {count} 条通知',
            'count': count
        })