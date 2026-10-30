#!/usr/bin/env python3
"""Read-only preservation and secret scan. Reports filenames, never matching values."""
from pathlib import Path
import hashlib,json,re,subprocess
root=Path(__file__).resolve().parents[1]
outer=root.parent
accepted=root.parents[2]
results={}
for label,filename in [('phase2Files','phase2-files-before.json'),('archiveFiles','phase2-images-before.json')]:
    before=json.loads((outer/filename).read_text())
    changed=[name for name,value in before.items() if not (accepted/name).is_file() or hashlib.sha256((accepted/name).read_bytes()).hexdigest()!=value]
    results[label]={'checked':len(before),'changed':changed}
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0')
private_values=set()
def collect(value):
    if isinstance(value,dict):
        for k,v in value.items():
            if any(x in k.lower() for x in ('password','secret','accesskey','token','root','app')) and isinstance(v,str) and len(v)>=16:private_values.add(v)
            elif isinstance(v,(dict,list)):collect(v)
    elif isinstance(value,list):
        for v in value:collect(v)
for p in (outer/'runtime').rglob('*.json'):
    if any(x in str(p) for x in ('/database/data/','/media/','notification-capture')):continue
    try:collect(json.loads(p.read_text()))
    except (ValueError,UnicodeDecodeError,OSError):pass
# The exact local secrets known to the runner must also be checked.
for p in [outer/'runtime/secrets.json',outer/'runtime/database/credentials.json',outer/'runtime/media/credentials.json']:
    if p.exists():
        for v in json.loads(p.read_text()).values():
            if isinstance(v,str) and len(v)>=16:private_values.add(v)
patterns=[r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',r'gh[pousr]_[A-Za-z0-9]{30,}',r'github_pat_[A-Za-z0-9_]{50,}',r'AKIA[A-Z0-9]{16}',r'mysql://[^\s:@]+:[A-Za-z0-9_-]{20,}@']
findings=[]
for name in sorted(set(files)):
    if not name:continue
    file=root/name
    if file.is_symlink():continue
    if file.name.startswith('.env') and file.name!='.env.example':findings.append({'file':name,'rule':'environment-file'});continue
    if file.name in {'credentials.json','staff.json','secrets.json'} or file.name.endswith('.sql.verified.json'):findings.append({'file':name,'rule':'private-state-file'});continue
    try:content=file.read_text()
    except (UnicodeDecodeError,OSError):continue
    if any(v in content for v in private_values):findings.append({'file':name,'rule':'known-private-value'})
    for i,pattern in enumerate(patterns):
        if re.search(pattern,content):findings.append({'file':name,'rule':'credential-pattern-'+str(i)})
results['secretScan']={'files':len(set(files)-{''}),'findings':findings,'privateValuesChecked':len(private_values)}
results['originalImageCount']=sum(1 for name in json.loads((outer/'phase2-images-before.json').read_text()) if re.search(r'\.(jpg|jpeg|png|webp)$',name,re.I))
output=root/'docs/phase3/preservation-and-secrets.json'
output.write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
raise SystemExit(1 if findings or any(results[k]['changed'] for k in ['phase2Files','archiveFiles']) else 0)
