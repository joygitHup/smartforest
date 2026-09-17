# IoT 数据管线（本地）

## 链路

```
设备 MQTT → EMQX → [Bridge/规则 或 Django mqtt_client] → Kafka
       → consume_kafka → Celery → PostgreSQL / InfluxDB / MinIO / Alerts
```

## 主题约定

| MQTT Topic | Kafka Topic |
|---|---|
| `device/{id}/telemetry` 或 `forest/{type}/{id}/telemetry` | `forest.device.telemetry` |
| `device/{id}/alert` 或 `forest/{type}/{id}/alert` | `forest.device.alert` |
| `device/{id}/status` 或 `forest/{type}/{id}/status` | `forest.device.status` |
| `device/{id}/response`（指令 ACK） | `forest.device.response` |
| `device/{id}/command`（平台下行） | — |

Kafka 消息信封：

```json
{
  "device_id": "DC-002",
  "message_type": "telemetry",
  "payload": { "temperature": 42.5, "humidity": 30 },
  "mqtt_topic": "device/DC-002/telemetry",
  "received_at": "2026-08-07T08:00:00+00:00"
}
```

## 本地进程（需各开一个终端）

1. Django API：`python manage.py runserver`
2. Celery：`scripts\start_celery_worker.bat`（或 `python -m celery -A config worker -l info --pool=solo -Q telemetry,alerts,default`）
   - 任务路由：遥测 → `telemetry` 队列；告警/规则 → `alerts`；其余 → `default`
3. MQTT→Kafka：`scripts\start_mqtt_bridge.bat`
4. Kafka→Celery：`scripts\start_kafka_consumer.bat`

一键拉起 MQTT Bridge + Kafka Consumer：`scripts\start_iot_pipeline.bat`

冒烟（不启常驻进程）：

```bash
python manage.py ensure_kafka_topics
python manage.py kafka_smoke --consume
```

健康检查 API（需登录）：`GET /api/pipeline/health/`  
手动投递：`POST /api/pipeline/kafka/publish/` `{ "device_id": "xxx", "message_type": "telemetry" }`

环境变量（可选，见 `config/settings.py`）：

- `USE_KAFKA_PIPELINE=True`（默认；False 时 MQTT 直投 Celery）
- `KAFKA_BOOTSTRAP_SERVERS=localhost:9092`
- `KAFKA_CONSUMER_GROUP=forest-monitor-ingest`
- `KAFKA_NUM_PARTITIONS=6`（仅新建 topic 生效；扩容已有分区需手工 alter）
- `TELEMETRY_INGEST_MIN_INTERVAL=1.0`（MQTT 入口按设备削峰）
- `ALERT_RULE_DEDUP_SECONDS=300`（规则命中冷却）
- `AWS_S3_ENDPOINT_URL=http://127.0.0.1:9000`（MinIO）
- `MQTT_BROKER_HOST=localhost` / `MQTT_USERNAME` / `MQTT_PASSWORD`

## P1 吞吐要点

- Kafka：`key=device_id` 保序；Producer linger/batch/lz4；Consumer `max_poll_records` + 手动 commit
- Celery：遥测写 PG 后 `flush_influxdb_telemetry_batch` 异步批量写 InfluxDB；规则评估走 `evaluate_telemetry_rules_task`
- 热点限流：MQTT `_forward` 对 telemetry 按设备间隔丢弃；规则引擎 `allow_alert_fire` 去重
## EMQX 规则引擎 → Kafka（可选，替代 Django mqtt_client）

若已配置 EMQX Kafka Bridge，可不用 `mqtt_client`，只跑 `consume_kafka`。

示例规则 SQL（EMQX 5.x Rule Engine）：

```sql
SELECT
  clientid as device_id,
  payload,
  topic
FROM
  "device/+/telemetry"
```

Action：`Data bridge` → Kafka，Topic = `forest.device.telemetry`，
消息 value 建议包装为：

```json
{
  "device_id": "${device_id_from_topic}",
  "message_type": "telemetry",
  "payload": ${payload},
  "mqtt_topic": "${topic}"
}
```

对 `alert` / `status` 同样配置到 `forest.device.alert` / `forest.device.status`。

## MQTT 模拟器接入设备管理

### 一键模拟（推荐）

```bat
scripts\start_mqtt_simulator.bat
```

或：

```bash
python manage.py simulate_mqtt_devices                 # 注册 SIM-* 设备并持续上报
python manage.py simulate_mqtt_devices --include-demo  # 同时模拟演示设备 ZHL/ENV/...
python manage.py simulate_mqtt_devices --register-only # 只登记设备，不发 MQTT
```

模拟器会写入设备表（厂商=`MQTT模拟器`），主题：

| Topic | 说明 |
|---|---|
| `device/{device_id}/telemetry` | 遥测 |
| `device/{device_id}/status` | 在线心跳 |
| `device/{device_id}/alert` | 偶发告警 |

默认设备：`SIM-CAM-001` / `SIM-ENV-001` / `SIM-GW-001`，可在前端「设备管理」查看。

前置进程：EMQX、`mqtt_client`、`consume_kafka`、Celery。

### MQTT.fx / MQTTX 手动联调

Broker：`localhost:1883`，用户/密码：`admin` / `public`

发布示例：

- Topic: `device/SIM-CAM-001/telemetry`
- Payload:

```json
{
  "temperature": 28.5,
  "humidity": 42,
  "thermal_max_temp": 48,
  "source": "mqttfx"
}
```

若 `MQTT_AUTO_REGISTER_DEVICES=True`（默认），未知 `device_id` 会自动出现在设备列表。
