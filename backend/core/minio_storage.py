"""
MinIO / S3 媒体上传工具。
支持 base64 数据、http(s) URL 拉取后转存。
"""
from __future__ import annotations

import base64
import logging
import mimetypes
import uuid
from typing import Optional
from urllib.parse import urlparse

import boto3
from botocore.client import Config
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def _s3_credentials() -> tuple[str, str]:
    access = str(getattr(settings, 'AWS_ACCESS_KEY_ID', '') or '').strip()
    secret = str(getattr(settings, 'AWS_SECRET_ACCESS_KEY', '') or '').strip()
    placeholders = {'', 'your-access-key', 'your-secret-key', 'changeme'}
    if access.lower() in placeholders or secret.lower() in placeholders:
        # Prefer common local MinIO defaults when .env still has placeholders.
        return 'minioadmin', 'minioadmin'
    return access, secret


def _s3_client():
    endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', None) or None
    access_key, secret_key = _s3_credentials()
    return boto3.client(
        's3',
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'us-east-1'),
        config=Config(signature_version='s3v4'),
    )


def object_exists(key: str, bucket: Optional[str] = None) -> bool:
    bucket = bucket or settings.AWS_STORAGE_BUCKET_NAME or 'forest-monitor'
    client = _s3_client()
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except Exception:
        return False


def upload_object_bytes(
    key: str,
    data: bytes,
    *,
    content_type: str = 'application/octet-stream',
    metadata: Optional[dict] = None,
    bucket: Optional[str] = None,
) -> str:
    """按指定 object key 上传，返回公开 URL。"""
    bucket = ensure_bucket(bucket)
    client = _s3_client()
    kwargs = {
        'Bucket': bucket,
        'Key': key,
        'Body': data,
        'ContentType': content_type,
    }
    if metadata:
        kwargs['Metadata'] = {str(k): str(v) for k, v in metadata.items() if v is not None}
    client.put_object(**kwargs)
    url = _public_url(bucket, key)
    logger.info('Uploaded object to MinIO: %s', url)
    return url


def ensure_bucket(bucket: Optional[str] = None) -> str:
    bucket = bucket or settings.AWS_STORAGE_BUCKET_NAME or 'forest-monitor'
    client = _s3_client()
    try:
        client.head_bucket(Bucket=bucket)
    except Exception:
        try:
            client.create_bucket(Bucket=bucket)
            logger.info('Created MinIO bucket: %s', bucket)
        except Exception as exc:
            logger.warning('ensure_bucket failed for %s: %s', bucket, exc)
    return bucket


def _public_url(bucket: str, key: str) -> str:
    endpoint = (getattr(settings, 'AWS_S3_ENDPOINT_URL', None) or 'http://127.0.0.1:9000').rstrip('/')
    return f'{endpoint}/{bucket}/{key}'


def upload_bytes(
    data: bytes,
    *,
    prefix: str = 'alerts',
    filename: Optional[str] = None,
    content_type: str = 'application/octet-stream',
    device_id: str = 'unknown',
) -> str:
    """上传二进制到 MinIO，返回可访问 URL。"""
    bucket = ensure_bucket()
    day = timezone.now().strftime('%Y/%m/%d')
    name = filename or f'{uuid.uuid4().hex}.bin'
    key = f'{prefix}/{device_id}/{day}/{name}'

    client = _s3_client()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    url = _public_url(bucket, key)
    logger.info('Uploaded media to MinIO: %s', url)
    return url


def upload_base64(
    data_uri_or_b64: str,
    *,
    prefix: str = 'alerts',
    device_id: str = 'unknown',
    default_ext: str = 'jpg',
) -> Optional[str]:
    """解析 data:image/jpeg;base64,... 或纯 base64 并上传。"""
    if not data_uri_or_b64:
        return None
    raw = data_uri_or_b64.strip()
    content_type = 'application/octet-stream'
    ext = default_ext

    if raw.startswith('data:') and ';base64,' in raw:
        header, b64 = raw.split(';base64,', 1)
        content_type = header.replace('data:', '') or content_type
        guessed = mimetypes.guess_extension(content_type) or f'.{default_ext}'
        ext = guessed.lstrip('.')
    elif raw.startswith('http://') or raw.startswith('https://'):
        # 已是 URL，直接返回（或可选转存）
        return raw
    else:
        b64 = raw

    try:
        binary = base64.b64decode(b64)
    except Exception as exc:
        logger.error('Invalid base64 media: %s', exc)
        return None

    return upload_bytes(
        binary,
        prefix=prefix,
        filename=f'{uuid.uuid4().hex}.{ext}',
        content_type=content_type if content_type != 'application/octet-stream' else f'image/{ext}',
        device_id=device_id,
    )


def upload_from_url(url: str, *, prefix: str = 'alerts', device_id: str = 'unknown') -> Optional[str]:
    """从外部 URL 拉取并转存到 MinIO。"""
    if not url:
        return None
    if url.startswith(getattr(settings, 'AWS_S3_ENDPOINT_URL', '') or '___'):
        return url
    try:
        import urllib.request

        with urllib.request.urlopen(url, timeout=15) as resp:
            data = resp.read()
            content_type = resp.headers.get_content_type() or 'application/octet-stream'
        path = urlparse(url).path
        ext = path.rsplit('.', 1)[-1] if '.' in path else 'bin'
        return upload_bytes(
            data,
            prefix=prefix,
            filename=f'{uuid.uuid4().hex}.{ext}',
            content_type=content_type,
            device_id=device_id,
        )
    except Exception as exc:
        logger.error('upload_from_url failed: %s', exc)
        return url
