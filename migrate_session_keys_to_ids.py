#!/usr/bin/env python3
"""
Migration script: Convert session_tags.json and session_parents.json
from sessionKey-based keys to session id-based keys.

Background:
  Old feishu sessions share the same sessionKey (e.g. feishu.lab:ou_xxx),
  causing dedup issues. Session id (filename without .jsonl) is globally
  unique and should be used as the canonical key everywhere.

Usage:
  python3 migrate_session_keys_to_ids.py [--dry-run]

This script:
1. Scans all JSONL files to build sessionKey → [id...] mapping
2. Migrates session_tags.json: sessionKey keys → id keys
3. Migrates session_parents.json: sessionKey keys and values → id keys and values
4. Creates backups before modifying (.bak)

Safe to run multiple times (idempotent).
"""

import json
import os
import sys
import glob
import shutil

SESSIONS_DIR = os.path.expanduser('~/.nanobot/workspace/sessions')
SESSION_TAGS_FILE = os.path.join(SESSIONS_DIR, 'session_tags.json')
SESSION_PARENTS_FILE = os.path.join(SESSIONS_DIR, 'session_parents.json')

DRY_RUN = '--dry-run' in sys.argv


def build_key_to_ids_mapping():
    """Scan all JSONL files and build sessionKey → [id...] mapping."""
    key_to_ids = {}  # sessionKey → [session_id, ...]
    id_to_key = {}   # session_id → sessionKey

    for filepath in glob.glob(os.path.join(SESSIONS_DIR, '*.jsonl')):
        session_id = os.path.basename(filepath).replace('.jsonl', '')
        session_key = None

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                first_line = f.readline().strip()
                if first_line:
                    meta = json.loads(first_line)
                    if meta.get('_type') == 'metadata' and meta.get('key'):
                        session_key = meta['key']
        except Exception as e:
            print(f"  ⚠️  Could not read {session_id}: {e}")
            continue

        if session_key:
            key_to_ids.setdefault(session_key, []).append(session_id)
            id_to_key[session_id] = session_key

    return key_to_ids, id_to_key


def is_session_key_format(key):
    """Check if a key looks like a sessionKey (contains ':')."""
    return ':' in key


def resolve_key_to_id(key, key_to_ids):
    """Resolve a sessionKey to a session id.
    
    If the key is already an id (no ':'), return as-is.
    If the key maps to exactly one id, return that id.
    If the key maps to multiple ids, return None (ambiguous — skip).
    """
    if not is_session_key_format(key):
        return key  # Already an id

    ids = key_to_ids.get(key, [])
    if len(ids) == 1:
        return ids[0]
    elif len(ids) > 1:
        return None  # Ambiguous — will handle specially
    else:
        # Key not found in any JSONL — try to reconstruct id from key
        # sessionKey format: channel:payload → id: channel_payload
        return key.replace(':', '_')


def migrate_tags(key_to_ids):
    """Migrate session_tags.json from sessionKey to id-based keys."""
    if not os.path.isfile(SESSION_TAGS_FILE):
        print("  ℹ️  session_tags.json not found, skipping")
        return

    with open(SESSION_TAGS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    old_keys = [k for k in data if is_session_key_format(k)]
    if not old_keys:
        print("  ✅ session_tags.json already uses id-based keys")
        return

    print(f"  Found {len(old_keys)} sessionKey-format entries to migrate")

    new_data = {}
    for key, tags in data.items():
        if not is_session_key_format(key):
            # Already an id-based key, keep as-is
            new_data[key] = tags
            continue

        ids = key_to_ids.get(key, [])
        if len(ids) == 0:
            # Key not found — reconstruct id
            new_id = key.replace(':', '_')
            print(f"    {key} → {new_id} (reconstructed)")
            new_data[new_id] = tags
        elif len(ids) == 1:
            # Unique mapping
            new_id = ids[0]
            print(f"    {key} → {new_id}")
            new_data[new_id] = tags
        else:
            # Multiple ids share this key — copy tags to ALL ids
            print(f"    {key} → {len(ids)} ids (duplicated key, copying tags to all):")
            for sid in ids:
                print(f"      → {sid}")
                # Merge with any existing tags for this id
                existing = set(new_data.get(sid, []))
                existing.update(tags)
                new_data[sid] = sorted(existing)

    if DRY_RUN:
        print(f"  [DRY RUN] Would write {len(new_data)} entries to session_tags.json")
        return

    # Backup
    backup = SESSION_TAGS_FILE + '.bak'
    shutil.copy2(SESSION_TAGS_FILE, backup)
    print(f"  Backup: {backup}")

    # Write
    with open(SESSION_TAGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, indent=2, ensure_ascii=False)
    print(f"  ✅ Migrated session_tags.json ({len(old_keys)} keys → {len(new_data)} entries)")


def migrate_parents(key_to_ids):
    """Migrate session_parents.json from sessionKey to id-based keys."""
    if not os.path.isfile(SESSION_PARENTS_FILE):
        print("  ℹ️  session_parents.json not found, skipping")
        return

    with open(SESSION_PARENTS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    old_keys = [k for k in data if is_session_key_format(k) and not k.startswith('_')]
    old_values = [v for k, v in data.items() if not k.startswith('_') and isinstance(v, str) and is_session_key_format(v)]

    if not old_keys and not old_values:
        print("  ✅ session_parents.json already uses id-based keys")
        return

    print(f"  Found {len(old_keys)} sessionKey-format keys and {len(old_values)} sessionKey-format values to migrate")

    new_data = {}
    for key, value in data.items():
        if key.startswith('_'):
            new_data[key] = value  # Preserve _comment etc.
            continue

        if not isinstance(value, str):
            continue

        # Resolve key
        new_key = resolve_key_to_id(key, key_to_ids)
        if new_key is None:
            print(f"    ⚠️  Skipping ambiguous key: {key}")
            continue

        # Resolve value
        new_value = resolve_key_to_id(value, key_to_ids)
        if new_value is None:
            print(f"    ⚠️  Skipping ambiguous value for {key}: {value}")
            continue

        if new_key != key or new_value != value:
            print(f"    {key}: {value} → {new_key}: {new_value}")

        new_data[new_key] = new_value

    if DRY_RUN:
        print(f"  [DRY RUN] Would write {len(new_data)} entries to session_parents.json")
        return

    # Backup
    backup = SESSION_PARENTS_FILE + '.bak'
    shutil.copy2(SESSION_PARENTS_FILE, backup)
    print(f"  Backup: {backup}")

    # Write
    with open(SESSION_PARENTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, indent=2, ensure_ascii=False)
    print(f"  ✅ Migrated session_parents.json")


def main():
    print("=" * 60)
    print("Session Key → ID Migration")
    print("=" * 60)
    if DRY_RUN:
        print("[DRY RUN MODE — no files will be modified]")
    print()

    print("Step 1: Scanning JSONL files...")
    key_to_ids, id_to_key = build_key_to_ids_mapping()
    print(f"  Found {len(id_to_key)} sessions, {len(key_to_ids)} unique sessionKeys")

    # Show duplicated keys
    dupes = {k: v for k, v in key_to_ids.items() if len(v) > 1}
    if dupes:
        print(f"\n  ⚠️  {len(dupes)} sessionKeys map to multiple ids (the bug we're fixing):")
        for k, ids in dupes.items():
            print(f"    {k} → {ids}")
    print()

    print("Step 2: Migrating session_tags.json...")
    migrate_tags(key_to_ids)
    print()

    print("Step 3: Migrating session_parents.json...")
    migrate_parents(key_to_ids)
    print()

    print("Done! ✅")
    if not DRY_RUN:
        print("Backup files created with .bak extension.")
        print("Restart webserver to pick up the changes.")


if __name__ == '__main__':
    main()
