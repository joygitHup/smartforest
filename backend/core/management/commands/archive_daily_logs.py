"""
归档本地 django.log 到 MinIO，或注册每日凌晨定时任务。

示例：
  python manage.py archive_daily_logs
  python manage.py archive_daily_logs --date 2026-08-10
  python manage.py archive_daily_logs --keep-local
  python manage.py archive_daily_logs --setup-schedule
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Archive django.log of a day to MinIO forest-monitor/log/'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date',
            type=str,
            default='',
            help='归档日期 YYYY-MM-DD，默认昨天',
        )
        parser.add_argument(
            '--keep-local',
            action='store_true',
            help='上传后保留本地对应日志行（默认会从 django.log 中剔除）',
        )
        parser.add_argument(
            '--setup-schedule',
            action='store_true',
            help='注册 Celery Beat：每天 14:30 自动归档昨日日志',
        )
        parser.add_argument(
            '--async',
            action='store_true',
            dest='run_async',
            help='投递 Celery 异步执行',
        )

    def handle(self, *args, **options):
        from core.tasks import (
            archive_daily_logs,
            archive_log_day_to_minio,
            ensure_log_archive_periodic_task,
        )

        if options['setup_schedule']:
            status = ensure_log_archive_periodic_task()
            self.stdout.write(self.style.SUCCESS(f'Periodic task {status}: archive-daily-django-logs @ 14:30'))
            if not options['date'] and not options['run_async']:
                return

        day = None
        if options['date']:
            try:
                day = date.fromisoformat(options['date'])
            except ValueError as exc:
                raise CommandError(f'无效日期: {options["date"]}') from exc

        remove_local = not options['keep_local']
        if options['run_async']:
            result = archive_daily_logs.delay(
                day=day.isoformat() if day else None,
                remove_local=remove_local,
            )
            self.stdout.write(self.style.SUCCESS(f'Task queued: {result.id}'))
            return

        result = archive_log_day_to_minio(day, remove_local=remove_local)
        if not result.get('ok'):
            self.stdout.write(self.style.WARNING(f'Skipped: {result}'))
            return
        self.stdout.write(
            self.style.SUCCESS(
                f"Uploaded s3://{result['bucket']}/{result['key']} "
                f"({result['bytes']} bytes, {result['first_ts']} ~ {result['last_ts']})"
            )
        )
