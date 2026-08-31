# apps/core/filters.py
"""
Custom filter backends for ASGI compatibility.
"""
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter


class ASGICompatibleDjangoFilterBackend(DjangoFilterBackend):
    """ASGI 兼容的 Django Filter 后端"""

    def get_filterset_kwargs(self, request, queryset, view):
        try:
            data = request.query_params
        except AttributeError:
            data = request.GET

        return {
            'data': data,
            'queryset': queryset,
            'request': request,
        }


class ASGICompatibleSearchFilter(SearchFilter):
    """ASGI 兼容的搜索过滤器"""

    def get_search_terms(self, request):
        try:
            value = request.query_params.get(self.search_param, '')
        except AttributeError:
            value = request.GET.get(self.search_param, '')

        return value.split() if value else []


class ASGICompatibleOrderingFilter(OrderingFilter):
    """ASGI 兼容的排序过滤器"""

    def get_ordering(self, request, queryset, view):
        try:
            ordering = request.query_params.get(self.ordering_param)
        except AttributeError:
            ordering = request.GET.get(self.ordering_param)

        if not ordering:
            return self.get_default_ordering(view)

        if ',' in ordering:
            ordering = [field.strip() for field in ordering.split(',')]
        else:
            ordering = [ordering]

        valid_fields = self.get_valid_fields(queryset, view, {'request': request})
        valid_field_names = [f[0] for f in valid_fields]

        valid_ordering = []
        for field in ordering:
            if field.startswith('-'):
                field_name = field[1:]
                if field_name in valid_field_names:
                    valid_ordering.append(field)
            else:
                if field in valid_field_names:
                    valid_ordering.append(field)

        return valid_ordering if valid_ordering else self.get_default_ordering(view)