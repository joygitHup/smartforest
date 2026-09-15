# apps/alerts/export_utils.py
"""告警导出工具"""
import csv
import io
from django.http import HttpResponse


ALERT_EXPORT_HEADERS = [
    '告警ID', '标题', '类型', '级别', '状态', '设备ID', '设备名称',
    '区域', '林区', '经度', '纬度', 'AI置信度', '发生时间', '创建时间',
]


def alerts_to_csv_response(queryset, filename='alerts_export.csv'):
    """将告警 QuerySet 导出为 CSV（带 BOM，Excel 可直接打开）"""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(ALERT_EXPORT_HEADERS)

    for alert in queryset.select_related('device').iterator():
        device = alert.device
        writer.writerow([
            alert.alert_id,
            alert.title,
            alert.get_alert_type_display(),
            alert.get_alert_level_display(),
            alert.get_status_display(),
            device.device_id if device else '',
            device.device_name if device else '',
            alert.region or '',
            alert.forest_zone or '',
            alert.longitude if alert.longitude is not None else '',
            alert.latitude if alert.latitude is not None else '',
            alert.ai_confidence if alert.ai_confidence is not None else '',
            alert.occurred_at.isoformat() if alert.occurred_at else '',
            alert.created_at.isoformat() if alert.created_at else '',
        ])

    content = '\ufeff' + buffer.getvalue()
    response = HttpResponse(content, content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
