// GitHub-hosted ephemeral Linux runner only. No factory credentials, deploy,
// hosted DB connections or use of an existing database/container are supported.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import mariadb from "mariadb";
import sharp from "sharp";
import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true" || process.platform !== "linux" || !process.version.startsWith("v22.")) throw Error("Only an ephemeral GitHub Linux/Node22 runner is supported.");
const root=process.cwd(), state=mkdtempSync(path.join(os.tmpdir(),"sprtaya-ci-"));
const evidence="docs/phase3/master-execution/ci", assets=path.join(state,"assets");
mkdirSync(evidence,{recursive:true});mkdirSync(path.join(state,"database"),{recursive:true,mode:0o700});
const secrets=Object.fromEntries(["root","app","auth","s3","s3admin"].map(k=>[k,randomBytes(32).toString("hex")]));
const owned=[];let app,connection;
function run(binary,args,env=process.env,capture=false){const r=spawnSync(binary,args,{cwd:root,env,encoding:"utf8",stdio:capture?["ignore","pipe","pipe"]:"inherit"});if(r.status!==0)throw Error("CI command failed: "+binary+" "+args[0]+(capture?"\n"+(r.stderr||""):""));return r.stdout?.trim();}
function redact(value){let text=String(value);for(const secret of Object.values(secrets))text=text.split(secret).join("[REDACTED]");return text.replace(/mysql:\/\/[^\s]+/g,"[REDACTED_DATABASE_URL]");}
function file(name,value){writeFileSync(name,value,{mode:0o600});}
const env={...process.env,P3_STATE_DIR:state,LEGACY_ASSET_ROOT:assets,P3_EVIDENCE_DIR:evidence,P3_BASE_URL:"http://localhost:3003",P3_APP_PORT:"3003",P3_EXTENDED_JOURNEYS:"1",P3_STAFF_FILE:"extended-staff.json"};
async function main(){
  console.log("Starting newly named, loopback-only disposable containers.");
  const id=run("docker",["run","-d","--label","sprtaya.disposable-ci=1","--publish","127.0.0.1:33078:33078","--env","MARIADB_ROOT_PASSWORD","mariadb:11.8.9","--port=33078","--bind-address=0.0.0.0"],{...env,MARIADB_ROOT_PASSWORD:secrets.root},true);owned.push(id);
  for(let i=0;i<90;i++)try{connection=await mariadb.createConnection({host:"127.0.0.1",port:33078,user:"root",password:secrets.root,connectTimeout:1000});break;}catch{await new Promise(r=>setTimeout(r,1000));}
  if(!connection)throw Error("Fresh MariaDB container did not become ready.");
  console.log("PASS fresh MariaDB connection; verifying identity and scoped schemas.");
  const identity=await connection.query("SELECT VERSION() v,@@port p");if(!identity[0].v.startsWith("11.8.9-MariaDB")||Number(identity[0].p)!==33078)throw Error("CI database identity mismatch.");
  for(const name of ["sprtaya_phase3_disposable_local","sprtaya_phase3_disposable_test"])await connection.query("CREATE DATABASE `"+name+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  await connection.query("CREATE USER 'sprtaya_phase3'@'%' IDENTIFIED BY ?",[secrets.app]);
  for(const name of ["sprtaya_phase3_disposable_local","sprtaya_phase3_disposable_test"])await connection.query("GRANT ALL ON `"+name+"`.* TO 'sprtaya_phase3'@'%'");
  const s3file=path.join(state,"s3.json");file(s3file,JSON.stringify({identities:[{name:"anonymous",actions:["Read:sprtaya-phase3-display"]},{name:"app",credentials:[{accessKey:"ci-app",secretKey:secrets.s3}],actions:["Read:sprtaya-phase3-originals","Write:sprtaya-phase3-originals","Read:sprtaya-phase3-display","Write:sprtaya-phase3-display"]},{name:"bootstrap",credentials:[{accessKey:"ci-admin",secretKey:secrets.s3admin}],actions:["Admin","Read","Write","List"]}]}));
  console.log("Starting fresh disposable S3 and checking private/public buckets.");
  const media=run("docker",["run","-d","--label","sprtaya.disposable-ci=1","--publish","127.0.0.1:39010:39010","--mount",`type=bind,source=${s3file},target=/s3.json,readonly`,"chrislusf/seaweedfs:4.51","mini","-dir=/data","-ip=127.0.0.1","-ip.bind=0.0.0.0","-s3.port=39010","-s3.config=/s3.json","-s3.allowedOrigins=http://localhost:3003","-master.telemetry=false","-admin.ui=false","-webdav=false","-s3.iam=false"],env,true);owned.push(media);
  const s3=new S3Client({endpoint:"http://127.0.0.1:39010",region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId:"ci-admin",secretAccessKey:secrets.s3admin}});
  let ready=false;for(let i=0;i<90;i++)try{for(const Bucket of ["sprtaya-phase3-originals","sprtaya-phase3-display"]){try{await s3.send(new HeadBucketCommand({Bucket}));}catch{await s3.send(new CreateBucketCommand({Bucket}));}}ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}s3.destroy();if(!ready)throw Error("Fresh S3 container did not become ready.");
  console.log("PASS fresh disposable S3; applying checked migrations to fresh owned schemas only.");
  for(const test of [false,true]){
    const name=test?"sprtaya_phase3_disposable_test":"sprtaya_phase3_disposable_local";
    const values={DATABASE_URL:`mysql://sprtaya_phase3:${secrets.app}@127.0.0.1:33078/${name}`,DATABASE_TARGET:"local",BETTER_AUTH_SECRET:secrets.auth,MEDIA_S3_ENDPOINT:"http://127.0.0.1:39010",MEDIA_S3_REGION:"us-east-1",MEDIA_S3_FORCE_PATH_STYLE:"true",MEDIA_S3_ORIGINALS_BUCKET:"sprtaya-phase3-originals",MEDIA_S3_DISPLAY_BUCKET:"sprtaya-phase3-display",MEDIA_ACCESS_KEY_ID:"ci-app",MEDIA_SECRET_ACCESS_KEY:secrets.s3,MEDIA_PUBLIC_BASE_URL:"http://127.0.0.1:39010/sprtaya-phase3-display"};
    file(path.join(state,"database",test?"env.test":"env.local"),Object.entries(values).map(([k,v])=>k+"="+v).join("\n")+"\n");
    if(!test)run(process.execPath,["scripts/phase3.mjs","generate"],env);
    // Direct deploy is confined to brand-new, privately generated containers
    // and the two app-user schemas; it cannot be used for hosted promotion.
    const manifest=JSON.parse(readFileSync("docs/phase3/migration-manifest.json"));for(const m of manifest.migrations)if(createHash("sha256").update(readFileSync(`prisma/migrations/${m.name}/migration.sql`)).digest("hex")!==m.sha256)throw Error("CI migration manifest differs.");
    run(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{...env,...values});
    run(process.execPath,["scripts/phase3.mjs","exec","scripts/seed-database.ts",...(test?["--test"]:[])],env);
  }
  // Explicit synthetic CI image, never a replacement for preserved factory photos.
  const folder=path.join(assets,"المنتجات","CI-SYNTHETIC-ONLY");mkdirSync(folder,{recursive:true});await sharp({create:{width:64,height:64,channels:3,background:"#98663d"}}).webp().toFile(path.join(folder,"synthetic.webp"));
  run(process.execPath,["scripts/phase3.mjs","seed"],env);
  run(process.execPath,["scripts/phase3.mjs","exec","scripts/phase3-extended-fixtures.ts"],env);
  for(const command of ["validate","lint","build","typecheck"])run(process.execPath,["scripts/phase3.mjs",command],env);
  run(process.execPath,["scripts/phase3.mjs","test","--testTimeout=30000","--reporter=json","--outputFile="+evidence+"/regression-tests.json"],env);
  const report=JSON.parse(readFileSync(evidence+"/regression-tests.json"));if(report.numFailedTests||report.numPendingTests)throw Error("CI requires all database/storage tests enabled and passing.");
  app=spawn(process.execPath,["scripts/phase3.mjs","start"],{env,stdio:"inherit",detached:true});let healthy=false;
  for(let i=0;i<100;i++)try{const r=await fetch("http://localhost:3003/ar");if(r.status===200){healthy=true;break;}}catch{}finally{if(!healthy)await new Promise(r=>setTimeout(r,200));}
  if(!healthy)throw Error("CI production server did not become healthy.");
  for(const script of ["phase3-independent-browser.mjs","phase3-inventory-review.mjs","phase3-staging-http.mjs","phase3-media-browser.mjs"])run(process.execPath,["scripts/phase3.mjs","exec","scripts/"+script],env);
  console.log("PASS fresh disposable CI acceptance; no deployment commands or production credentials used.");
}
try{await main();}catch(error){console.error("CI acceptance failed: "+redact(error instanceof Error?error.message:"unknown stage error"));for(const id of owned){for(const args of [["inspect","--format","{{.State.Status}} {{.State.ExitCode}} {{.State.Error}}",id],["logs","--tail","40",id]]){const result=spawnSync("docker",args,{encoding:"utf8"});console.error(redact((result.stdout||"")+(result.stderr||"")));}}process.exitCode=1;}finally{if(app)try{process.kill(-app.pid,"SIGTERM");}catch{}if(connection)await connection.end();for(const id of owned.reverse())spawnSync("docker",["rm","--force",id],{stdio:"ignore"});}
