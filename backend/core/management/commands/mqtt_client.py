"""
Start MQTT client: Device → EMQX → (Kafka publish) → …
"""
import signal
import time

from django.core.management.base import BaseCommand

from core.mqtt_client import MQTTClient


class Command(BaseCommand):
    help = 'Start MQTT client (subscribe EMQX and forward to Kafka / Celery)'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting MQTT client...'))
        client = MQTTClient()
        client.connect()

        stop = {'flag': False}

        def _stop(signum, frame):
            stop['flag'] = True

        signal.signal(signal.SIGINT, _stop)
        signal.signal(signal.SIGTERM, _stop)

        self.stdout.write('MQTT client running. Press Ctrl+C to stop.')
        try:
            while not stop['flag']:
                time.sleep(1)
        finally:
            self.stdout.write('Stopping MQTT client...')
            client.disconnect()
            self.stdout.write(self.style.SUCCESS('MQTT client stopped'))
