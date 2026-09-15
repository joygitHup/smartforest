# Generated manually: ForestZone multi-region support

from django.db import migrations, models


def backfill_regions(apps, schema_editor):
    ForestZone = apps.get_model('users', 'ForestZone')
    for zone in ForestZone.objects.all():
        items = []
        for raw in (zone.regions or []):
            value = str(raw).strip()
            if value and value not in items:
                items.append(value)
        legacy = (zone.region or '').strip()
        if legacy and legacy not in items:
            items.insert(0, legacy)
        if zone.regions != items or zone.region != (items[0] if items else ''):
            zone.regions = items
            zone.region = items[0] if items else ''
            zone.save(update_fields=['regions', 'region'])


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_duty_roster'),
    ]

    operations = [
        migrations.AddField(
            model_name='forestzone',
            name='regions',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='一个林区可包含多个片区，如 ["B片区","C片区"]',
                verbose_name='片区列表',
            ),
        ),
        migrations.AlterField(
            model_name='forestzone',
            name='region',
            field=models.CharField(
                blank=True,
                help_text='兼容旧字段；与 regions[0] 同步',
                max_length=128,
                verbose_name='主片区',
            ),
        ),
        migrations.RunPython(backfill_regions, migrations.RunPython.noop),
    ]
