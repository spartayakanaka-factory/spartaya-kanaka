#!/usr/bin/env python3
"""Interrupt only the isolated report limiter query waiting on a test lock."""
import importlib.util, os, pathlib, re, sys, time
root=pathlib.Path.cwd();workspace=root.parent.parent
os.environ['P3_STATE_DIR']=str(workspace/'phase3/runtime');os.environ['P2_RUNTIME_DIR']=str(workspace/'phase2')
sys.path.insert(0,str(root/'scripts'));spec=importlib.util.spec_from_file_location('local_db',root/'scripts/phase3-db.py');db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
try:
 if db.PORT!=33078 or db.query('SELECT @@port;').strip()!='33078' or '11.8.9-MariaDB' not in db.query('SELECT VERSION();'):raise RuntimeError('identity')
 sql="SELECT t.trx_mysql_thread_id FROM information_schema.INNODB_TRX t JOIN information_schema.PROCESSLIST p ON p.ID=t.trx_mysql_thread_id WHERE p.DB='sprtaya_phase4_disposable_local' AND p.USER='sprtaya_phase4' AND t.trx_state='LOCK WAIT' AND t.trx_query LIKE '%auth_rate_limits%';"
 for _ in range(40):
  rows=db.query(sql).splitlines()
  if rows:
   if len(rows)!=1 or not re.fullmatch(r'[0-9]+',rows[0]):raise RuntimeError('ambiguous')
   db.query('KILL CONNECTION '+rows[0]+';');print('Interrupted one isolated waiting report query.');break
  time.sleep(.05)
 else:raise RuntimeError('no waiter')
except Exception:
 print('Isolated waiting query was not safely identified.',file=sys.stderr);sys.exit(1)
