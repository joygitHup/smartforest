# apps/users/org_views.py
"""Organization & Role viewsets."""
from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.response import Response

from apps.core.filters import (
    ASGICompatibleDjangoFilterBackend,
    ASGICompatibleOrderingFilter,
    ASGICompatibleSearchFilter,
)

from .filters import OrganizationFilter, RoleFilter
from .models import Organization, Role
from .serializers import OrganizationSerializer, RoleSerializer, PERMISSION_CATALOG
from .org_scope import (
    can_manage_organization_data,
    ensure_root_organization,
    filter_by_org_scope,
    filter_roles_for_user,
    get_user_org_scope_ids,
    is_unrestricted_viewer,
    org_in_scope,
    resolve_create_organization_id,
)


class IsOrgManager(BasePermission):
    message = '仅本局管理员或系统管理员可操作'

    def has_permission(self, request, view):
        return can_manage_organization_data(request.user)


class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.select_related('parent').all()
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = OrganizationFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['name', 'code', 'region', 'contact', 'phone']
    ordering_fields = ['sort_order', 'id', 'created_at', 'name']
    ordering = ['sort_order', 'id']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsOrgManager()]
        return super().get_permissions()

    def get_queryset(self):
        qs = super().get_queryset()
        return filter_by_org_scope(qs, self.request.user, field='id')

    def perform_create(self, serializer):
        parent = serializer.validated_data.get('parent')
        # 默认挂到当前用户组织下
        if parent is None and self.request.user.organization_id:
            parent = self.request.user.organization
            serializer.validated_data['parent'] = parent
        if parent is not None and not org_in_scope(self.request.user, parent.id):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('无权在该上级组织下创建子机构')
        if parent is None and not is_unrestricted_viewer(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('仅平台管理员可创建顶级组织')
        serializer.save()

    def destroy(self, request, *args, **options):
        org = self.get_object()
        if org.code == 'HQ':
            return Response({'error': '指挥中心根组织不可删除'}, status=status.HTTP_400_BAD_REQUEST)
        if org.children.exists():
            return Response(
                {'error': '请先删除或迁移下级组织'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if org.users.exists():
            return Response(
                {'error': '组织下仍有用户，无法删除'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **options)

    @action(detail=False, methods=['get'])
    def tree(self, request):
        """
        返回当前用户视野内的组织树。
        下属局管理员：以本局为根（观感=全新系统），不展示上级/兄弟局。
        """
        scope = get_user_org_scope_ids(request.user)
        if scope is None:
            orgs = list(Organization.objects.all().order_by('sort_order', 'id'))
            root_parent_id = None
        elif not scope:
            return Response([])
        else:
            orgs = list(
                Organization.objects.filter(id__in=scope).order_by('sort_order', 'id')
            )
            # 树根 = 用户所属组织（若在视野内）；否则取视野中 parent 不在视野内的节点
            user_org_id = getattr(request.user, 'organization_id', None)
            if user_org_id and user_org_id in scope:
                root_nodes = [o for o in orgs if o.id == user_org_id]
            else:
                root_nodes = [o for o in orgs if o.parent_id not in scope]
            by_parent = {}
            for o in orgs:
                by_parent.setdefault(o.parent_id, []).append(o)

            def build_from(node):
                data = OrganizationSerializer(node).data
                data['children'] = [build_from(c) for c in by_parent.get(node.id, [])]
                return data

            return Response([build_from(n) for n in root_nodes])

        by_parent = {}
        for o in orgs:
            by_parent.setdefault(o.parent_id, []).append(o)

        def build(parent_id=None):
            nodes = []
            for o in by_parent.get(parent_id, []):
                data = OrganizationSerializer(o).data
                data['children'] = build(o.id)
                nodes.append(data)
            return nodes

        return Response(build(root_parent_id))

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'active': qs.filter(is_active=True).count(),
            'by_type': dict(
                qs.values_list('org_type')
                .annotate(c=Count('id'))
                .values_list('org_type', 'c')
            ),
        })

    @action(detail=False, methods=['post'], permission_classes=[IsOrgManager])
    def provision(self, request):
        """
        开通下属机构：创建组织节点，并可选创建局管理员账号。
        body: { name, code, org_type, parent_id?, admin_username?, admin_password? }
        """
        from django.contrib.auth import get_user_model
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        User = get_user_model()
        name = (request.data.get('name') or '').strip()
        code = (request.data.get('code') or '').strip()
        org_type = request.data.get('org_type') or 'bureau'
        parent_id = request.data.get('parent_id') or request.data.get('parent')
        if not name or not code:
            return Response({'error': 'name/code 必填'}, status=status.HTTP_400_BAD_REQUEST)
        if Organization.objects.filter(code=code).exists():
            return Response({'error': f'组织编码 {code} 已存在'}, status=status.HTTP_400_BAD_REQUEST)

        if parent_id:
            parent_id = int(parent_id)
            if not org_in_scope(request.user, parent_id):
                return Response({'error': '无权在该上级下开通'}, status=status.HTTP_403_FORBIDDEN)
            parent = Organization.objects.get(pk=parent_id)
        else:
            parent = request.user.organization or ensure_root_organization()
            if not org_in_scope(request.user, parent.id) and not is_unrestricted_viewer(request.user):
                return Response({'error': '无权开通组织'}, status=status.HTTP_403_FORBIDDEN)

        org = Organization.objects.create(
            name=name,
            code=code,
            parent=parent,
            org_type=org_type,
            region=request.data.get('region') or '',
            contact=request.data.get('contact') or '',
            phone=request.data.get('phone') or '',
            description=request.data.get('description') or '',
        )

        admin_user = None
        admin_username = (request.data.get('admin_username') or '').strip()
        admin_password = request.data.get('admin_password') or ''
        if admin_username:
            if User.objects.filter(username=admin_username).exists():
                return Response(
                    {'error': f'用户名 {admin_username} 已存在', 'organization': OrganizationSerializer(org).data},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not admin_password:
                admin_password = 'ChangeMe123!'
            try:
                validate_password(admin_password)
            except DjangoValidationError as exc:
                return Response({'error': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
            admin_user = User.objects.create_user(
                username=admin_username,
                password=admin_password,
                role='admin',
                organization=org,
                must_change_password=True,
                is_active=True,
            )

        return Response({
            'organization': OrganizationSerializer(org).data,
            'admin': (
                {'id': admin_user.id, 'username': admin_user.username, 'must_change_password': True}
                if admin_user else None
            ),
            'message': f'已开通组织 {org.name}，该局管理员登录后仅见本局数据（空系统）',
        }, status=status.HTTP_201_CREATED)


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.select_related('organization').all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = RoleFilter
    filter_backends = [
        ASGICompatibleDjangoFilterBackend,
        ASGICompatibleSearchFilter,
        ASGICompatibleOrderingFilter,
    ]
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['id', 'code', 'created_at']
    ordering = ['id']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsOrgManager()]
        return super().get_permissions()

    def get_queryset(self):
        qs = super().get_queryset()
        return filter_roles_for_user(qs, self.request.user)

    def perform_create(self, serializer):
        org_id = resolve_create_organization_id(
            self.request.user,
            serializer.validated_data.get('organization').id
            if serializer.validated_data.get('organization') else None,
        )
        serializer.validated_data.pop('organization', None)
        # 仅平台管理员可创建系统内置角色；下属单位自建角色强制挂本组织
        if is_unrestricted_viewer(self.request.user) and self.request.data.get('is_system'):
            serializer.save(organization=None, is_system=True)
        else:
            serializer.save(organization_id=org_id, is_system=False)

    def perform_update(self, serializer):
        role = serializer.instance
        if role.is_system and not is_unrestricted_viewer(self.request.user):
            # 下属单位可查看系统角色，但不可改权限/状态
            raise PermissionDenied('系统内置角色仅平台管理员可修改')
        if 'organization' in serializer.validated_data:
            if role.is_system:
                raise PermissionDenied('系统内置角色不可变更所属组织')
            new_org = serializer.validated_data.get('organization')
            new_id = new_org.id if new_org is not None else None
            if new_id is not None and not org_in_scope(self.request.user, new_id):
                raise PermissionDenied('无权将角色归属到该组织')
        return super().perform_update(serializer)

    def destroy(self, request, *args, **options):
        role = self.get_object()
        if role.is_system:
            return Response(
                {'error': '系统内置角色不可删除'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not org_in_scope(request.user, role.organization_id):
            return Response({'error': '无权删除该角色'}, status=status.HTTP_403_FORBIDDEN)
        if role.users.exists():
            return Response(
                {'error': '角色下仍有用户，无法删除'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **options)

    def update(self, request, *args, **kwargs):
        role = self.get_object()
        if role.is_system and 'code' in request.data and request.data['code'] != role.code:
            return Response(
                {'error': '系统内置角色编码不可修改'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def permission_catalog(self, request):
        return Response(PERMISSION_CATALOG)

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'enabled': qs.filter(is_enabled=True).count(),
            'system': qs.filter(is_system=True).count(),
        })
