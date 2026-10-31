#!/usr/bin/env python3
"""Rehearse a known synthetic backup restore on two newly named local databases."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

root = Path.cwd()
workspace = root.parent.parent
os.environ['P3_STATE_DIR'] = str(workspace / 'phase3/runtime')
os.environ['P2_RUNTIME_DIR'] = str(workspace / 'phase2')
sys.path.insert(0, str(root / 'scripts'))
spec = importlib.util.spec_from_file_location('local_db', root / 'scripts/phase3-db.py')
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
if db.PORT != 33078 or '11.8.9-MariaDB' not in db.query('SELECT VERSION();') or db.query('SELECT @@port;').strip() != '33078':
    raise RuntimeError('Unexpected local server')
source = 'sprtaya_phase4_disposable_test'
backup = workspace / 'phase4/runtime/database/backups/phase4-recovery-1793386961.sql'
artifact = backup.read_bytes()
evidence = json.loads((root / 'docs/phase4/recovery-evidence.json').read_text())
if hashlib.sha256(artifact).hexdigest() != evidence['backupSha256']:
    raise RuntimeError('Backup digest mismatch')
text = artifact.decode('utf-8')
selectors = re.findall(r'^(?:CREATE DATABASE[^\n]*|USE [^\n]*)$', text, re.M)
if len(selectors) != 2 or any('`' + source + '`' not in line for line in selectors):
    raise RuntimeError('Unexpected database selectors')
# This known synthetic dump contains the source name only in its two selectors and comments.
if text.count(source) != 4 or re.search(r'(?im)^\s*(?:DROP DATABASE|DROP SCHEMA|CREATE USER|GRANT|REVOKE)\b', text):
    raise RuntimeError('Unexpected dump contents')
suffix = secrets.token_hex(6)
targets = ['sprtaya_sr_restore_' + suffix + '_a', 'sprtaya_sr_restore_' + suffix + '_b']
created = []
try:
    for target in targets:
        if db.query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + target + "';").strip():
            raise RuntimeError('Recovery target exists')
        # Create first to ensure cleanup is restricted to schemas created by this run.
        db.query('CREATE DATABASE `' + target + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;')
        created.append(target)
        rewritten = re.sub(r'^(CREATE DATABASE[^\n]*?|USE )`' + re.escape(source) + r'`', lambda m: m.group(1) + '`' + target + '`', text, flags=re.M)
        subprocess.run(db.client_args(), input=rewritten.encode(), env=db.runtime_env(), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    def inventory(name):
        return db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + name + "' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;").splitlines()
    tables = inventory(targets[0])
    if len(tables) != evidence['tablesCompared'] or tables != inventory(targets[1]):
        raise RuntimeError('Restored table inventory mismatch')
    for table in tables:
        if not re.fullmatch(r'[A-Za-z0-9_]+', table): raise RuntimeError('Unexpected table name')
        sql = 'SELECT * FROM `{}`.`' + table + '` ORDER BY 1;'
        if hashlib.sha256(db.query(sql.format(targets[0])).encode()).digest() != hashlib.sha256(db.query(sql.format(targets[1])).encode()).digest():
            raise RuntimeError('Restored content mismatch')
    manifest = json.loads((root/'docs/phase4/migration-manifest.json').read_text())['migrations']
    rows = db.query('SELECT migration_name,checksum FROM `' + targets[0] + '`.`_prisma_migrations` WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;').splitlines()
    if rows != [m['name'] + '\t' + m['sha256'] for m in manifest[:6]]:
        raise RuntimeError('Restored migration history mismatch')
    print('PASS known synthetic backup digest; two fresh local restores; 47 table data comparisons; six migration checksums.')
finally:
    for target in created:
        db.query('DROP DATABASE `' + target + '`;')
