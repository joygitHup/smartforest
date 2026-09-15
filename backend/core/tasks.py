"""
运维定时任务：日志归档到 MinIO 等。
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Django verbose formatter: INFO 2026-08-10 00:01:02,123 module ...
_LOG_TS_RE = re.compile(
    r'^(DEBUG|INFO|WARNING|ERROR|CRITICAL)\s+'
    r'(\d{4}-\d{2}-\d{2})\s+'
    r'(\d{2}:\d{2}:\d{2})(?:,\d+)?'
)


def _log_file_path() -> Path:
    configured = getattr(settings, 'DJANGO_LOG_FILE', None)
    if configured:
        return Path(configured)
    return Path(settings.BASE_DIR) / 'logs' / 'django.log'


def _parse_line_ts(line: str) -> datetime | None:
    m = _LOG_TS_RE.match(line.strip())
    if not m:
        return None
    try:
        return datetime.strptime(f'{m.group(2)} {m.group(3)}', '%Y-%m-%d %H:%M:%S')
    except ValueError:
        return None


def extract_day_log_segment(
    content: str,
    target_day: date,
) -> tuple[str, datetime | None, datetime | None, str]:
    """
    从日志全文中抽出指定自然日的行。
    返回 (day_text, first_ts, last_ts, remaining_text)。
    无时间戳的行归属到上一条有效时间戳所在日；文件开头无时间戳则归入剩余。
    """
    day_lines: list[str] = []
    remain_lines: list[str] = []
    first_ts: datetime | None = None
    last_ts: datetime | None = None
    current_bucket: date | None = None

    for line in content.splitlines(keepends=True):
        ts = _parse_line_ts(line)
        if ts is not None:
            current_bucket = ts.date()
            if current_bucket == target_day:
                day_lines.append(line)
                if first_ts is None:
                    first_ts = ts
                last_ts = ts
            else:
                remain_lines.append(line)
        else:
            if current_bucket == target_day:
                day_lines.append(line)
            else:
                remain_lines.append(line)

    return ''.join(day_lines), first_ts, last_ts, ''.join(remain_lines)


def build_archive_object_name(day: date, first_ts: datetime | None, last_ts: datetime | None) -> str:
    """
    命名：{YYYYMMDD}{HH:MM}-{HH:MM}
    例：2026081000:00-23:59
    """
    start = first_ts.strftime('%H:%M') if first_ts else '00:00'
    end = last_ts.strftime('%H:%M') if last_ts else '23:59'
    return f'{day.strftime("%Y%m%d")}{start}-{end}'


def archive_log_day_to_minio(
    target_day: date | None = None,
    *,
    remove_local: bool = True,
) -> dict:
    """
    将指定日期的本地 django.log 片段上传到 MinIO：
    bucket=forest-monitor, key=log/{YYYYMMDDHH:MM-HH:MM}.log
    """
    from core.minio_storage import ensure_bucket, upload_object_bytes

    if target_day is None:
        # 凌晨任务归档「昨天」
        target_day = timezone.localdate() - timedelta(days=1)

    log_path = _log_file_path()
    if not log_path.exists():
        return {
            'ok': False,
            'reason': 'log_file_missing',
            'path': str(log_path),
            'day': target_day.isoformat(),
        }

    raw = log_path.read_text(encoding='utf-8', errors='replace')
    day_text, first_ts, last_ts, remain = extract_day_log_segment(raw, target_day)
    if not day_text.strip():
        return {
            'ok': False,
            'reason': 'no_logs_for_day',
            'day': target_day.isoformat(),
            'path': str(log_path),
        }

    object_name = build_archive_object_name(target_day, first_ts, last_ts)
    filename = f'{object_name}.log'
    prefix = str(getattr(settings, 'LOG_ARCHIVE_MINIO_PREFIX', 'log') or 'log').strip('/')
    key = f'{prefix}/{filename}'
    bucket = ensure_bucket(getattr(settings, 'AWS_STORAGE_BUCKET_NAME', None) or 'forest-monitor')
    body = day_text.encode('utf-8')
    url = upload_object_bytes(
        key,
        body,
        content_type='text/plain; charset=utf-8',
        metadata={
            'log-day': target_day.isoformat(),
            'first-ts': first_ts.isoformat(sep=' ') if first_ts else '',
            'last-ts': last_ts.isoformat(sep=' ') if last_ts else '',
        },
        bucket=bucket,
    )

    if remove_local:
        # 写回非归档日内容；若剩余为空则清空文件
        tmp = log_path.with_suffix('.log.tmp')
        tmp.write_text(remain, encoding='utf-8')
        tmp.replace(log_path)

    result = {
        'ok': True,
        'day': target_day.isoformat(),
        'bucket': bucket,
        'key': key,
        'object_name': object_name,
        'filename': filename,
        'url': url,
        'bytes': len(body),
        'first_ts': first_ts.isoformat(sep=' ') if first_ts else None,
        'last_ts': last_ts.isoformat(sep=' ') if last_ts else None,
        'removed_local': remove_local,
    }
    logger.info('Archived daily log to MinIO: %s (%s bytes)', key, len(body))
    return result


def ensure_log_archive_periodic_task() -> str:
    """注册 django-celery-beat：每天 14:30 归档昨日日志。"""
    from django_celery_beat.models import CrontabSchedule, PeriodicTask

    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute='30',
        hour='14',
        day_of_week='*',
        day_of_month='*',
        month_of_year='*',
        timezone=getattr(settings, 'CELERY_TIMEZONE', 'Asia/Shanghai') or 'Asia/Shanghai',
    )
    task, created = PeriodicTask.objects.update_or_create(
        name='archive-daily-django-logs',
        defaults={
            'crontab': schedule,
            'task': 'core.tasks.archive_daily_logs',
            'enabled': True,
            'description': '每天 14:30 将昨日 django.log 归档到 MinIO forest-monitor/log/',
        },
    )
    return 'created' if created else 'updated'


@shared_task(
    name='core.tasks.archive_daily_logs',
    bind=True,
    max_retries=3,
    soft_time_limit=120,
    time_limit=180,
)
def archive_daily_logs(self, day: str | None = None, remove_local: bool = True):
    """
    Celery 任务：归档运行日志到 MinIO。
    day: YYYY-MM-DD，默认昨天（本地时区）。
    """
    try:
        target = date.fromisoformat(day) if day else None
        return archive_log_day_to_minio(target, remove_local=remove_local)
    except Exception as exc:
        logger.exception('archive_daily_logs failed: %s', exc)
        raise self.retry(exc=exc, countdown=60)
