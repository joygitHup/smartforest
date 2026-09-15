# Generated manually — backfill alert.organization from device

from django.db import migrations
from django.db.models import OuterRef, Subquery


def backfill_alert_organization(apps, schema_editor):
    Alert = apps.get_model('alerts', 'Alert')
    WorkOrder = apps.get_model('alerts', 'WorkOrder')
    Device = apps.get_model('devices', 'Device')

    device_org = Device.objects.filter(pk=OuterRef('device_id')).values('organization_id')[:1]
    (
        Alert.objects.filter(organization_id__isnull=True, device_id__isnull=False)
        .update(organization_id=Subquery(device_org))
    )

    alert_org = Alert.objects.filter(pk=OuterRef('alert_id')).values('organization_id')[:1]
    (
        WorkOrder.objects.filter(organization_id__isnull=True, alert_id__isnull=False)
        .update(organization_id=Subquery(alert_org))
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('alerts', '0007_alert_rule_is_system'),
        ('devices', '0004_forest_zone_master'),
    ]

    operations = [
        migrations.RunPython(backfill_alert_organization, noop_reverse),
    ]
