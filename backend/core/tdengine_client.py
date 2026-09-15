# core/tdengine_client.py
"""
TDengine client for time-series data storage (Native Driver)
"""
import atexit
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def _safe_close_taos_connection(conn) -> None:
    """Close taos connection; neutralize __del__ if native lib already torn down."""
    if conn is None:
        return
    try:
        conn.close()
        return
    except Exception:
        pass
    # Django autoreload / interpreter shutdown: taos_close may already be None,
    # which makes TaosConnection.__del__ print "Exception ignored".
    try:
        if getattr(conn, '_conn', None) is not None:
            conn._conn = None
    except Exception:
        pass


class TDengineClient:
    """TDengine 客户端 (原生驱动)"""

    def __init__(self):
        self.conn = None
        self.cursor = None
        self.config = settings.TDENGINE_CONFIG
        self._stable_ready = False
        self._known_tables: set[str] = set()
        self._batch_buffer: list[dict] = []

    def connect(self):
        """连接 TDengine"""
        if self.conn:
            return self.conn

        try:
            import taos
            self.conn = taos.connect(
                host=self.config['HOST'],
                port=self.config.get('PORT', 6030),
                user=self.config['USER'],
                password=self.config['PASSWORD'],
                database=self.config.get('DATABASE')
            )
            self.cursor = self.conn.cursor()
            logger.info('Connected to TDengine using native driver')
            return self.conn
        except ImportError as e:
            logger.error(f'taos module not installed: {e}')
            logger.info('Please install: pip install taospy')
            raise
        except Exception as e:
            logger.error(f'Failed to connect to TDengine: {e}')
            raise

    def _execute(self, sql):
        """执行 SQL"""
        if not self.conn:
            self.connect()
        try:
            self.cursor.execute(sql)
            return self.cursor
        except Exception as e:
            logger.error(f'SQL execution failed: {sql[:100]}, error: {e}')
            raise

    def create_database(self):
        """创建数据库"""
        try:
            self.connect()
            sql = f"CREATE DATABASE IF NOT EXISTS {self.config['DATABASE']} KEEP 365 DURATION 10 BUFFER 16"
            self._execute(sql)
            logger.info(f'Database {self.config["DATABASE"]} created/verified')
            return True
        except Exception as e:
            logger.error(f'Failed to create database: {e}')
            return False

    def create_supertable(self):
        """创建超级表"""
        try:
            self.connect()
            self._execute(f"USE {self.config['DATABASE']}")

            sql = """
                CREATE STABLE IF NOT EXISTS device_telemetry (
                    ts TIMESTAMP,
                    temperature FLOAT,
                    humidity FLOAT,
                    wind_speed FLOAT,
                    wind_direction INT,
                    light_intensity FLOAT,
                    soil_moisture_10cm FLOAT,
                    soil_moisture_30cm FLOAT,
                    soil_moisture_60cm FLOAT,
                    fuel_moisture FLOAT,
                    thermal_max_temp FLOAT,
                    thermal_min_temp FLOAT,
                    thermal_avg_temp FLOAT
                ) TAGS (
                    device_id NCHAR(64),
                    device_type NCHAR(32),
                    region NCHAR(128)
                )
            """
            self._execute(sql)
            self._stable_ready = True
            logger.info('Supertable device_telemetry created/verified')
            return True
        except Exception as e:
            logger.error(f'Failed to create supertable: {e}')
            return False

    @staticmethod
    def _table_name(device_id: str) -> str:
        safe_id = ''.join(ch if ch.isalnum() or ch == '_' else '_' for ch in device_id)
        return f'telemetry_{safe_id}'.lower()

    def create_subtable(self, device_id, device_type, region):
        """创建子表（进程内缓存，避免每条遥测都 CREATE）"""
        try:
            table_name = self._table_name(device_id)
            if table_name in self._known_tables:
                return table_name

            self.connect()
            self._execute(f"USE {self.config['DATABASE']}")
            if not self._stable_ready:
                self.create_supertable()

            safe_region = (region or '').replace("'", "''")
            safe_type = (device_type or '').replace("'", "''")
            safe_device = (device_id or '').replace("'", "''")
            sql = f"""
                CREATE TABLE IF NOT EXISTS {table_name}
                USING device_telemetry TAGS ('{safe_device}', '{safe_type}', '{safe_region}')
            """
            self._execute(sql)
            self._known_tables.add(table_name)
            logger.debug('Subtable %s ready', table_name)
            return table_name
        except Exception as e:
            logger.error(f'Failed to create subtable: {e}')
            return None

    _TELEMETRY_FIELDS = (
        'temperature', 'humidity', 'wind_speed', 'wind_direction',
        'light_intensity', 'soil_moisture_10cm', 'soil_moisture_30cm',
        'soil_moisture_60cm', 'fuel_moisture', 'thermal_max_temp',
        'thermal_min_temp', 'thermal_avg_temp',
    )

    def _values_clause(self, telemetry_data: dict) -> str:
        values = ['NOW']
        for field in self._TELEMETRY_FIELDS:
            if field in telemetry_data and telemetry_data[field] is not None:
                val = telemetry_data[field]
                if isinstance(val, bool):
                    values.append('1' if val else '0')
                else:
                    values.append(str(val))
            else:
                values.append('NULL')
        return f"({', '.join(values)})"

    def write_telemetry(self, device_id, device_type, region, telemetry_data):
        """写入单条遥测数据"""
        try:
            self.connect()
            self._execute(f"USE {self.config['DATABASE']}")

            table_name = self.create_subtable(device_id, device_type, region)
            if not table_name:
                return False

            columns = ['ts', *self._TELEMETRY_FIELDS]
            sql = (
                f"INSERT INTO {table_name} ({', '.join(columns)}) "
                f"VALUES {self._values_clause(telemetry_data)}"
            )
            self._execute(sql)
            logger.debug('Telemetry written for device %s table=%s', device_id, table_name)
            return True
        except Exception as e:
            logger.error(f'Failed to write telemetry: {e}')
            return False

    def write_telemetry_batch(self, rows: list[dict]) -> int:
        """
        批量写入。
        rows: [{device_id, device_type, region, telemetry_data}, ...]
        返回成功条数。
        """
        if not rows:
            return 0
        try:
            self.connect()
            self._execute(f"USE {self.config['DATABASE']}")
            if not self._stable_ready:
                self.create_supertable()

            # 按表聚合多值 INSERT：INSERT INTO t1 VALUES (...),(...); INSERT INTO t2 ...
            by_table: dict[str, list[str]] = {}
            meta: dict[str, tuple[str, str, str]] = {}
            for row in rows:
                device_id = row.get('device_id') or ''
                device_type = row.get('device_type') or ''
                region = row.get('region') or ''
                data = row.get('telemetry_data') or {}
                table_name = self.create_subtable(device_id, device_type, region)
                if not table_name:
                    continue
                by_table.setdefault(table_name, []).append(self._values_clause(data))
                meta[table_name] = (device_id, device_type, region)

            columns = ['ts', *self._TELEMETRY_FIELDS]
            col_sql = ', '.join(columns)
            ok = 0
            for table_name, value_list in by_table.items():
                # 分片，避免单 SQL 过长
                chunk_size = 50
                for i in range(0, len(value_list), chunk_size):
                    chunk = value_list[i:i + chunk_size]
                    sql = f"INSERT INTO {table_name} ({col_sql}) VALUES {', '.join(chunk)}"
                    self._execute(sql)
                    ok += len(chunk)
            logger.info('TDengine batch wrote %s/%s rows across %s tables', ok, len(rows), len(by_table))
            return ok
        except Exception as e:
            logger.error('Failed to batch write telemetry: %s', e)
            return 0

    def query_telemetry(self, device_id, start_time, end_time, fields=None):
        """查询遥测数据"""
        try:
            self.connect()
            self._execute(f"USE {self.config['DATABASE']}")

            table_name = self._table_name(device_id)

            if fields:
                field_str = ', '.join(fields)
            else:
                field_str = '*'

            sql = f"""
                SELECT {field_str} FROM {table_name}
                WHERE ts >= '{start_time}' AND ts <= '{end_time}'
                ORDER BY ts DESC
                LIMIT 1000
            """

            self._execute(sql)
            rows = self.cursor.fetchall()

            columns = [desc[0] for desc in self.cursor.description] if self.cursor.description else []
            data = [dict(zip(columns, row)) for row in rows]

            return data
        except Exception as e:
            logger.error(f'Failed to query telemetry: {e}')
            return []

    def disconnect(self):
        """断开连接（在进程退出/热重载前主动调用，避免 taos __del__ 噪音）"""
        self._known_tables.clear()
        self._stable_ready = False
        cursor, self.cursor = self.cursor, None
        conn, self.conn = self.conn, None
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass
        if conn is not None:
            _safe_close_taos_connection(conn)
            logger.info('Disconnected from TDengine')


# 全局客户端实例
tdengine_client = None


def get_tdengine_client():
    """获取 TDengine 客户端实例"""
    global tdengine_client
    if tdengine_client is None:
        tdengine_client = TDengineClient()
        tdengine_client.connect()
    return tdengine_client


def close_tdengine_client():
    """释放全局 TDengine 连接。"""
    global tdengine_client
    client = tdengine_client
    tdengine_client = None
    if client is not None:
        try:
            client.disconnect()
        except Exception:
            pass


atexit.register(close_tdengine_client)


def write_telemetry(device_id, device_type, region, telemetry_data):
    """写入遥测数据"""
    client = get_tdengine_client()
    return client.write_telemetry(device_id, device_type, region, telemetry_data)


def write_telemetry_batch(rows: list[dict]) -> int:
    """批量写入遥测。"""
    client = get_tdengine_client()
    return client.write_telemetry_batch(rows)


def query_telemetry(device_id, start_time, end_time, fields=None):
    """查询遥测数据"""
    client = get_tdengine_client()
    return client.query_telemetry(device_id, start_time, end_time, fields)