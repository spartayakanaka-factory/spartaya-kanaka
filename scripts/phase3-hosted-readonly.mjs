// Deliberately no valid credentials, uploads, queries, mutations or deployments.
import { writeFile } from "node:fs/promises";
const base="https://bisque-pheasant-330767.hostingersite.com";
const checks=[];
for(const route of ["/","/ar","/en","/admin","/robots.txt","/api/admin/media/upload-url"]){
  const response=await fetch(base+route,{redirect:"manual",signal:AbortSignal.timeout(15000)});
  checks.push({route,credentials:"absent",status:response.status,challenge:response.headers.get("www-authenticate"),noindex:response.headers.get("x-robots-tag"),cache:response.headers.get("cache-control"),...(route==="/robots.txt"?{body:await response.text()}:{})});
}
for(const route of ["/","/admin","/robots.txt"]){
  const response=await fetch(base+route,{headers:{authorization:"Basic "+Buffer.from("invalid-local-review:invalid-local-review").toString("base64")},redirect:"manual",signal:AbortSignal.timeout(15000)});
  checks.push({route,credentials:"invalid",status:response.status,noindex:response.headers.get("x-robots-tag")});
}
await writeFile("docs/phase3/master-execution/hosted-readonly-http.json",JSON.stringify({observedAt:new Date().toISOString(),scope:"Existing Phase 2 build only; no valid credential retrieval or Phase 3 hosted acceptance",checks},null,2)+"\n");
console.log("Read-only anonymous/invalid staging evidence recorded; valid-auth hosted checks remain untested.");
