# core/pagination.py
"""统一分页：支持前端 page / page_size 查询参数。"""
from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100
