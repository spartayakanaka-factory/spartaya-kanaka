"""Deterministic source-only ZIP; no deployment, credentials, generated outputs or investigation docs."""
import hashlib,json,pathlib,re,subprocess,sys,unicodedata,zipfile
root=pathlib.Path.cwd();preview='--worktree' in sys.argv
sha=subprocess.check_output(['git','rev-parse',sys.argv[1] if len(sys.argv)>1 and not sys.argv[1].startswith('--') else 'HEAD'],text=True).strip()
if not re.fullmatch('[a-f0-9]{40}',sha):raise RuntimeError('Exact commit required')
if not preview and subprocess.check_output(['git','status','--porcelain'],text=True).strip():raise RuntimeError('Commit the reviewed source before final packaging')
names=set(filter(None,subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z'] if preview else ['git','ls-tree','-r','--name-only','-z',sha]).decode().split('\0')))
def data(n):return (root/n).read_bytes() if preview else subprocess.check_output(['git','show',sha+':'+n])
selected={n for n in names if (n.startswith(('src/','public/','prisma/','sprtaya-kanaka-assets/بيانات/','sprtaya-kanaka-assets/الهوية البصرية/')) and not re.search(r'\.(?:test|spec)\.[cm]?[jt]sx?$',n)) or n in {'package.json','pnpm-lock.yaml','pnpm-workspace.yaml','next.config.mjs','next-env.d.ts','tsconfig.json','postcss.config.mjs','prisma.config.ts','eslint.config.mjs','docs/phase4/migration-manifest.json'}}
pkg=json.loads(data('package.json'));pending=set(re.findall(r'scripts/[A-Za-z0-9_./-]+\.(?:ts|mjs|py)', '\n'.join(pkg['scripts'].values())))
while pending:
 n=pending.pop()
 if n in selected:continue
 if n not in names:raise RuntimeError('Referenced operational script absent: '+n)
 selected.add(n);body=data(n).decode()
 for ref in re.findall(r'''(?:from\s*|import\s*\()\s*["'](\.[^"']+)["']''',body):
  base=pathlib.PurePosixPath(n).parent/ref
  normalized=str(pathlib.Path(base)).replace('/./','/')
  normalized=str(pathlib.PurePosixPath(normalized))
  for candidate in [normalized,normalized+'.ts',normalized+'.mjs',normalized+'.py']:
   # Resolve .. without touching filesystem symlinks.
   candidate=str(pathlib.Path(candidate).resolve().relative_to(root))
   if candidate in names and candidate.startswith('scripts/'):pending.add(candidate);break
 for child in re.findall(r'scripts/[A-Za-z0-9_./-]+\.(?:ts|mjs|py)',body):
  if child in names and child not in selected:pending.add(child)
required={'package.json','pnpm-lock.yaml','pnpm-workspace.yaml','next.config.mjs','prisma/schema.prisma','prisma.config.ts','src/proxy.ts','src/app/api/staging-database-preflight/route.ts'}
if not required<=selected:raise RuntimeError('Required release files absent')
contents={};normalized=set()
for n in sorted(selected):
 p=pathlib.PurePosixPath(n)
 if p.is_absolute() or '..' in p.parts or '\\' in n or any(x in p.parts for x in ['.git','.local','node_modules']) or p.name.startswith('.env'):raise RuntimeError('Unsafe release member')
 key=unicodedata.normalize('NFC',n)
 if key in normalized:raise RuntimeError('Unicode normalization collision')
 normalized.add(key);contents[n]=data(n)
manifest={'sourceCommit':sha,'uncommittedPreview':preview,'node':'22.x','pnpm':'11.24.0','build':'pnpm build','output':'.next','originalProductMedia':'external LEGACY_ASSET_ROOT; preserve separately','members':{n:hashlib.sha256(b).hexdigest()for n,b in contents.items()}}
contents['RELEASE-MANIFEST.json']=(json.dumps(manifest,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()
out=root.parent/'releases';out.mkdir(exist_ok=True);archive=out/('sprtaya-phase55-'+('preview' if preview else sha[:12])+'.zip')
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9)as z:
 z.comment=sha.encode()
 for n,b in contents.items():
  info=zipfile.ZipInfo(n,(1980,1,1,0,0,0));info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,b,compresslevel=9)
with zipfile.ZipFile(archive)as z:
 if z.testzip() is not None:raise RuntimeError('ZIP integrity failure')
 for i in z.infolist():
  if any(ord(c)>127 for c in i.filename) and not i.flag_bits&0x800:raise RuntimeError('UTF-8 metadata absent')
blob=archive.read_bytes();assert len(blob)<50_000_000
result={'sourceCommit':sha,'preview':preview,'archive':str(archive),'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'members':len(contents),'utf8Metadata':'PASS','unicodeCollisions':0,'unsafePaths':0,'integrity':'PASS','deployed':False}
(out/('preview.json' if preview else 'release.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
