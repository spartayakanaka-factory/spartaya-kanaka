import {createRuntimeDatabase} from "./runtime-db";
import {assertCommerceEnvironment} from "../src/lib/commerce/runtime";
import {fixturePolicy} from "../src/lib/commerce/fixtures";
async function main(){assertCommerceEnvironment();const db=createRuntimeDatabase();try{if(await db.legacyProductMapping.count())throw Error("Imported records found");await fixturePolicy(db);console.log("Explicit synthetic calculation policy refreshed in disposable database.");}finally{await db.$disconnect();}}main().catch(()=>{console.error("Synthetic policy refresh failed");process.exitCode=1;});
