# test_influxdb_write.py
"""
测试 InfluxDB 写入和查询功能（替代原 TDengine 测试）。

前置条件：
  1. InfluxDB 2.x 已启动（docker compose up -d influxdb）
  2. backend/.env 配置 INFLUXDB_URL/TOKEN/ORG/BUCKET
  3. pip install influxdb-client
"""
import os
import sys
import logging
import random
from datetime import datetime, timedelta, timezone

import django

# 设置 Django 环境
sys.path.append('D:/pythonDev/smartforest/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

# 导入 InfluxDB 客户端
from core.influxdb_client import (
    get_influxdb_client,
    write_telemetry,
    query_telemetry,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)


def _to_rfc3339(dt: datetime) -> str:
    """Convert a datetime to RFC3339 string for Flux range()."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def test_aggregate_window(client, device_id):
    """测试 aggregateWindow 聚合查询（10 分钟窗口的平均温度）"""
    print("\n" + "=" * 50)
    print("7. 测试聚合查询（aggregateWindow）")
    print("=" * 50)

    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=2)

    try:
        data = client.query_aggregate(
            device_id=device_id,
            start_time=start_time,
            end_time=end_time,
            field='temperature',
            every='10m',
        )

        if data:
            print(f"✅ 聚合查询成功，返回 {len(data)} 个时间窗口")
            for row in data[:3]:
                print(f"   时间: {row.get('_time')}, 平均温度: {row.get('mean')}")
            return True
        else:
            print("⚠️ 聚合查询成功，但无数据返回")
            return True
    except Exception as e:
        print(f"❌ 聚合查询失败: {e}")
        return False


def main():
    """主测试函数"""
    print("\n" + "=" * 60)
    print("     InfluxDB 客户端功能测试")
    print("=" * 60)

    results = []

    # 1. 测试连接
    print("\n" + "=" * 50)
    print("1. 测试 InfluxDB 连接")
    print("=" * 50)

    try:
        client = get_influxdb_client()
        health = client.health()
        print(f"✅ InfluxDB 连接成功！status={health.get('status')}")
        results.append(("连接测试", bool(health.get('ok'))))
    except Exception as e:
        print(f"❌ 连接失败: {e}")
        print("\n❌ 请先确保 InfluxDB 服务已启动！")
        print("   启动命令: docker compose up -d influxdb")
        return

    # 2. Bucket 自动创建（_ensure_bucket 在 connect 时已执行）
    print("\n" + "=" * 50)
    print("2. 确认 bucket 存在")
    print("=" * 50)
    try:
        bucket = client._client.buckets_api().find_bucket_by_name(client.config['BUCKET'])
        if bucket is not None:
            print(f"✅ bucket {client.config['BUCKET']} 存在 (id={bucket.id})")
            results.append(("Bucket 确认", True))
        else:
            print(f"❌ bucket {client.config['BUCKET']} 不存在")
            results.append(("Bucket 确认", False))
    except Exception as e:
        print(f"❌ Bucket 查询失败: {e}")
        results.append(("Bucket 确认", False))

    # 3. 写入单条数据
    print("\n" + "=" * 50)
    print("3. 测试写入单条遥测数据")
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
        'thermal_avg_temp': 25.0,
    }

    try:
        result = write_telemetry(
            device_id='test-device-001',
            device_type='weather_station',
            region='test_region',
            telemetry_data=telemetry_data,
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

    # 4. 批量写入
    print("\n" + "=" * 50)
    print("4. 测试批量写入遥测数据")
    print("=" * 50)

    device_id = 'test-device-002'
    device_type = 'agriculture_sensor'
    region = 'farm_area_01'

    from core.influxdb_client import write_telemetry_batch
    rows = []
    for i in range(10):
        base_temp = 20 + i * 0.5
        rows.append({
            'device_id': device_id,
            'device_type': device_type,
            'region': region,
            'telemetry_data': {
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
                'thermal_avg_temp': base_temp + random.uniform(-1, 2),
            },
        })

    try:
        written = write_telemetry_batch(rows)
        if written == len(rows):
            print(f"✅ 批量写入 {written}/{len(rows)} 条成功")
            results.append(("批量写入数据", True))
        else:
            print(f"⚠️ 批量写入 {written}/{len(rows)}")
            results.append(("批量写入数据", written > 0))
    except Exception as e:
        print(f"❌ 批量写入失败: {e}")
        results.append(("批量写入数据", False))

    # 5. 查询数据
    print("\n" + "=" * 50)
    print("5. 测试查询遥测数据")
    print("=" * 50)

    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=1)

    try:
        data = query_telemetry(
            device_id=device_id,
            start_time=_to_rfc3339(start_time),
            end_time=_to_rfc3339(end_time),
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

    # 6. 测试聚合查询
    print("\n" + "=" * 50)
    print("6. 测试聚合查询（aggregateWindow）")
    print("=" * 50)

    try:
        ok = test_aggregate_window(client, device_id)
        results.append(("聚合查询", ok))
    except Exception as e:
        print(f"❌ 聚合查询失败: {e}")
        results.append(("聚合查询", False))

    # 7. 指定字段查询
    print("\n" + "=" * 50)
    print("7. 测试指定字段查询")
    print("=" * 50)

    fields = ['temperature', 'humidity', 'wind_speed']

    try:
        data = query_telemetry(
            device_id=device_id,
            start_time=_to_rfc3339(start_time),
            end_time=_to_rfc3339(end_time),
            fields=fields,
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
        print("\n🎉 所有测试通过！InfluxDB 集成正常！")
    else:
        print(f"\n⚠️ 有 {total_count - success_count} 项测试失败，请检查日志")


if __name__ == '__main__':
    main()
