# core/influxdb_client.py
"""
InfluxDB 2.x client for time-series telemetry storage.

Replaces the former TDengine client. Uses the official `influxdb-client` SDK
with synchronous writes (the upper Celery task already batches upstream).
"""
import atexit
import logging
from datetime import datetime, timezone

from django.conf import settings

logger = logging.getLogger(__name__)


def _to_rfc3339(t) -> str:
    """Coerce a datetime or RFC3339 string into an RFC3339 string for Flux range()."""
    if isinstance(t, datetime):
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return t.astimezone(timezone.utc).isoformat()
    # Already a string; assume RFC3339. Caller responsibility for the format.
    return t


class InfluxDBClient:
    """InfluxDB 2.x client wrapping the official SDK."""

    MEASUREMENT = 'device_telemetry'

    FIELDS = (
        'temperature',
        'humidity',
        'wind_speed',
        'wind_direction',
        'light_intensity',
        'soil_moisture_10cm',
        'soil_moisture_30cm',
        'soil_moisture_60cm',
        'fuel_moisture',
        'thermal_max_temp',
        'thermal_min_temp',
        'thermal_avg_temp',
    )

    def __init__(self):
        self._client = None
        self._write_api = None
        self._query_api = None
        self._bucket_ready = False
        self.config = settings.INFLUXDB_CONFIG

    def connect(self):
        """Connect to InfluxDB and ensure the bucket exists."""
        if self._client:
            return self._client

        try:
            from influxdb_client import InfluxDBClient as _Sdk
            from influxdb_client.client.write_api import SYNCHRONOUS
        except ImportError as e:
            logger.error('influxdb-client not installed: %s', e)
            logger.info('Please install: pip install influxdb-client')
            raise

        self._client = _Sdk(
            url=self.config['URL'],
            token=self.config['TOKEN'],
            org=self.config['ORG'],
            timeout=30000,
        )
        self._write_api = self._client.write_api(write_options=SYNCHRONOUS)
        self._query_api = self._client.query_api()
        self._ensure_bucket()
        logger.info('Connected to InfluxDB at %s', self.config['URL'])
        return self._client

    def _ensure_bucket(self):
        """Create the target bucket on first connect (365d retention)."""
        if self._bucket_ready:
            return
        try:
            bucket_name = self.config['BUCKET']
            found = self._client.buckets_api().find_bucket_by_name(bucket_name)
            if found is None:
                from influxdb_client.domain.bucket import Bucket
                from influxdb_client.domain.bucket_retention_rule import BucketRetentionRules
                orgs = self._client.organizations_api().find_organizations(org=self.config['ORG'])
                if not orgs:
                    logger.warning('Org %s not found; bucket creation skipped', self.config['ORG'])
                    return
                org_id = orgs[0].id
                retention = BucketRetentionRules(type='expire', every_seconds=365 * 86400)
                self._client.buckets_api().create_bucket(
                    bucket=Bucket(name=bucket_name, org_id=org_id, retention_rules=[retention])
                )
                logger.info('Bucket %s created (retention=365d)', bucket_name)
            self._bucket_ready = True
        except Exception as e:
            logger.warning('Bucket ensure failed (continuing): %s', e)

    def health(self) -> dict:
        """Return health info for diagnostics."""
        try:
            if not self._client:
                self.connect()
            h = self._client.health()
            return {'ok': h.status == 'pass', 'status': h.status, 'message': getattr(h, 'message', '')}
        except Exception as exc:
            return {'ok': False, 'error': str(exc)}

    def _build_point(self, device_id, device_type, region, telemetry_data):
        from influxdb_client import Point, WritePrecision

        p = (
            Point(self.MEASUREMENT)
            .tag('device_id', device_id or '')
            .tag('device_type', device_type or '')
            .tag('region', region or '')
        )
        for field in self.FIELDS:
            val = (telemetry_data or {}).get(field)
            if val is None:
                continue
            if field == 'wind_direction':
                try:
                    p = p.field(field, int(val))
                except (TypeError, ValueError):
                    p = p.field(field, float(val))
            else:
                p = p.field(field, float(val))

        ts = (telemetry_data or {}).get('ts')
        if isinstance(ts, datetime):
            p = p.time(ts, WritePrecision.MS)
        else:
            p = p.time(datetime.utcnow(), WritePrecision.MS)
        return p

    def write_telemetry(self, device_id, device_type, region, telemetry_data):
        """Write a single telemetry point. Returns True on success."""
        try:
            if not self._client:
                self.connect()
            point = self._build_point(device_id, device_type, region, telemetry_data)
            self._write_api.write(
                bucket=self.config['BUCKET'],
                org=self.config['ORG'],
                record=point,
            )
            logger.debug('Telemetry written for device %s', device_id)
            return True
        except Exception as e:
            logger.error('Failed to write telemetry: %s', e)
            return False

    def write_telemetry_batch(self, rows: list[dict]) -> int:
        """Batch-write telemetry rows. Returns the count of points submitted."""
        if not rows:
            return 0
        try:
            if not self._client:
                self.connect()
            points = []
            for row in rows:
                point = self._build_point(
                    row.get('device_id') or '',
                    row.get('device_type') or '',
                    row.get('region') or '',
                    row.get('telemetry_data') or {},
                )
                points.append(point)
            self._write_api.write(
                bucket=self.config['BUCKET'],
                org=self.config['ORG'],
                record=points,
            )
            logger.info('InfluxDB batch wrote %s points', len(points))
            return len(points)
        except Exception as e:
            logger.error('Failed to batch write telemetry: %s', e)
            return 0

    def query_telemetry(self, device_id, start_time, end_time, fields=None):
        """Query telemetry rows for a device within [start_time, end_time].

        Returns a list of dicts, each containing _time, tags, and field columns
        (pivoted from the long Flux format). Limited to 1000 rows, newest first.
        """
        try:
            if not self._client:
                self.connect()
            start_rfc = _to_rfc3339(start_time)
            stop_rfc = _to_rfc3339(end_time)
            flux = f'''
from(bucket: "{self.config['BUCKET']}")
  |> range(start: {start_rfc}, stop: {stop_rfc})
  |> filter(fn: (r) => r._measurement == "{self.MEASUREMENT}")
  |> filter(fn: (r) => r.device_id == "{device_id}")
  |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: 1000)
'''
            tables = self._query_api.query(flux, org=self.config['ORG'])
            data: list[dict] = []
            keep = set(fields) if fields else None
            for table in tables:
                for rec in table.records:
                    row = dict(rec.values)
                    if keep is not None:
                        row = {k: row.get(k) for k in (*keep, '_time', 'device_id', 'device_type', 'region') if k in row or k == '_time'}
                    data.append(row)
            return data
        except Exception as e:
            logger.error('Failed to query telemetry: %s', e)
            return []

    def query_aggregate(self, device_id, start_time, end_time, field: str, every: str = '10m'):
        """Aggregate a single field over time windows. Returns list[dict] with _time + {field}_mean etc."""
        try:
            if not self._client:
                self.connect()
            start_rfc = _to_rfc3339(start_time)
            stop_rfc = _to_rfc3339(end_time)
            flux = f'''
from(bucket: "{self.config['BUCKET']}")
  |> range(start: {start_rfc}, stop: {stop_rfc})
  |> filter(fn: (r) => r._measurement == "{self.MEASUREMENT}")
  |> filter(fn: (r) => r._field == "{field}")
  |> filter(fn: (r) => r.device_id == "{device_id}")
  |> aggregateWindow(every: {every}, fn: mean, createEmpty: false)
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: 1000)
'''
            tables = self._query_api.query(flux, org=self.config['ORG'])
            data = []
            for table in tables:
                for rec in table.records:
                    data.append({
                        '_time': rec.get_time(),
                        'field': field,
                        'mean': rec.get_value(),
                    })
            return data
        except Exception as e:
            logger.error('Failed to aggregate telemetry: %s', e)
            return []

    def disconnect(self):
        """Close the underlying client."""
        client, self._client = self._client, None
        self._write_api = None
        self._query_api = None
        self._bucket_ready = False
        if client is not None:
            try:
                client.close()
                logger.info('Disconnected from InfluxDB')
            except Exception:
                pass


# Global singleton
influxdb_client = None


def get_influxdb_client():
    """Return the global InfluxDBClient singleton (lazy-connect)."""
    global influxdb_client
    if influxdb_client is None:
        influxdb_client = InfluxDBClient()
        influxdb_client.connect()
    return influxdb_client


def close_influxdb_client():
    """Release the global InfluxDB client."""
    global influxdb_client
    client = influxdb_client
    influxdb_client = None
    if client is not None:
        try:
            client.disconnect()
        except Exception:
            pass


atexit.register(close_influxdb_client)


def write_telemetry(device_id, device_type, region, telemetry_data):
    """Module-level write shim."""
    client = get_influxdb_client()
    return client.write_telemetry(device_id, device_type, region, telemetry_data)


def write_telemetry_batch(rows: list[dict]) -> int:
    """Module-level batch write shim."""
    client = get_influxdb_client()
    return client.write_telemetry_batch(rows)


def query_telemetry(device_id, start_time, end_time, fields=None):
    """Module-level query shim."""
    client = get_influxdb_client()
    return client.query_telemetry(device_id, start_time, end_time, fields)
