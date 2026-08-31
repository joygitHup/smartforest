# apps/core/__init__.py
"""
Core app for shared functionality.
"""
default_app_config = 'core.apps.CoreConfig'
from .filters import (
    ASGICompatibleDjangoFilterBackend,
    ASGICompatibleSearchFilter,
    ASGICompatibleOrderingFilter,
)