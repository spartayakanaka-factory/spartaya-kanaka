#!/usr/bin/env python3
"""Manage a new, separate, loopback-only Phase 4 outage-test MariaDB."""
import importlib.util, json, os, pathlib, shutil, subprocess, sys, urllib.parse
root=pathlib.Path.cwd(); state=root.parent/'runtime/outage-isolated'; script=state/'engine/scripts/phase3-db.py'
command=sys.argv[1] if len(sys.argv)>1 else ''
try:
 if command not in ('setup','start','stop'):raise RuntimeError('Invalid command')
 if command=='setup':
  if state.exists():raise RuntimeError('Outage environment already exists; refusing to overwrite')
  script.parent.mkdir(parents=True,mode=0o700)
  shutil.copyfile(root/'scripts/phase3-db.py',script)
 elif not script.is_file():raise RuntimeError('No outage environment')
 os.environ['P3_STATE_DIR']=str(state);os.environ['P2_RUNTIME_DIR']=str(root.parent.parent/'phase2');sys.path.insert(0,str(root/'scripts'))
 spec=importlib.util.spec_from_file_location('isolated_db',script);db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
 db.PORT=33079;db.DBS=('sprtaya_phase4_outage_local','sprtaya_phase4_outage_test')
 if command=='setup':
  db.setup()
  values={}
  for line in (state/'database/env.test').read_text().splitlines():
   if '=' in line:
    k,v=line.split('=',1);values[k]=v
  u=urllib.parse.urlsplit(values['DATABASE_URL'])
  if u.hostname!='127.0.0.1' or u.port!=33079 or u.username!='sprtaya_phase3' or u.path!='/sprtaya_phase4_outage_test':raise RuntimeError('Wrong disposable target')
  node=root.parent.parent/'phase3/integration-tools/node-v22.23.4-darwin-arm64/bin/node'
  result=subprocess.run([str(node),'node_modules/prisma/build/index.js','migrate','deploy'],cwd=root,env={**os.environ,**values},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  if result.returncode:raise RuntimeError('Disposable schema initialization failed')
  print('Created and migrated separate loopback outage-test database.')
 elif command=='start':db.start()
 else:db.stop();print('Stopped only the separate outage-test database.')
except Exception:
 print('Isolated outage database operation failed; private diagnostics withheld.',file=sys.stderr);sys.exit(1)
