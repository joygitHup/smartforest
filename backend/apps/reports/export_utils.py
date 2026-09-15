# apps/reports/export_utils.py
"""报表导出工具"""
import csv
import io
from django.http import HttpResponse


def daily_report_to_csv_response(report) -> HttpResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(['字段', '值'])
    rows = [
        ('报告日期', report.report_date),
        ('设备总数', report.total_devices),
        ('在线设备', report.online_devices),
        ('在线率(%)', report.online_rate),
        ('告警总数', report.total_alerts),
        ('已处置告警', report.resolved_alerts),
        ('处置率(%)', report.resolution_rate),
        ('平均响应时间(秒)', report.avg_response_time),
        ('误报数量', report.false_alarm_count),
        ('误报率(%)', report.false_alarm_rate),
        ('平均温度', report.avg_temperature),
        ('最高温度', report.max_temperature),
        ('平均湿度', report.avg_humidity),
        ('平均风速', report.avg_wind_speed),
        ('碳汇(吨)', report.carbon_sequestration),
        ('生成时间', report.created_at),
        ('更新时间', report.updated_at),
    ]
    for row in rows:
        writer.writerow(row)

    response = HttpResponse(
        '\ufeff' + buffer.getvalue(),
        content_type='text/csv; charset=utf-8',
    )
    response['Content-Disposition'] = (
        f'attachment; filename="daily_report_{report.report_date}.csv"'
    )
    return response
