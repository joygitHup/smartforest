"""
TDengine client for time-series data storage.
"""
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


class TDengineClient:
    """TDengine 客户端"""
    
    def __init__(self):
        self.conn = None
        self.config = settings.TDENGINE_CONFIG
    
    def connect(self):
        """连接 TDengine"""
        try:
            import taos
            self.conn = taos.connect(
                host=self.config['HOST'],
                port=self.config['PORT'],
                user=self.config['USER'],
                password=self.config['PASSWORD'],
                database=self.config['DATABASE']
            )
            logger.info('Connected to TDengine')
        except Exception as e:
            logger.error(f'Failed to connect to TDengine: {e}')
            raise
    
    def disconnect(self):
        """断开连接"""
        if self.conn:
            self.conn.close()
            logger.info('Disconnected from TDengine')
    
    def create_database(self):
        """创建数据库"""
        try:
            self.conn.execute(f"CREATE DATABASE IF NOT EXISTS {self.config['DATABASE']}")
            logger.info(f'Database {self.config["DATABASE"]} created')
        except Exception as e:
            logger.error(f'Failed to create database: {e}')
    
    def create_supertable(self):
        """创建超级表"""
        try:
            # 设备遥测超级表
            self.conn.execute("""
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
            """)
            logger.info('Supertable device_telemetry created')
        except Exception as e:
            logger.error(f'Failed to create supertable: {e}')
    
    def create_subtable(self, device_id, device_type, region):
        """创建子表"""
        try:
            table_name = f"telemetry_{device_id.replace('-', '_')}"
            self.conn.execute(f"""
                CREATE TABLE IF NOT EXISTS {table_name}
                USING device_telemetry TAGS ('{device_id}', '{device_type}', '{region}')
            """)
            logger.info(f'Subtable {table_name} created')
            return table_name
        except Exception as e:
            logger.error(f'Failed to create subtable: {e}')
            return None
    
    def write_telemetry(self, device_id, device_type, region, telemetry_data):
        """写入遥测数据"""
        try:
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
                if field in telemetry_data:
                    columns.append(field)
                    values.append(str(telemetry_data[field]))
                else:
                    columns.append(field)
                    values.append('NULL')
            
            sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({', '.join(values)})"
            self.conn.execute(sql)
            
            logger.info(f'Telemetry written for device {device_id}')
            return True
        except Exception as e:
            logger.error(f'Failed to write telemetry: {e}')
            return False
    
    def query_telemetry(self, device_id, start_time, end_time, fields=None):
        """查询遥测数据"""
        try:
            table_name = f"telemetry_{device_id.replace('-', '_')}"
            
            if fields:
                field_str = ', '.join(fields)
            else:
                field_str = '*'
            
            sql = f"""
                SELECT {field_str} FROM {table_name}
                WHERE ts >= '{start_time}' AND ts <= '{end_time}'
                ORDER BY ts DESC
            """
            
            result = self.conn.execute(sql)
            rows = result.fetchall()
            
            # 转换为字典列表
            columns = [desc[0] for desc in result.fields]
            data = [dict(zip(columns, row)) for row in rows]
            
            return data
        except Exception as e:
            logger.error(f'Failed to query telemetry: {e}')
            return []
    
    def query_aggregate(self, device_id, start_time, end_time, interval='1h'):
        """查询聚合数据"""
        try:
            table_name = f"telemetry_{device_id.replace('-', '_')}"
            
            sql = f"""
                SELECT
                    _wstart as ts,
                    AVG(temperature) as avg_temp,
                    MAX(temperature) as max_temp,
                    MIN(temperature) as min_temp,
                    AVG(humidity) as avg_humidity,
                    AVG(wind_speed) as avg_wind_speed,
                    MAX(wind_speed) as max_wind_speed
                FROM {table_name}
                WHERE ts >= '{start_time}' AND ts <= '{end_time}'
                INTERVAL({interval})
            """
            
            result = self.conn.execute(sql)
            rows = result.fetchall()
            
            columns = [desc[0] for desc in result.fields]
            data = [dict(zip(columns, row)) for row in rows]
            
            return data
        except Exception as e:
            logger.error(f'Failed to query aggregate: {e}')
            return []


# 全局 TDengine 客户端实例
tdengine_client = None


def get_tdengine_client():
    """获取 TDengine 客户端实例"""
    global tdengine_client
    if tdengine_client is None:
        tdengine_client = TDengineClient()
        tdengine_client.connect()
    return tdengine_client


def write_telemetry(device_id, device_type, region, telemetry_data):
    """写入遥测数据（便捷函数）"""
    client = get_tdengine_client()
    return client.write_telemetry(device_id, device_type, region, telemetry_data)


def query_telemetry(device_id, start_time, end_time, fields=None):
    """查询遥测数据（便捷函数）"""
    client = get_tdengine_client()
    return client.query_telemetry(device_id, start_time, end_time, fields)
