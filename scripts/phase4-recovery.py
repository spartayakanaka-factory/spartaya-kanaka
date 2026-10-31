#!/usr/bin/env python3
"""Exact-artifact restore and additive migration, on a new local recovery schema only."""
import hashlib, importlib.util, json, os, pathlib, re, subprocess, sys, time, urllib.parse
root = pathlib.Path.cwd()
workspace = root.parent.parent
os.environ['P3_STATE_DIR'] = str(workspace / 'phase3/runtime')
os.environ['P2_RUNTIME_DIR'] = str(workspace / 'phase2')
sys.path.insert(0, str(root / 'scripts'))
spec = importlib.util.spec_from_file_location('local_db', root / 'scripts/phase3-db.py')
db = importlib.util.module_from_spec(spec); spec.loader.exec_module(db)
source='sprtaya_phase4_disposable_test'; target='sprtaya_phase4_recovery_v3'
if db.PORT != 33078 or '11.8.9-MariaDB' not in db.query('SELECT VERSION();') or db.query('SELECT @@port;').strip() != '33078': raise RuntimeError('Unexpected local server')
if db.query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='"+target+"';").strip(): raise RuntimeError('Recovery database already exists; refusing to overwrite')
manifest=json.loads((root/'docs/phase4/migration-manifest.json').read_text())['migrations']
rows=db.query("SELECT migration_name,checksum,IF(finished_at IS NULL,'0','1'),IF(rolled_back_at IS NULL,'0','1') FROM `"+source+"`.`_prisma_migrations` ORDER BY migration_name;").splitlines()
if len(rows)!=6 or len(manifest)!=7: raise RuntimeError('Unexpected source migration history')
for row, migration in zip(rows,manifest[:6]):
 name,checksum,finished,rolled=row.split('\t')
 sql=root/'prisma/migrations'/migration['name']/'migration.sql'
 if name!=migration['name'] or checksum!=migration['sha256'] or hashlib.sha256(sql.read_bytes()).hexdigest()!=checksum or finished!='1' or rolled!='0': raise RuntimeError('Source migration history mismatch')
if hashlib.sha256((root/'prisma/migrations'/manifest[6]['name']/'migration.sql').read_bytes()).hexdigest()!=manifest[6]['sha256']: raise RuntimeError('Unreviewed index migration')
backup_dir=root.parent/'runtime/database/backups'; backup_dir.mkdir(mode=0o700,parents=True,exist_ok=True)
backup=backup_dir/('phase4-recovery-'+str(int(time.time()))+'.sql')
with backup.open('xb') as out:
 os.chmod(backup,0o600)
 subprocess.run(db.client_args('mariadb-dump')+['--single-transaction','--databases',source],env=db.runtime_env(),stdout=out,check=True)
artifact=backup.read_text(); selectors=re.findall(r'^(?:CREATE DATABASE[^\n]*|USE [^\n]*)$',artifact,re.M)
if len(selectors)!=2 or any('`'+source+'`' not in line for line in selectors): raise RuntimeError('Unexpected dump database selectors')
rewritten=re.sub(r'^(CREATE DATABASE[^\n]*?|USE )`'+re.escape(source)+r'`',lambda m:m.group(1)+'`'+target+'`',artifact,flags=re.M)
subprocess.run(db.client_args(),input=rewritten.encode(),env=db.runtime_env(),check=True,stdout=subprocess.DEVNULL)
def inventory(name):
 return db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='"+name+"' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;").splitlines()
def compare(skip_history=False):
 tables=inventory(source)
 if tables!=inventory(target): raise RuntimeError('Table inventory mismatch')
 for table in tables:
  if not re.fullmatch(r'[A-Za-z0-9_]+',table):raise RuntimeError('Unsafe table identifier')
  if skip_history and table=='_prisma_migrations':continue
  for query in ['SELECT COUNT(*) FROM `{}`.`'+table+'`;', 'SELECT * FROM `{}`.`'+table+'` ORDER BY 1;']:
   a=db.query(query.format(source)).encode(); b=db.query(query.format(target)).encode()
   if hashlib.sha256(a).digest()!=hashlib.sha256(b).digest():raise RuntimeError('Restored content mismatch: '+table)
 return len(tables)
count=compare()
db.query("GRANT ALL ON `"+target+"`.* TO 'sprtaya_phase4'@'127.0.0.1';")
values={}
for line in (root.parent/'runtime/database/env.test').read_text().splitlines():
 if '=' in line:
  k,v=line.split('=',1);values[k]=v
parsed=urllib.parse.urlsplit(values['DATABASE_URL'])
if parsed.hostname!='127.0.0.1' or parsed.port!=33078 or parsed.username!='sprtaya_phase4' or parsed.path!='/'+source: raise RuntimeError('Incorrect source identity')
recovery_url=urllib.parse.urlunsplit((parsed.scheme,parsed.netloc,'/'+target,parsed.query,parsed.fragment))
expected=hashlib.sha256((root/'prisma/migrations/20261031000000_phase4_report_indexes/migration.sql').read_bytes()).hexdigest()
env={**os.environ,**values,'DATABASE_URL':recovery_url}
node=workspace/'phase3/integration-tools/node-v22.23.4-darwin-arm64/bin/node'
for i in range(2):
 r=subprocess.run([str(node),'node_modules/prisma/build/index.js','migrate','deploy'],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 if r.returncode: raise RuntimeError('Migration deployment failed; recovery schema retained for inspection')
 if i==1 and 'No pending migrations' not in r.stdout: raise RuntimeError('Second deployment was not idempotent')
compare(skip_history=True)
indexes=db.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='"+target+"' AND INDEX_NAME IN ('p4_orders_created_idx','p4_events_kind_created_idx') GROUP BY INDEX_NAME ORDER BY INDEX_NAME;").splitlines()
if indexes!=['p4_events_kind_created_idx','p4_orders_created_idx']:raise RuntimeError('Expected indexes absent')
history=db.query("SELECT checksum FROM `"+target+"`.`_prisma_migrations` WHERE migration_name='20261031000000_phase4_report_indexes' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;").strip()
if history!=expected:raise RuntimeError('Migration checksum mismatch')
evidence={'scope':'Exact backup of disposable Phase 4 test schema restored into a fresh isolated local schema; no existing schema migrated', 'backupSha256':hashlib.sha256(backup.read_bytes()).hexdigest(),'tablesCompared':count,'beforeAndAfterDataDigestMatch':True,'migrationSha256':expected,'indexes':indexes,'secondDeploy':'no pending migrations','recoverySchema':target}
(root/'docs/phase4/recovery-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(json.dumps(evidence,indent=2))
