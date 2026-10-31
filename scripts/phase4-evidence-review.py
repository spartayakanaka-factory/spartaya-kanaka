#!/usr/bin/env python3
"""Separate evidence cross-check; never infer hosted or production acceptance."""
import hashlib,json,pathlib,re
root=pathlib.Path.cwd();docs=root/'docs/phase4'
def load(n):return json.loads((docs/n).read_text())
checks={}
def check(name, condition):
 checks[name]=bool(condition)
 if not condition:raise RuntimeError('Evidence mismatch: '+name)
r=load('gate-regression.json');check('regression',r['numTotalTests']==230 and r['numPassedTests']==230 and r['numFailedTests']==0 and r['numPendingTests']==0)
reports=[x for x in r['testResults'] if x['name'].endswith('/reports.integration.test.ts')];check('financial integration',len(reports)==1 and sum(x['status']=='passed' for x in reports[0]['assertionResults'])==9)
b=load('browser-evidence.json');check('browser and axe',len(b['checks'])==28 and all(c['pass'] for c in b['checks']) and len(b['audits'])==6 and all(not a['violations'] for a in b['audits']) and not b['errors'])
c=load('concurrency-evidence.json');x=load('cross-process-http.json');check('concurrency',c['requests']==36 and c['successes']==30 and c['throttles']==6 and c['errors']==0 and x['processes']==4 and x['successes']==12)
f=load('financial-workload.json');check('financial exact totals',f['orders']==100 and f['expected']==f['actual'] and f['dailyCollected']==f['actual']['collected'] and f['dailyRefunds']==f['actual']['refunded'])
d=load('database-outage-during-request.json');o=load('outage-evidence.json');t=load('outage-timeout-evidence.json');check('outage and recovery',d['requestWasPendingBeforeShutdown'] and d['databaseRestarted'] and d['sessionRecovered'] and not d['financialDataExposed'] and o['recoveredStatus']==200 and t['simulatedHandshakeTimeout'] and t['recoveredStatus']==200 and all(x==503 for x in t['statuses']))
m=load('recovery-evidence.json');sql=root/'prisma/migrations/20261031000000_phase4_report_indexes/migration.sql';check('migration recovery',m['tablesCompared']==47 and m['beforeAndAfterDataDigestMatch'] and m['reportDigestMatch'] and m['financialIntegrationTestsAfterMigration']==9 and m['secondDeploy']=='no pending migrations' and hashlib.sha256(sql.read_bytes()).hexdigest()==m['migrationSha256'])
a=load('dependency-audit.json');check('advisory audit',all(v==0 for v in a['metadata']['vulnerabilities'].values()))
p=load('final-security-and-preservation.json');drafts=load('draft-preservation.json');check('preservation',not p['findings'] and p['preservation']['originalAssets']['checked']==1753 and not p['preservation']['originalAssets']['changes'] and p['preservation']['acceptedSource']['checked']==229 and not p['preservation']['acceptedSource']['changes'] and drafts['mappings']==487 and drafts['drafts']==487 and drafts['priced']==0 and drafts['nondrafts']==0)
for name in ['workload-benchmark.json','workload-indexed.json']:
 w=load(name);check(name,[x['orders'] for x in w['results']]==[100,1000,4000,4900] and all(x['warmups']==2 and x['iterations']==7 and x['totalsVerified'] and len(x['databaseQueryMs'])==7 and len(x['nodeProcessCpuMs'])==7 for x in w['results']))
text=(docs/'ACCEPTANCE_GATE_MATRIX.md').read_text();gates=re.findall(r'^\| (G\d\d) \|.*\| PASS \|',text,re.M);check('fixed matrix',gates==['G%02d'%i for i in range(1,15)])
(docs/'independent-review.json').write_text(json.dumps({'review':'Separate artifact cross-check by the implementer; not an external audit','checks':checks,'result':'PASS_WITH_DOCUMENTED_LOCAL_SCOPE'},indent=2)+'\n')
print('PASS independent evidence consistency checks:',len(checks))
