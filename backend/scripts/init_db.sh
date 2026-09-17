#!/bin/bash
set -e

echo "Waiting for PostgreSQL..."
while ! nc -z ${DATABASE_HOST:-localhost} ${DATABASE_PORT:-5432}; do
  sleep 1
done
echo "PostgreSQL started"

echo "Waiting for Redis..."
while ! nc -z ${REDIS_HOST:-localhost} ${REDIS_PORT:-6379}; do
  sleep 1
done
echo "Redis started"

echo "Waiting for InfluxDB..."
while ! nc -z ${INFLUXDB_HOST:-localhost} ${INFLUXDB_PORT:-8086}; do
  sleep 1
done
echo "InfluxDB started"

echo "Running migrations..."
python manage.py migrate --noinput

echo "Initializing InfluxDB bucket (auto-created on first connect)..."
python manage.py shell -c "
from core.influxdb_client import get_influxdb_client
client = get_influxdb_client()
client.connect()
print('InfluxDB initialized')
"

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Creating superuser if not exists..."
python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@example.com', 'admin123')
    print('Superuser created')
else:
    print('Superuser already exists')
"

echo "Database initialization completed!"
