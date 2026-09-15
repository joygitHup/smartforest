# Generated manually — alert rule org isolation (same as roles)

from django.db import migrations, models


SYSTEM_RULE_NAMES = (
    '一级火情自动研判',
    '二级火情预警规则',
    '烟雾提示规则',
    '高温阈值规则',
)


def mark_system_rules(apps, schema_editor):
    AlertRule = apps.get_model('alerts', 'AlertRule')
    AlertRule.objects.filter(name__in=SYSTEM_RULE_NAMES).update(
        is_system=True,
        organization=None,
    )
    # 兼容：早期演示数据
    AlertRule.objects.filter(description='演示规则').update(
        is_system=True,
        organization=None,
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('alerts', '0006_forest_zone_master'),
    ]

    operations = [
        migrations.AddField(
            model_name='alertrule',
            name='is_system',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text='系统默认规则全平台可见；自建规则仅本组织子树可见，平级互不可见',
                verbose_name='系统内置',
            ),
        ),
        migrations.RunPython(mark_system_rules, noop_reverse),
    ]
