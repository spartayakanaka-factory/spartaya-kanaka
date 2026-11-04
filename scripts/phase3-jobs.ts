import {setTimeout as delay} from "node:timers/promises";
import {getDatabase} from "../src/lib/server/database";
import {expireOrders} from "../src/lib/server/commerce/store";
import {drainNotifications} from "../src/lib/server/commerce/notifications";
import {assertCommerceEnvironment} from "../src/lib/commerce/runtime";
async function main(){
 assertCommerceEnvironment();const watch=process.argv.includes("--watch");let stopped=false;
 process.on("SIGINT",()=>{stopped=true;});process.on("SIGTERM",()=>{stopped=true;});
 try{do{assertCommerceEnvironment();const expired=await expireOrders(),captured=await drainNotifications();console.log(JSON.stringify({scope:"local-disposable-only",expired,captured}));if(watch&&!stopped)await delay(15000);}while(watch&&!stopped);}finally{await getDatabase().$disconnect();}
}
main().catch(()=>{console.error("Local maintenance stopped safely; inspect disposable state. No credentials logged.");process.exitCode=1;});
