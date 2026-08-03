# 林智森林智能监控平台 - 后端系统

基于 Django 5.x + DRF 的物联网监控平台后端，支持百万级设备接入、实时告警推送、AI 推理和火情溯源。

## 技术栈

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| 应用框架 | Django 5.x + DRF | 设备管理、API服务、运维后台 |
| 实时通信 | Django Channels | 大屏WebSocket推送 |
| 设备接入 | EMQX（MQTT Broker） | 支持百万级设备连接 |
| 消息队列 | RabbitMQ + Kafka | 指令可靠投递 + 高吞吐遥测 |
| 任务调度 | Celery + Redis | 异步AI推理、告警推送 |
| 业务数据库 | PostgreSQL 15+ | 设备元数据、工单、权限 |
| 时序数据库 | TDengine | 海量传感器遥测存储 |
| 缓存 | Redis | 设备状态、会话、队列 |
| 文件存储 | 阿里云OSS / MinIO | 视频流、告警截图 |
| 容器编排 | Docker + Kubernetes | 标准化部署与弹性伸缩 |
| 监控 | Prometheus + Grafana | 全链路可观测性 |

## 项目结构

```
backend/
├── config/                 # Django 配置
│   ├── settings.py        # 主配置
│   ├── urls.py            # 路由配置
│   ├── asgi.py            # ASGI 入口（WebSocket）
│   ├── wsgi.py            # WSGI 入口
│   └── celery.py          # Celery 配置
├── apps/                  # 业务应用
│   ├── devices/           # 设备管理
│   │   ├── models.py      # 设备模型
│   │   ├── serializers.py # 序列化器
│   │   ├── views.py       # API 视图
│   │   ├── filters.py     # 过滤器
│   │   ├── urls.py        # 路由
│   │   └── tasks.py       # Celery 任务
│   ├── alerts/            # 告警管理
│   │   ├── models.py      # 告警模型
│   │   ├── serializers.py # 序列化器
│   │   ├── views.py       # API 视图
│   │   ├── filters.py     # 过滤器
│   │   ├── urls.py        # 路由
│   │   └── tasks.py       # Celery 任务
│   ├── reports/           # 报表中心
│   │   ├── models.py      # 报表模型
│   │   ├── serializers.py # 序列化器
│   │   ├── views.py       # API 视图
│   │   └── urls.py        # 路由
│   └── users/             # 用户管理
│       ├── models.py      # 用户模型
│       ├── serializers.py # 序列化器
│       ├── views.py       # API 视图
│       └── urls.py        # 路由
├── core/                  # 核心模块
│   ├── consumers.py       # WebSocket 消费者
│   ├── routing.py         # WebSocket 路由
│   ├── mqtt_client.py     # MQTT 客户端
│   ├── tdengine_client.py # TDengine 客户端
│   └── management/        # 管理命令
│       └── commands/
│           └── mqtt_client.py
├── scripts/               # 脚本
│   ├── init_db.sh         # 数据库初始化
│   └── start.sh           # 启动脚本
├── docker/                # Docker 配置
│   ├── Dockerfile         # 后端镜像
│   ├── prometheus.yml     # Prometheus 配置
│   └── k8s/               # Kubernetes 部署
│       └── backend-deployment.yaml
├── docker-compose.yml     # Docker Compose 配置
├── requirements.txt       # Python 依赖
├── manage.py              # Django 管理命令
└── .env.example           # 环境变量示例
```

## 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone <repo-url>
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 安装依赖
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
# 复制环境变量示例文件
cp .env.example .env

# 编辑 .env 文件，配置数据库、Redis、MQTT 等连接信息
```

### 3. 启动服务（Docker Compose）

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f backend

# 停止服务
docker-compose down
```

### 4. 本地开发

```bash
# 初始化数据库
bash scripts/init_db.sh

# 启动开发服务器
python manage.py runserver

# 启动 Celery Worker
celery -A config worker -l info

# 启动 Celery Beat
celery -A config beat -l info

# 启动 MQTT 客户端
python manage.py mqtt_client
```

## API 文档

启动服务后访问：
- Swagger UI: http://localhost:8000/api/docs/
- ReDoc: http://localhost:8000/api/redoc/

## 核心功能

### 设备管理
- 设备注册与认证
- 设备状态监控（在线/离线/告警）
- 云台控制（PTZ）
- 固件升级（OTA）
- 遥测数据采集（TDengine）

### 告警管理
- 三级告警分级（提示/预警/紧急）
- 告警规则引擎
- 多通道推送（WebSocket/短信/邮件）
- 告警处置流程（接单→导航→处置→反馈）
- 误报标记与AI模型迭代

### 火情溯源
- 起火点反向溯源（多设备交叉定位）
- 蔓延推演（FARSITE算法）
- 防控策略生成（隔离带/灭火装置/支援路线）

### 报表中心
- 日报/周报/月报
- 设备统计（可用率/在线时长）
- 告警分析（分级/类型/区域）
- 环境数据趋势

### 实时通信
- WebSocket 大屏推送
- MQTT 设备接入
- Kafka 高吞吐遥测
- RabbitMQ 指令可靠投递

## 数据库设计

### PostgreSQL（业务数据）
- `devices_device` - 设备信息
- `alerts_alert` - 告警记录
- `alerts_alert_rule` - 告警规则
- `reports_daily_report` - 日报
- `users_user` - 用户

### TDengine（时序数据）
- `device_telemetry` - 设备遥测超级表
  - 温度、湿度、风速、风向、光照强度
  - 土壤湿度（10cm/30cm/60cm）
  - 可燃物含水率
  - 红外热成像温度场

## 监控与可观测性

### Prometheus 指标
- Django 请求延迟、错误率
- Celery 任务执行时间、失败率
- Redis 内存使用、连接数
- PostgreSQL 查询性能
- EMQX 连接数、消息吞吐

### Grafana 仪表盘
- 系统健康度总览
- 设备在线率
- 告警趋势
- 资源使用率

## Kubernetes 部署

```bash
# 应用 Kubernetes 配置
kubectl apply -f docker/k8s/

# 查看 Pod 状态
kubectl get pods -l app=forest-backend

# 查看服务
kubectl get svc forest-backend-service

# 扩容
kubectl scale deployment forest-backend --replicas=5
```

## 开发规范

### 代码风格
- 遵循 PEP 8
- 使用 `black` 格式化
- 使用 `flake8` 检查
- 使用 `isort` 排序导入

### 测试
```bash
# 运行测试
pytest

# 运行特定测试
pytest apps/devices/tests/

# 生成覆盖率报告
pytest --cov=apps --cov-report=html
```

### API 设计
- RESTful 风格
- 使用 DRF ViewSet + Router
- 支持分页、过滤、排序
- JWT 认证
- 权限控制（RBAC）

## 安全

- HTTPS 强制
- JWT Token 认证
- API 限流
- SQL 注入防护
- XSS 防护
- CORS 配置
- 敏感数据加密

## 性能优化

- Redis 缓存热点数据
- TDengine 时序数据高效存储
- Kafka 高吞吐遥测
- Celery 异步任务
- 数据库索引优化
- 查询优化

## 故障排查

### 查看日志
```bash
# Django 日志
docker-compose logs backend

# Celery 日志
docker-compose logs celery_worker

# PostgreSQL 日志
docker-compose logs postgres

# Redis 日志
docker-compose logs redis
```

### 健康检查
```bash
# 检查服务状态
curl http://localhost:8000/health/

# 检查数据库连接
python manage.py dbshell

# 检查 Redis 连接
redis-cli ping

# 检查 MQTT 连接
mosquitto_sub -h localhost -t "test"
```

## 许可证

MIT License

## 联系方式

- 技术支持: support@forest-monitor.com
- 问题反馈: https://github.com/forest-monitor/issues
