#!/usr/bin/env python3
"""Final comprehensive cleanup: remove 'done for you', 'quoteleads system', advertising language. Replace with platform language."""
import os
import glob

# Core replacements targeting remaining problematic language
REPLACEMENTS = [
    # ===== DONE FOR YOU =====
    ('handled for you', 'handled by the platform'),
    ('done for you', 'automated by the platform'),
    ('for you', 'for your business'),  # catch-all for context-appropriate instances
    
    # ===== QUOTELEADS SYSTEM =====
    ('QuoteLeads system', 'QuoteLeads platform'),
    ('our system', 'the platform'),
    ('the system', 'the platform'),
    ('this system', 'this platform'),
    ('your system', 'your platform access'),
    
    # ===== ADVERTISING LANGUAGE =====
    ('advertising', 'lead generation'),
    ('ad account', 'lead account'),
    ('ad platform', 'lead platform'),
    ('ads', 'leads'),
    ('ad budget', 'lead budget'),
    ('paid advertising', 'lead generation'),
    ('advertising funnels', 'lead generation funnels'),
    ('advertising channels', 'lead channels'),
    ('advertising platform', 'lead generation platform'),
    
    # ===== MARKETPLACE / SHARED LANGUAGE =====
    ('marketplace', 'lead platform'),
    ('marketplace leads', 'shared leads'),
    
    # ===== AGENCY / OUTSOURCED =====
    ('agency relationship', 'provider relationship'),
    ('external provider', 'external provider'),  # already correct, guard
    ('hired an agency', 'hired a provider'),
    ('working with an agency', 'working with a provider'),
]

changes_log = []

html_files = sorted(glob.glob('**/*.html', recursive=True))

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        original = f.read()
    content = original

    # Apply all replacements in order
    for old, new in REPLACEMENTS:
        if old == new:
            continue  # skip no-ops
        occurrences = content.count(old)
        if occurrences > 0:
            content = content.replace(old, new)
            rel_path = filepath.replace('./', '')
            changes_log.append((rel_path, old, new, occurrences))

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
