"""Local source/build secret scan and original-media preservation. No hosted access."""
import os
import hashlib
import json
import pathlib
import re
import subprocess

root = pathlib.Path.cwd()
state = pathlib.Path(os.environ.get('P5_STATE_DIR',str(root.parent / 'runtime'))).resolve()
secrets = set()

def collect(value, key=''):
    if isinstance(value, dict):
        for name, child in value.items():
            collect(child, name)
    elif isinstance(value, list):
        for child in value:
            collect(child, key)
    elif isinstance(value, str) and len(value) >= 16 and re.search(r'secret|password|token|access.?key|^root$|^app$|^auth$|^customer$|^mock$', key, re.I):
        secrets.add(value.encode())

for name in ['secrets.json', 'database/credentials.json', 'media/credentials.json', 'staff.json', 'customer.json']:
    p = state / name
    if p.is_file():
        collect(json.loads(p.read_text()))

patterns = [re.compile(p) for p in [
    rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    rb'(?:AKIA|ASIA)[A-Z0-9]{16}',
    rb'gh[pousr]_[A-Za-z0-9]{30,}',
    rb'github_pat_[A-Za-z0-9_]{60,}',
    rb'''mysql://[^\s:/"'`<>]+:[^\s@"'`{}<>]{10,}@''',
]]
findings = []
counts = {'sourceText': 0, 'buildText': 0, 'traces': 0}

def scan(p, kind):
    data = p.read_bytes()
    if b'\0' in data[:2048]:
        return
    counts[kind] += 1
    if any(secret in data for secret in secrets):
        findings.append({'path': str(p.relative_to(root)), 'kind': 'known-private-value'})
    data = data.replace(b':test-password@', b':FIXTURE@')
    if any(pattern.search(data) for pattern in patterns):
        findings.append({'path': str(p.relative_to(root)), 'kind': 'credential-pattern'})

names = set(filter(None, subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z']).decode().split('\0')))
for name in names:
    p = root / name
    if p.name.startswith('.env') and p.name != '.env.example':
        findings.append({'path': name, 'kind': 'environment-file'})
    if p.is_file() and p.suffix in ['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.py', '.yml', '.yaml', '.css']:
        scan(p, 'sourceText')
for p in (root / '.next-phase5').rglob('*'):
    if p.is_file() and p.suffix in ['.js', '.json', '.html', '.rsc', '.map']:
        scan(p, 'buildText')
    if p.is_file() and p.name.endswith('.nft.json'):
        counts['traces'] += 1
        for f in json.loads(p.read_text())['files']:
            resolved = (p.parent / f).resolve()
            if resolved == state or state in resolved.parents:
                findings.append({'path': str(p.relative_to(root)), 'kind': 'private-runtime-traced'})

manifest = json.loads((root.parents[1] / 'phase3/phase2-images-before.json').read_text())
changed = []
for name, digest in manifest.items():
    p = root.parents[2] / name
    if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != digest:
        changed.append(name)
if changed:
    findings.append({'kind': 'original-media-changed', 'count': len(changed)})
migration_changes = subprocess.check_output(['git', 'diff', '--name-only', '--', 'prisma/']).decode().splitlines()
if migration_changes:
    findings.append({'kind': 'unexpected-schema-or-migration-change'})
report = {'scope': 'Local candidate source, generated production build, known private local credentials, trace paths and original media checksums; no hosted values retrieved', 'counts': counts, 'knownPrivateValuesChecked': len(secrets), 'originalMediaManifestEntries': len(manifest), 'originalMediaChanges': len(changed), 'schemaOrMigrationChanges': len(migration_changes), 'findings': findings}
(root / os.environ.get('P5_ACCEPTANCE_DIR','docs/phase5') / 'security-and-preservation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
raise SystemExit(bool(findings))
