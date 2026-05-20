#!/usr/bin/env python3
"""Audit and replace all service-oriented language across the QuoteLeads site."""
import os
import glob

# Protect the Australian Consumer Law clause verbatim - legally required phrasing
ACL_PLACEHOLDER = '##ACL_PROTECTED##'
ACL_TEXT = '(a) resupply of the services; or (b) payment of the cost of having the services resupplied.'

# Ordered replacements - most specific first, catch-alls last
# These are applied in sequence so earlier replacements take precedence
REPLACEMENTS = [
    # ===== MANAGEMENT PERIOD (terms-specific) =====
    ('The 30-Day Management Period', 'The 30-Day Optimisation Period'),
    ('30-day management period', '30-day optimisation period'),
    ('30-Day Management Period', '30-Day Optimisation Period'),
    ('management period begins', 'optimisation period begins'),
    ('management period is the', 'optimisation period is the'),
    ('management period.', 'optimisation period.'),
    ('management period', 'optimisation period'),  # catch-all

    # ===== OTHER MANAGEMENT =====
    ('management of paid advertising channels', 'optimisation of paid advertising channels'),
    ('pipeline management and cash flow', 'pipeline monitoring and cash flow'),
    ('pipeline management', 'pipeline monitoring'),
    ('lead management', 'lead tracking'),
    ('sole management method', 'sole tracking method'),
    ('business management solutions', 'business growth solutions'),
    ('business management', 'business growth'),
    ('assets under its management', 'assets under its administration'),
    ('run it in-house or keep management on', 'run it in-house or keep the platform active'),
    ('Session management', 'Session management'),  # preserve cookie term (no-op)

    # ===== ACCOUNT MANAGER =====
    ('A dedicated account manager', 'A dedicated account specialist'),
    ('dedicated account manager', 'dedicated account specialist'),
    ('Dedicated account manager', 'Dedicated account specialist'),
    ('your account manager', 'your account specialist'),
    ('WhatsApp group with your account manager', 'WhatsApp group with your account specialist'),
    ('account manager', 'account specialist'),  # catch-all

    # ===== MANAGED SERVICE =====
    ('not a managed service or call centre', 'not a call centre or outsourced operation'),
    ('managed service', 'done-for-you system'),

    # ===== SERVICES - compound phrases first =====
    ('shall perform the following services:', 'shall deliver the following:'),
    ('following services:', 'following:'),
    ('By purchasing Pay Per Lead services,', 'By activating Pay Per Lead,'),
    ('accessing or using our website and our services', 'accessing or using the platform'),
    ('accessing or using our website and services', 'accessing or using the platform'),
    ('using our website and services', 'using the platform'),
    ('website and our services', 'website and the platform'),
    ('website and services', 'website and the platform'),
    ('trade business services, including lead generation and business management solutions',
     'trade business growth solutions, including lead generation'),
    ('trade business services', 'trade business solutions'),
    ('delivering the services', 'running the platform'),
    ('Continued use of the services after', 'Continued use of the platform after'),
    ('use of the services', 'use of the platform'),
    ('suspend all services', 'suspend all platform access'),
    ('additional services as outlined', 'additional platform features as outlined'),
    ('additional services', 'additional platform features'),
    ('lead generation service', 'lead generation platform'),
    ('QuoteLeads services', 'the QuoteLeads platform'),
    ('QuoteLeads service', 'the QuoteLeads platform'),
    ('using our services', 'using the platform'),
    ('our services', 'the platform'),
    ('Our Services', 'The Platform'),
    ('Our services', 'The platform'),
    ('The Services provided', 'The platform features provided'),
    ('the Services', 'the platform'),
    ('the services', 'the platform'),
    ('these services', 'this platform'),
    ('These Services', 'This platform'),
    ('for services', 'for platform access'),
    ('services you\'ve requested', 'the platform you\'ve engaged'),
    ('Necessary to provide services', 'Necessary to operate the platform'),
    ('for the purpose of delivering the services', 'for the purpose of running the platform'),

    # ===== SERVICE PROVIDER =====
    ('service provider agreements', 'platform provider agreements'),
    ('service providers', 'platform providers'),
    ('service provider', 'platform provider'),

    # ===== SERVICE UPDATES / IMPROVEMENT =====
    ('service updates, notifications, and support responses', 'platform updates, notifications, and responses'),
    ('service updates', 'platform updates'),
    ('Business operations, fraud prevention, and service improvement',
     'Business operations, fraud prevention, and platform improvement'),
    ('service improvement', 'platform improvement'),
    ('Kept confidential within our service provider agreements',
     'Kept confidential within our platform provider agreements'),

    # ===== SERVICE AREA =====
    ("the Customer's specified service area", "the Customer's confirmed coverage area"),
    ("Customer's specified service area", "Customer's confirmed coverage area"),
    ('specified service area', 'confirmed coverage area'),
    ('your service areas', 'your coverage areas'),
    ('their service areas', 'their coverage areas'),
    ('your specific service areas', 'your specific coverage areas'),
    ('your service area', 'your coverage area'),
    ('your coverage area', 'your coverage area'),  # no-op guard
    ('a service area', 'a coverage area'),
    ('service areas', 'coverage areas'),
    ('service area', 'coverage area'),  # catch-all

    # ===== SERVICE TYPE =====
    ('exclusive by service type but', 'exclusive by lead type but'),

    # ===== SUPPORT =====
    ('not a supported communication channel', 'not an available communication channel'),
    ('Provide operational and system-level support', 'Provide operational and system-level monitoring'),
    ('system-level support', 'system-level monitoring'),
    ('support lead handling and follow-up processes where appropriate', 'automate lead follow-up processes'),
    ('eligibility for replacements and support', 'eligibility for replacements and platform access'),
    ('Provide customer support', 'Provide platform assistance'),
    ('customer support', 'platform assistance'),
    ('Send service updates, notifications, and support responses', 'Send platform updates, notifications, and responses'),

    # ===== HANDLE =====
    ('No double handling', 'No duplicate entry'),
    ('double handling', 'duplicate entry'),

    # ===== HVAC-SPECIFIC JOB TYPES =====
    ('service &amp; maintenance', 'repairs &amp; maintenance'),
    ('service & maintenance', 'repairs & maintenance'),
    ('Annual service', 'Annual maintenance'),
    ('Gas heating service', 'Gas heating maintenance'),

    # ===== AGENCY =====
    ('partnership, joint venture, employment, agency, or fiduciary', 'partnership, joint venture, employment, or fiduciary'),
    ('employment, agency, or fiduciary', 'employment or fiduciary'),
    ('agency, or fiduciary', 'or fiduciary'),
    ('rent layer one from an agency', 'rent layer one from an external provider'),
    ("the agency's account", "the provider's account"),
    ("agency's account", "provider's account"),
    ('agency-controlled landing page', 'externally-controlled landing page'),
    ('agency-controlled', 'externally-controlled'),
    ('agency relationship ends', 'provider relationship ends'),
    ('agency relationship', 'provider relationship'),
    ('agency gets blamed', 'provider gets blamed'),
    ('A new agency gets hired', 'A new provider gets hired'),
    ('new agency gets hired', 'new provider gets hired'),
    ('through an agency', 'through an external provider'),
    ('an agency or marketplace', 'an external provider or marketplace'),
    ('or an agency, or', 'or an external provider, or'),
    ('or an agency', 'or an external provider'),
    ('an agency', 'an external provider'),
    ('hired an external provider', 'hired an external provider'),  # no-op guard
    ('The agency', 'The provider'),
    ('the agency', 'the provider'),

    # ===== LOCAL/B2B SERVICE =====
    ('local service businesses', 'local trade businesses'),
    ('B2B service business', 'B2B trade business'),

    # ===== META DESCRIPTION SERVICE =====
    ('Growth Accelerator Program Agreement Terms for QuoteLeads services',
     'Growth Accelerator Program Terms for the QuoteLeads platform'),
    ('QuoteLeads Terms & Conditions. Please read these terms carefully before using our website and services.',
     'QuoteLeads Terms & Conditions. Please read these terms carefully before using the platform.'),
]

changes_log = []

html_files = sorted(glob.glob('/home/user/ql-site/**/*.html', recursive=True))

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        original = f.read()
    content = original

    # Protect ACL clause (legally required verbatim phrasing)
    acl_present = ACL_TEXT in content
    if acl_present:
        content = content.replace(ACL_TEXT, ACL_PLACEHOLDER)

    # Apply all replacements in order
    for old, new in REPLACEMENTS:
        if old == new:
            continue  # skip no-ops
        occurrences = content.count(old)
        if occurrences > 0:
            content = content.replace(old, new)
            rel_path = filepath.replace('/home/user/ql-site/', '')
            changes_log.append((rel_path, old, new, occurrences))

    # Restore ACL clause
    if acl_present:
        content = content.replace(ACL_PLACEHOLDER, ACL_TEXT)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

# Print report
print(f"Files scanned: {len(html_files)}")
print(f"Total replacement instances made: {sum(c[3] for c in changes_log)}")
print(f"Unique replacement types triggered: {len(changes_log)}")
print()
print("=" * 80)
print("CHANGES LOG")
print("=" * 80)
current_file = None
for rel_path, old, new, count in changes_log:
    if rel_path != current_file:
        print(f"\n--- {rel_path} ---")
        current_file = rel_path
    times = f"({count}x)" if count > 1 else "     "
    print(f"  {times}  {old!r}")
    print(f"         → {new!r}")
print()
print("=" * 80)
print(f"DONE: {sum(c[3] for c in changes_log)} total replacements across {len(set(c[0] for c in changes_log))} files")
