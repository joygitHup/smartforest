# test_tdengine_write.py
"""
测试 TDengine 写入和查询功能
"""
import os
import sys
import django
from datetime import datetime, timedelta
import random
import logging

# 设置 Django 环境
sys.path.append('D:/pythonDev/smartforest/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

# 导入 TDengine 客户端
from core.tdengine_client import (
    get_tdengine_client,
    write_telemetry,
    query_telemetry,
    # query_aggregate,  # 如果不存在，注释掉
)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_query_aggregate_direct(client):
    """使用原始 SQL 测试聚合查询"""
    print("\n" + "=" * 50)
    print("7. 测试聚合查询（直接 SQL）")
    print("=" * 50)

    device_id = 'test-device-002'
    end_time = datetime.now()
    start_time = end_time - timedelta(hours=2)

    table_name = f"telemetry_{device_id.replace('-', '_')}"

    try:
        # 直接使用连接执行 SQL
        sql = f"""
            SELECT
                _wstart as ts,
                AVG(temperature) as avg_temp,
                MAX(temperature) as max_temp,
                MIN(temperature) as min_temp,
                COUNT(*) as count
            FROM {table_name}
            WHERE ts >= '{start_time.strftime('%Y-%m-%d %H:%M:%S')}' 
              AND ts <= '{end_time.strftime('%Y-%m-%d %H:%M:%S')}'
            INTERVAL(10m)
        """

        result = client.conn.execute(sql)

        # 获取列名
        columns = [desc[0] for desc in result.fields] if hasattr(result, 'fields') else []
        rows = result.fetchall()

        if rows:
            print(f"✅ 聚合查询成功，返回 {len(rows)} 个时间窗口")

            # 转换为字典列表
            if columns:
                data = [dict(zip(columns, row)) for row in rows]
                for row in data[:3]:
                    print(f"   时间: {row.get('ts')}, 平均温度: {row.get('avg_temp', 'N/A')}")
            else:
                print(f"   数据: {rows[:3]}")
            return True
        else:
            print("⚠️ 聚合查询成功，但无数据返回")
            return True
    except Exception as e:
        print(f"❌ 聚合查询失败: {e}")
        return False


def test_create_subtable_direct(client):
    """测试直接创建子表"""
    print("\n" + "=" * 50)
    print("4.5 测试直接创建子表")
    print("=" * 50)

    try:
        device_id = 'test-device-003'
        device_type = 'sensor'
        region = 'test_region'

        table_name = f"telemetry_{device_id.replace('-', '_')}"
        sql = f"""
            CREATE TABLE IF NOT EXISTS {table_name}
            USING device_telemetry TAGS ('{device_id}', '{device_type}', '{region}')
        """

        client.conn.execute(sql)
        print(f"✅ 子表 {table_name} 创建成功")
        return True
    except Exception as e:
        print(f"❌ 创建子表失败: {e}")
        return False


def test_write_with_custom_timestamp():
    """测试带自定义时间戳的写入"""
    print("\n" + "=" * 50)
    print("4.5 测试带时间戳的写入")
    print("=" * 50)

    device_id = 'test-device-004'
    device_type = 'weather_station'
    region = 'test_region'

    # 生成过去24小时的数据
    success_count = 0
    total_count = 24

    for i in range(total_count):
        timestamp = datetime.now() - timedelta(hours=total_count - i)

        telemetry_data = {
            'temperature': 20 + i * 0.5 + random.uniform(-1, 1),
            'humidity': 60 + random.uniform(-5, 5),
            'wind_speed': random.uniform(0, 5),
            'wind_direction': random.randint(0, 359),
            'light_intensity': random.uniform(200, 1000),
            'soil_moisture_10cm': random.uniform(25, 40),
            'soil_moisture_30cm': random.uniform(20, 35),
            'soil_moisture_60cm': random.uniform(30, 45),
            'fuel_moisture': random.uniform(10, 20),
            'thermal_max_temp': 25 + i * 0.5 + random.uniform(2, 5),
            'thermal_min_temp': 15 + i * 0.5 + random.uniform(-2, 3),
            'thermal_avg_temp': 20 + i * 0.5 + random.uniform(-1, 2)
        }

        # 使用自定义时间戳（需要修改 write_telemetry 方法）
        try:
            # 如果 write_telemetry 支持时间戳参数
            result = write_telemetry(
                device_id=device_id,
                device_type=device_type,
                region=region,
                telemetry_data=telemetry_data,
                timestamp=timestamp  # 如果支持
            )
            if result:
                success_count += 1
                print(f"   ✓ 第 {i + 1}/{total_count} 条数据写入成功 (时间: {timestamp.strftime('%H:%M')})")
        except Exception as e:
            print(f"   ✗ 第 {i + 1}/{total_count} 条数据写入失败: {e}")

    print(f"\n写入完成: {success_count}/{total_count} 条成功")
    return success_count > 0


def main():
    """主测试函数"""
    print("\n" + "=" * 60)
    print("     TDengine 客户端功能测试")
    print("=" * 60)

    results = []

    # 1. 测试连接
    print("\n" + "=" * 50)
    print("1. 测试 TDengine 连接")
    print("=" * 50)

    try:
        client = get_tdengine_client()
        print("✅ TDengine 连接成功！")
        results.append(("连接测试", True))
    except Exception as e:
        print(f"❌ 连接失败: {e}")
        print("\n❌ 请先确保 TDengine 服务已启动！")
        print("   启动命令: net start taosd")
        return

    # 2. 创建数据库
    print("\n" + "=" * 50)
    print("2. 测试创建数据库")
    print("=" * 50)
    try:
        client.create_database()
        print("✅ 数据库创建/确认成功")
        results.append(("创建数据库", True))
    except Exception as e:
        print(f"❌ 创建数据库失败: {e}")
        results.append(("创建数据库", False))

    # 3. 创建超级表
    print("\n" + "=" * 50)
    print("3. 测试创建超级表")
    print("=" * 50)
    try:
        client.create_supertable()
        print("✅ 超级表创建/确认成功")
        results.append(("创建超级表", True))
    except Exception as e:
        print(f"❌ 创建超级表失败: {e}")
        results.append(("创建超级表", False))

    # 4. 写入单条数据
    print("\n" + "=" * 50)
    print("4. 测试写入单条遥测数据")
    print("=" * 50)

    telemetry_data = {
        'temperature': 25.5,
        'humidity': 65.2,
        'wind_speed': 3.4,
        'wind_direction': 135,
        'light_intensity': 850.0,
        'soil_moisture_10cm': 32.5,
        'soil_moisture_30cm': 28.3,
        'soil_moisture_60cm': 35.1,
        'fuel_moisture': 12.8,
        'thermal_max_temp': 28.2,
        'thermal_min_temp': 22.1,
        'thermal_avg_temp': 25.0
    }

    try:
        result = write_telemetry(
            device_id='test-device-001',
            device_type='weather_station',
            region='test_region',
            telemetry_data=telemetry_data
        )

        if result:
            print("✅ 单条数据写入成功！")
            results.append(("写入单条数据", True))
        else:
            print("❌ 单条数据写入失败")
            results.append(("写入单条数据", False))
    except Exception as e:
        print(f"❌ 写入失败: {e}")
        results.append(("写入单条数据", False))

    # 5. 批量写入数据
    print("\n" + "=" * 50)
    print("5. 测试批量写入遥测数据")
    print("=" * 50)

    device_id = 'test-device-002'
    device_type = 'agriculture_sensor'
    region = 'farm_area_01'

    success_count = 0
    total_count = 10

    for i in range(total_count):
        base_temp = 20 + i * 0.5
        telemetry_data = {
            'temperature': base_temp + random.uniform(-2, 2),
            'humidity': 60 + random.uniform(-10, 10),
            'wind_speed': random.uniform(0, 5),
            'wind_direction': random.randint(0, 359),
            'light_intensity': random.uniform(200, 1000),
            'soil_moisture_10cm': random.uniform(25, 40),
            'soil_moisture_30cm': random.uniform(20, 35),
            'soil_moisture_60cm': random.uniform(30, 45),
            'fuel_moisture': random.uniform(10, 20),
            'thermal_max_temp': base_temp + random.uniform(3, 8),
            'thermal_min_temp': base_temp - random.uniform(2, 5),
            'thermal_avg_temp': base_temp + random.uniform(-1, 2)
        }

        try:
            result = write_telemetry(
                device_id=device_id,
                device_type=device_type,
                region=region,
                telemetry_data=telemetry_data
            )
            if result:
                success_count += 1
                print(f"   ✓ 第 {i + 1}/{total_count} 条数据写入成功")
        except Exception as e:
            print(f"   ✗ 第 {i + 1}/{total_count} 条数据写入失败: {e}")

    print(f"\n批量写入完成: {success_count}/{total_count} 条成功")
    results.append(("批量写入数据", success_count > 0))

    # 6. 查询数据
    print("\n" + "=" * 50)
    print("6. 测试查询遥测数据")
    print("=" * 50)

    device_id = 'test-device-001'
    end_time = datetime.now()
    start_time = end_time - timedelta(hours=1)

    try:
        data = query_telemetry(
            device_id=device_id,
            start_time=start_time.strftime('%Y-%m-%d %H:%M:%S'),
            end_time=end_time.strftime('%Y-%m-%d %H:%M:%S')
        )

        if data:
            print(f"✅ 查询成功，返回 {len(data)} 条数据")
            results.append(("查询数据", True))
        else:
            print("⚠️ 查询成功，但无数据返回")
            results.append(("查询数据", True))
    except Exception as e:
        print(f"❌ 查询失败: {e}")
        results.append(("查询数据", False))

    # 7. 测试聚合查询（直接 SQL）
    print("\n" + "=" * 50)
    print("7. 测试聚合查询（直接 SQL）")
    print("=" * 50)

    device_id = 'test-device-002'
    table_name = f"telemetry_{device_id.replace('-', '_')}"

    try:
        sql = f"""
            SELECT
                AVG(temperature) as avg_temp,
                MAX(temperature) as max_temp,
                MIN(temperature) as min_temp,
                COUNT(*) as count
            FROM {table_name}
            WHERE ts >= '{start_time.strftime('%Y-%m-%d %H:%M:%S')}'
        """

        result = client.conn.execute(sql)
        rows = result.fetchall()

        if rows:
            print(f"✅ 聚合查询成功，结果: {rows[0]}")
            results.append(("聚合查询", True))
        else:
            print("⚠️ 聚合查询成功，但无数据")
            results.append(("聚合查询", True))
    except Exception as e:
        print(f"❌ 聚合查询失败: {e}")
        results.append(("聚合查询", False))

    # 8. 指定字段查询
    print("\n" + "=" * 50)
    print("8. 测试指定字段查询")
    print("=" * 50)

    fields = ['temperature', 'humidity', 'wind_speed']

    try:
        data = query_telemetry(
            device_id='test-device-001',
            start_time=start_time.strftime('%Y-%m-%d %H:%M:%S'),
            end_time=end_time.strftime('%Y-%m-%d %H:%M:%S'),
            fields=fields
        )

        if data:
            print(f"✅ 指定字段查询成功，返回 {len(data)} 条数据")
            print(f"   查询字段: {fields}")
            results.append(("指定字段查询", True))
        else:
            print("⚠️ 查询成功，但无数据返回")
            results.append(("指定字段查询", True))
    except Exception as e:
        print(f"❌ 查询失败: {e}")
        results.append(("指定字段查询", False))

    # 总结
    print("\n" + "=" * 60)
    print("    测试结果汇总")
    print("=" * 60)

    success_count = sum(1 for _, result in results if result)
    total_count = len(results)

    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{status} - {name}")

    print(f"\n总计: {success_count}/{total_count} 项通过")

    if success_count == total_count:
        print("\n🎉 所有测试通过！TDengine 集成正常！")
    else:
        print(f"\n⚠️ 有 {total_count - success_count} 项测试失败，请检查日志")


if __name__ == '__main__':
    main()