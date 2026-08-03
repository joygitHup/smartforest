# 项目上下文

## 前端技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 后端技术栈

- **应用框架**: Django 5.x + DRF
- **实时通信**: Django Channels (WebSocket)
- **设备接入**: EMQX (MQTT Broker)
- **消息队列**: RabbitMQ + Kafka
- **任务调度**: Celery + Redis
- **业务数据库**: PostgreSQL 15+
- **时序数据库**: TDengine
- **缓存**: Redis
- **文件存储**: 阿里云OSS / MinIO
- **容器编排**: Docker + Kubernetes
- **监控**: Prometheus + Grafana

## 目录结构

### 前端目录

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── devices/        # 设备管理页面
│   │   ├── alerts/         # 告警管理页面
│   │   ├── fire-tracing/   # 火情溯源与蔓延推演
│   │   ├── reports/        # 报表中心
│   │   ├── settings/       # 系统设置
│   │   └── diagnostics/    # 运维诊断
│   ├── components/
│   │   ├── ui/             # Shadcn UI 组件库
│   │   └── layout/         # 布局组件（侧边栏、顶部导航）
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   ├── utils.ts        # 通用工具函数 (cn)
│   │   └── mock-data.ts    # 模拟数据
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

### 后端目录

```
├── backend/
│   ├── config/                 # Django 配置
│   │   ├── settings.py        # 主配置
│   │   ├── urls.py            # 路由配置
│   │   ├── asgi.py            # ASGI 入口（WebSocket）
│   │   ├── wsgi.py            # WSGI 入口
│   │   └── celery.py          # Celery 配置
│   ├── apps/                  # 业务应用
│   │   ├── devices/           # 设备管理
│   │   ├── alerts/            # 告警管理
│   │   ├── reports/           # 报表中心
│   │   └── users/             # 用户管理
│   ├── core/                  # 核心模块
│   │   ├── consumers.py       # WebSocket 消费者
│   │   ├── routing.py         # WebSocket 路由
│   │   ├── mqtt_client.py     # MQTT 客户端
│   │   └── tdengine_client.py # TDengine 客户端
│   ├── scripts/               # 脚本
│   ├── docker/                # Docker 配置
│   ├── docker-compose.yml     # Docker Compose
│   ├── requirements.txt       # Python 依赖
│   └── manage.py              # Django 管理命令
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

### 前端

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

### 后端

**使用 pip** 管理 Python 依赖。
**常用命令**：
- 安装依赖：`pip install -r requirements.txt`
- 导出依赖：`pip freeze > requirements.txt`
- 创建虚拟环境：`python -m venv venv`
- 激活虚拟环境：`source venv/bin/activate` (Linux/Mac)

## 后端开发规范

### Django 开发规范

1. **应用结构**：每个业务模块独立为一个 Django app
2. **模型设计**：使用 Django ORM，复杂查询使用 `select_related` 和 `prefetch_related`
3. **序列化器**：使用 DRF Serializer，支持嵌套序列化
4. **视图**：优先使用 ViewSet + Router，复杂逻辑使用 APIView
5. **权限控制**：使用 DRF Permission 类，支持 RBAC
6. **认证**：使用 JWT (SimpleJWT)
7. **分页**：使用 PageNumberPagination，默认每页 20 条
8. **过滤**：使用 django-filter
9. **异步任务**：使用 Celery，任务定义在 `tasks.py`
10. **日志**：使用 structlog，结构化日志

### 数据库规范

1. **PostgreSQL**：存储业务数据（设备、告警、用户等）
2. **TDengine**：存储时序数据（遥测数据）
3. **Redis**：缓存、会话、Celery 队列
4. **索引**：为常用查询字段创建索引
5. **迁移**：使用 `python manage.py makemigrations` 和 `migrate`

### API 设计规范

1. **RESTful 风格**：资源命名使用名词复数
2. **版本控制**：URL 中包含版本号 `/api/v1/`
3. **响应格式**：统一使用 `{code, message, data}` 格式
4. **错误处理**：使用 DRF 异常处理器，返回标准错误格式
5. **文档**：使用 drf-spectacular 自动生成 OpenAPI 文档

### WebSocket 规范

1. **路由**：使用 Django Channels routing
2. **消费者**：使用 AsyncWebsocketConsumer
3. **认证**：WebSocket 连接时验证 JWT Token
4. **心跳**：客户端定期发送 ping，服务端回复 pong
5. **重连**：客户端实现自动重连机制

### MQTT 规范

1. **主题格式**：`forest/{device_type}/{device_id}/{message_type}`
2. **QoS**：遥测数据使用 QoS 0，控制指令使用 QoS 1
3. **遗嘱消息**：设备离线时发布遗嘱消息
4. **数据格式**：使用 JSON 格式

### Celery 规范

1. **任务定义**：使用 `@shared_task` 装饰器
2. **重试机制**：使用 `autoretry_for` 和 `retry_backoff`
3. **超时**：设置 `soft_time_limit` 和 `time_limit`
4. **监控**：使用 Flower 监控 Celery 任务

### Docker 规范

1. **镜像**：使用多阶段构建，减小镜像体积
2. **非 root 用户**：使用非 root 用户运行
3. **健康检查**：配置 HEALTHCHECK
4. **日志**：日志输出到 stdout/stderr
5. **环境变量**：使用环境变量配置，不硬编码

### Kubernetes 规范

1. **Deployment**：使用 Deployment 管理 Pod
2. **Service**：使用 ClusterIP 暴露服务
3. **HPA**：配置水平自动扩缩容
4. **资源限制**：设置 requests 和 limits
5. **健康检查**：配置 livenessProbe 和 readinessProbe

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## 物联网监控平台规范

### 设计风格
- 深色主题：背景 #0a1628，面板 #152238，边框 #1e3a5f
- 强调色：信息蓝 #3b82f6，成功绿 #10b981，警告橙 #f59e0b，危险红 #ef4444
- 等宽字体用于数据展示
- 微光效果用于强调元素

### 统一翻页组件
- 全局使用 `src/components/ui/pagination.tsx`
- 深色主题适配，支持紧凑模式
- 所有列表页面统一使用此组件

### 页面结构
- 侧边栏导航 + 顶部状态栏 + 主内容区
- 响应式布局，适配大屏和桌面端
