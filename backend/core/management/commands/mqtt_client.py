"""
MQTT client management command.
"""
from django.core.management.base import BaseCommand
from core.mqtt_client import MQTTClient


class Command(BaseCommand):
    help = 'Start MQTT client for device communication'

    def handle(self, *args, **options):
        self.stdout.write('Starting MQTT client...')
        
        client = MQTTClient()
        client.connect()
        
        try:
            client.loop_forever()
        except KeyboardInterrupt:
            self.stdout.write('Stopping MQTT client...')
            client.disconnect()
