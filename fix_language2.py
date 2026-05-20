#!/usr/bin/env python3
"""Second pass - fix remaining service-oriented language instances."""
import os

fixes = [
    # (filepath, old_text, new_text)

    # hvac-leads.html - HVAC job type headings
    ('hvac-leads.html',
     '<h3>Service & Maintenance</h3>',
     '<h3>Maintenance & Repairs</h3>'),
    ('hvac-leads.html',
     'Service calls, seasonal maintenance, system health checks.',
     'Maintenance calls, seasonal maintenance, system health checks.'),

    # blog/hvac-lead-cost-australia.html - HVAC job type references
    ('blog/hvac-lead-cost-australia.html',
     'service-focused business averaging $300 per call.',
     'maintenance-focused business averaging $300 per call.'),
    ('blog/hvac-lead-cost-australia.html',
     'split system, multi-head, ducted, or service call. Property details',
     'split system, multi-head, ducted, or maintenance call. Property details'),
    ('blog/hvac-lead-cost-australia.html',
     'split system, multi-head, ducted, or service call. Specificity',
     'split system, multi-head, ducted, or maintenance call. Specificity'),
    ('blog/hvac-lead-cost-australia.html',
     'existing system if it is a service call, floor plan type.',
     'existing system if it is a maintenance call, floor plan type.'),
    ('blog/hvac-lead-cost-australia.html',
     'service and maintenance businesses cannot rely on',
     'maintenance-focused businesses cannot rely on'),
    ('blog/hvac-lead-cost-australia.html',
     'Example 3 - Service and maintenance focused business.',
     'Example 3 - Maintenance-focused business.'),
    ('blog/hvac-lead-cost-australia.html',
     'a service and maintenance business averaging $300 per call',
     'a maintenance-focused business averaging $300 per call'),

    # blog/high-quality-solar-leads-australia.html - JSON-LD text
    ('blog/high-quality-solar-leads-australia.html',
     'but shared across service types.',
     'but shared across lead types.'),

    # blog/growth-constraint-model.html
    ('blog/growth-constraint-model.html',
     'leads you cannot service.',
     'leads you cannot fulfil.'),

    # blog/lead-response-time-trade-business.html
    ('blog/lead-response-time-trade-business.html',
     'requires them to personally service every step of it.',
     'requires them to personally operate every step of it.'),

    # blog/six-layers-homeowner-signed-job.html
    ('blog/six-layers-homeowner-signed-job.html',
     'If your agency runs ads inside their master ad account',
     'If your external provider runs ads inside their master ad account'),
    ('blog/six-layers-homeowner-signed-job.html',
     'service descriptions, an about page, and seven different things',
     'offering descriptions, an about page, and seven different things'),
    ('blog/six-layers-homeowner-signed-job.html',
     'the homeowner experiences it as personal service, not automation.',
     'the homeowner experiences it as personalised attention, not automation.'),

    # solar-growth.html
    ('solar-growth.html',
     'your exact service zone',
     'your exact coverage zone'),

    # solar-leads.html
    ('solar-leads.html',
     "Solar isn't a $200 service call.",
     "Solar isn't a $200 maintenance call."),

    # solar-leads-canberra.html
    ('solar-leads-canberra.html',
     'NSW-based businesses service ACT postcodes from a distance, and',
     'NSW-based businesses cover ACT postcodes from a distance, and'),
    ('solar-leads-canberra.html',
     'tendency for NSW-based businesses to service ACT postcodes from a distance.',
     'tendency for NSW-based businesses to cover ACT postcodes from a distance.'),

    # solar-leads-wollongong.html
    ('solar-leads-wollongong.html',
     'providing inconsistent local service while competing directly with businesses that are permanently',
     'providing inconsistent local coverage while competing directly with businesses that are permanently'),
    ('solar-leads-wollongong.html',
     'providing inconsistent local service while competing directly with businesses permanently',
     'providing inconsistent local coverage while competing directly with businesses permanently'),

    # solar-leads-central-coast.html
    ('solar-leads-central-coast.html',
     'but rarely provide the local service quality that regional homeowners expect.',
     'but rarely provide the local quality that regional homeowners expect.'),
    ('solar-leads-central-coast.html',
     'but rarely provide local service quality.',
     'but rarely provide local quality.'),

    # pay-per-lead-terms.html - HTML tag breaks the match
    ('pay-per-lead-terms.html',
     'as the <strong>sole</strong> management method does not satisfy',
     'as the <strong>sole</strong> tracking method does not satisfy'),

    # privacy.html
    ('privacy.html',
     'enforce Terms of Service, and comply with legal obligations',
     'enforce Terms and Conditions, and comply with legal obligations'),
]

base = '/home/user/ql-site/'
changes = []

for rel_path, old, new in fixes:
    filepath = base + rel_path
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if old in content:
        count = content.count(old)
        content = content.replace(old, new)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        changes.append((rel_path, old, new, count))
        print(f"  [{rel_path}]  ({count}x)  {old!r}")
        print(f"             →  {new!r}")
    else:
        print(f"  NOT FOUND [{rel_path}]: {old!r}")

print(f"\nDone: {len(changes)} fixes applied")
