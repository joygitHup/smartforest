"""
IoT / Kafka 管线健康与探测 API。
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.kafka_client import check_kafka_health, publish_device_event


class PipelineHealthView(APIView):
    """GET /api/pipeline/health/ — Kafka / 管线状态"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        kafka = check_kafka_health()
        return Response(
            {
                'kafka': kafka,
                'pipeline': {
                    'enabled': kafka.get('use_kafka_pipeline'),
                    'path': 'MQTT → Kafka → consume_kafka → Celery → DB'
                    if kafka.get('use_kafka_pipeline')
                    else 'MQTT → Celery → DB (Kafka disabled)',
                },
            }
        )


class PipelineKafkaPublishView(APIView):
    """
    POST /api/pipeline/kafka/publish/
    手动向 Kafka 投递一条设备事件（便于联调）。
    body: { device_id, message_type, payload? }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        device_id = request.data.get('device_id')
        message_type = request.data.get('message_type', 'telemetry')
        payload = request.data.get('payload') or {}

        if not device_id:
            return Response({'error': 'device_id required'}, status=400)
        if message_type not in ('telemetry', 'alert', 'status'):
            return Response({'error': 'message_type must be telemetry|alert|status'}, status=400)

        from apps.devices.models import Device
        from apps.users.org_scope import filter_by_org_scope

        device_qs = filter_by_org_scope(
            Device.objects.filter(device_id=str(device_id)),
            request.user,
        )
        if not device_qs.exists():
            return Response({'error': 'device not found or out of organization scope'}, status=404)

        if not payload:
            from django.utils import timezone

            now = timezone.now().isoformat()
            if message_type == 'telemetry':
                payload = {'temperature': 30, 'humidity': 50, 'source': 'api', 'timestamp': now}
            elif message_type == 'status':
                payload = {'status': 'online', 'timestamp': now, 'source': 'api'}
            else:
                payload = {
                    'title': 'API Kafka publish',
                    'alert_type': 'high_temp',
                    'alert_level': 'level_3',
                    'source': 'api',
                    'timestamp': now,
                }

        ok = publish_device_event(
            message_type=message_type,
            device_id=str(device_id),
            payload=payload,
        )
        if not ok:
            return Response({'ok': False, 'error': 'Kafka publish failed'}, status=502)
        return Response(
            {
                'ok': True,
                'device_id': device_id,
                'message_type': message_type,
                'hint': 'Ensure `python manage.py consume_kafka` is running to process the message',
            }
        )
