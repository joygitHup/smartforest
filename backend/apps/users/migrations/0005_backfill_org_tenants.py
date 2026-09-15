# Generated manually — backfill logical tenant root and organization FKs
from django.db import migrations


def forwards(apps, schema_editor):
    Organization = apps.get_model('users', 'Organization')
    User = apps.get_model('users', 'User')
    Device = apps.get_model('devices', 'Device')
    Alert = apps.get_model('alerts', 'Alert')
    AlertRule = apps.get_model('alerts', 'AlertRule')
    WorkOrder = apps.get_model('alerts', 'WorkOrder')
    DailyReport = apps.get_model('reports', 'DailyReport')

    root, _ = Organization.objects.get_or_create(
        code='HQ',
        defaults={
            'name': '高层指挥中心',
            'org_type': 'group',
            'region': '',
            'description': '系统默认租户根',
            'sort_order': 0,
            'is_active': True,
        },
    )
    Organization.objects.filter(parent__isnull=True).exclude(pk=root.pk).update(parent=root)

    User.objects.filter(organization__isnull=True).update(organization=root)
    Device.objects.filter(organization__isnull=True).update(organization=root)
    Alert.objects.filter(organization__isnull=True).update(organization=root)
    # 若告警有设备组织，优先跟随设备
    for alert in Alert.objects.select_related('device').all():
        if alert.device_id and getattr(alert.device, 'organization_id', None):
            if alert.organization_id != alert.device.organization_id:
                alert.organization_id = alert.device.organization_id
                alert.save(update_fields=['organization_id'])
    AlertRule.objects.filter(organization__isnull=True).update(organization=root)
    WorkOrder.objects.filter(organization__isnull=True).update(organization=root)
    for wo in WorkOrder.objects.select_related('alert').all():
        if wo.alert_id and wo.alert.organization_id and wo.organization_id != wo.alert.organization_id:
            wo.organization_id = wo.alert.organization_id
            wo.save(update_fields=['organization_id'])
    DailyReport.objects.filter(organization__isnull=True).update(organization=root)


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_org_tenant_scope'),
        ('devices', '0003_org_tenant_scope'),
        ('alerts', '0005_org_tenant_scope'),
        ('reports', '0002_org_tenant_scope'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
