import hashlib, io, json, pathlib, re, subprocess, zipfile
root=pathlib.Path.cwd(); state=root.parent/'runtime'; evidence=root/'docs/phase4'
values=set()
def collect(x):
    if isinstance(x,str) and len(x)>=12: values.add(x.encode())
    elif isinstance(x,dict):
        for v in x.values(): collect(v)
    elif isinstance(x,list):
        for v in x: collect(v)
for private_root in [state,state/'outage-isolated',root.parents[1]/'phase3/runtime',root.parents[1]/'phase35/runtime']:
    for name in ['secrets.json','database/credentials.json','media/credentials.json']:
        file=private_root/name
        if file.exists():collect(json.loads(file.read_text()))
    for name in ['staff.json','extended-staff.json']:
        file=private_root/name
        if file.exists():
            for u in json.loads(file.read_text())['staff']:collect(u.get('password'))
patterns=[re.compile(p) for p in [rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'(?:AKIA|ASIA)[A-Z0-9]{16}',rb'gh[pousr]_[A-Za-z0-9]{30,}',rb'github_pat_[A-Za-z0-9_]{60,}',rb'''mysql://[^\s:/"'`<>]+:[^\s@"'`{}<>]{10,}@''']]
findings=[]; counts={'workingTextFiles':0,'buildFiles':0,'historyBlobs':0,'archiveMembers':0}
def scan(data,label,kind):
    counts[kind]+=1
    if any(v in data for v in values): findings.append({'path':label,'type':'known-private-value'})
    # Exact reviewed non-secret fixture password; interpolation expressions and
    # angle-bracket documentation placeholders are not literal credentials.
    literal=data.replace(b':test-password@',b':FIXTURE@')
    if any(p.search(literal) for p in patterns): findings.append({'path':label,'type':'credential-pattern'})
def archive(data,label):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for n in z.namelist():
            b=z.read(n)
            if b'\0' not in b[:1024]: scan(b,label+'!'+n,'archiveMembers')
names=subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z']).decode().split('\0')
for n in set(filter(None,names)):
    p=root/n
    if p.is_file():
        b=p.read_bytes()
        if p.suffix=='.zip': archive(b,n)
        elif p.suffix not in ['.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2'] and b'\0' not in b[:1024]: scan(b,n,'workingTextFiles')
for p in (root/'.next-phase4').rglob('*'):
    if p.is_file() and p.suffix in ['.js','.json','.html','.rsc','.map']:
        scan(p.read_bytes(),str(p.relative_to(root)),'buildFiles')
objects=subprocess.check_output(['git','rev-list','--objects','HEAD']).decode().splitlines()
oids=list(dict.fromkeys(line.split(' ',1)[0] for line in objects))
meta=subprocess.check_output(['git','cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],input=('\n'.join(oids)+'\n').encode()).decode().splitlines()
for m in meta:
    oid,kind,size=m.split()
    if kind!='blob' or int(size)>12000000: continue
    b=subprocess.check_output(['git','cat-file','blob',oid])
    if b.startswith(b'PK\x03\x04'): archive(b,'git:'+oid)
    elif b'\0' not in b[:2048]: scan(b,'git:'+oid,'historyBlobs')
traces=[]; private=[str(state),'/database/env.local','/database/env.test','/secrets.json','/.env']
for p in (root/'.next-phase4').rglob('*.nft.json'):
    fs=json.loads(p.read_text())['files']; joined='\n'.join(fs)
    if any(s in joined for s in private): findings.append({'path':str(p.relative_to(root)),'type':'private-traced-path'})
    if 'node_modules/@swc/helpers/' in joined:
        traces.append({'manifest':str(p.relative_to(root)),'exports':any(f.endswith('@swc/helpers/package.json') for f in fs),'cjs':any('@swc/helpers/cjs/' in f for f in fs),'esm':any('@swc/helpers/esm/' in f for f in fs)})
if not traces or not all(t['exports'] and t['cjs'] and t['esm'] for t in traces): findings.append({'type':'incomplete-swc-tracing'})
preserved={}
base=root.parents[2]
for title,manifest in [('acceptedSource',root.parents[1]/'phase3/integration-tools/root-source-manifest.json'),('originalAssets',root.parents[1]/'phase3/phase2-images-before.json')]:
    expected=json.loads(manifest.read_text()); bad=[]
    for n,d in expected.items():
        p=base/n
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=d: bad.append(n)
    preserved[title]={'checked':len(expected),'changes':bad}
    if bad: findings.append({'type':'preservation-failed','scope':title})
report={'scope':'Known private local secrets/passwords, credential patterns, tracked/untracked candidate text, reachable history text/ZIPs and generated build text; no hosted secret values accessed','knownPrivateValuesChecked':len(values),'counts':counts,'swcTraceManifests':len(traces),'swcMetadataCjsEsmPresent':all(t['exports'] and t['cjs'] and t['esm'] for t in traces),'preservation':preserved,'findings':findings}
(evidence/'final-security-and-preservation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2));raise SystemExit(bool(findings))
