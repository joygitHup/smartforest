# Generated manually for org-scoped environmental aggregates

from django.db import migrations, models
import django.db.models.deletion


def backfill_environmental_organization(apps, schema_editor):
    EnvironmentalData = apps.get_model('reports', 'EnvironmentalData')
    Device = apps.get_model('devices', 'Device')
    label_to_org: dict[str, int] = {}
    for d in Device.objects.exclude(organization_id__isnull=True).only(
        'organization_id', 'region', 'forest_zone'
    ):
        for raw in (d.region, d.forest_zone):
            value = (raw or '').strip()
            if value and value not in label_to_org:
                label_to_org[value] = d.organization_id
    for row in EnvironmentalData.objects.filter(organization_id__isnull=True):
        org_id = label_to_org.get((row.region or '').strip())
        if org_id:
            row.organization_id = org_id
            row.save(update_fields=['organization_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0002_org_tenant_scope'),
        ('users', '0008_duty_roster'),
        ('devices', '0004_forest_zone_master'),
    ]

    operations = [
        migrations.AddField(
            model_name='environmentaldata',
            name='organization',
            field=models.ForeignKey(
                blank=True,
                db_index=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='environmental_data',
                to='users.organization',
                verbose_name='所属组织',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='environmentaldata',
            unique_together={('organization', 'region', 'stat_date', 'stat_hour')},
        ),
        migrations.RunPython(backfill_environmental_organization, migrations.RunPython.noop),
    ]
