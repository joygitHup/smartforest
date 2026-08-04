# core/tdengine_client.py
"""
TDengine client for time-series data storage (Native Driver)
"""
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


class TDengineClient:
    """TDengine 客户端 (原生驱动)"""

    def __init__(self):
        self.conn = None
        self.cursor = None
        self.config = settings.TDENGINE_CONFIG

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
            # 先使用数据库
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
            logger.info('Supertable device_telemetry created/verified')
            return True
        except Exception as e:
            logger.error(f'Failed to create supertable: {e}')
            return False

    def create_subtable(self, device_id, device_type, region):
        """创建子表"""
        try:
            self.connect()
            table_name = f"telemetry_{device_id.replace('-', '_')}"
            sql = f"""
                CREATE TABLE IF NOT EXISTS {table_name}
                USING device_telemetry TAGS ('{device_id}', '{device_type}', '{region}')
            """
            self._execute(sql)
            logger.info(f'Subtable {table_name} created/verified')
            return table_name
        except Exception as e:
            logger.error(f'Failed to create subtable: {e}')
            return None

    def write_telemetry(self, device_id, device_type, region, telemetry_data):
        """写入遥测数据"""
        try:
            self.connect()
            self._execute(f"USE {self.config['DATABASE']}")

            table_name = self.create_subtable(device_id, device_type, region)
            if not table_name:
                return False

            # 构建插入语句
            columns = ['ts']
            values = ['NOW']

            telemetry_fields = [
                'temperature', 'humidity', 'wind_speed', 'wind_direction',
                'light_intensity', 'soil_moisture_10cm', 'soil_moisture_30cm',
                'soil_moisture_60cm', 'fuel_moisture', 'thermal_max_temp',
                'thermal_min_temp', 'thermal_avg_temp'
            ]

            for field in telemetry_fields:
                columns.append(field)
                if field in telemetry_data and telemetry_data[field] is not None:
                    values.append(str(telemetry_data[field]))
                else:
                    values.append('NULL')

            sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({', '.join(values)})"
            self._execute(sql)

            logger.info(f'Telemetry written for device {device_id}')
            return True
        except Exception as e:
            logger.error(f'Failed to write telemetry: {e}')
            return False

    def query_telemetry(self, device_id, start_time, end_time, fields=None):
        """查询遥测数据"""
        try:
            self.connect()
            self._execute(f"USE {self.config['DATABASE']}")

            table_name = f"telemetry_{device_id.replace('-', '_')}"

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

            # 获取列名
            columns = [desc[0] for desc in self.cursor.description] if self.cursor.description else []
            data = [dict(zip(columns, row)) for row in rows]

            return data
        except Exception as e:
            logger.error(f'Failed to query telemetry: {e}')
            return []

    def disconnect(self):
        """断开连接"""
        if self.conn:
            self.conn.close()
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


def write_telemetry(device_id, device_type, region, telemetry_data):
    """写入遥测数据"""
    client = get_tdengine_client()
    return client.write_telemetry(device_id, device_type, region, telemetry_data)


def query_telemetry(device_id, start_time, end_time, fields=None):
    """查询遥测数据"""
    client = get_tdengine_client()
    return client.query_telemetry(device_id, start_time, end_time, fields)