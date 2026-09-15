# Backfill ForestZone from device.forest_zone text
from django.db import migrations


def forwards(apps, schema_editor):
    Device = apps.get_model('devices', 'Device')
    ForestZone = apps.get_model('users', 'ForestZone')
    Organization = apps.get_model('users', 'Organization')
    Alert = apps.get_model('alerts', 'Alert')
    AlertRule = apps.get_model('alerts', 'AlertRule')

    root = Organization.objects.filter(code='HQ').first() or Organization.objects.order_by('id').first()
    if not root:
        return

    # (org_id, name) -> ForestZone
    cache = {}
    seq = {}

    def ensure_zone(org_id, name: str):
        name = (name or '').strip()
        if not name:
            return None
        org_id = org_id or root.id
        key = (org_id, name)
        if key in cache:
            return cache[key]
        code_base = f'FZ-{org_id}'
        n = seq.get(org_id, 0) + 1
        seq[org_id] = n
        code = f'{code_base}-{n:03d}'
        while ForestZone.objects.filter(organization_id=org_id, code=code).exists():
            n += 1
            seq[org_id] = n
            code = f'{code_base}-{n:03d}'
        zone = ForestZone.objects.create(
            name=name,
            code=code,
            organization_id=org_id,
            region='',
            is_active=True,
            sort_order=n,
        )
        cache[key] = zone
        return zone

    for d in Device.objects.exclude(forest_zone='').iterator():
        zone = ensure_zone(d.organization_id, d.forest_zone)
        if zone:
            d.forest_zone_ref_id = zone.id
            d.save(update_fields=['forest_zone_ref_id'])

    for a in Alert.objects.exclude(forest_zone='').iterator():
        org_id = a.organization_id
        if a.device_id:
            # prefer device org/zone
            pass
        zone = ensure_zone(org_id, a.forest_zone)
        if zone:
            a.forest_zone_ref_id = zone.id
            a.save(update_fields=['forest_zone_ref_id'])

    for rule in AlertRule.objects.filter(apply_scope='region').exclude(region='').iterator():
        zone = ensure_zone(rule.organization_id, rule.region)
        if zone:
            rule.forest_zone_ref_id = zone.id
            rule.save(update_fields=['forest_zone_ref_id'])


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0006_forest_zone_master'),
        ('devices', '0004_forest_zone_master'),
        ('alerts', '0006_forest_zone_master'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
