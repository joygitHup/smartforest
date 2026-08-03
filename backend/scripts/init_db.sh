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

echo "Waiting for TDengine..."
while ! nc -z ${TDENGINE_HOST:-localhost} ${TDENGINE_PORT:-6030}; do
  sleep 1
done
echo "TDengine started"

echo "Running migrations..."
python manage.py migrate --noinput

echo "Creating TDengine database and tables..."
python manage.py shell -c "
from core.tdengine_client import get_tdengine_client
client = get_tdengine_client()
client.create_database()
client.create_supertable()
print('TDengine initialized')
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
