"""用户权限辅助。"""

from rest_framework.permissions import BasePermission


def is_system_admin(user) -> bool:
    """系统管理员：超管 / staff / role=admin。"""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return True
    if getattr(user, 'role', None) == 'admin':
        return True
    role_ref = getattr(user, 'role_ref', None)
    if role_ref is not None and getattr(role_ref, 'code', None) == 'admin':
        return True
    return False


class IsSystemAdmin(BasePermission):
    """仅系统管理员可访问。"""

    message = '仅系统管理员可访问'

    def has_permission(self, request, view):
        return bool(request.user and is_system_admin(request.user))
