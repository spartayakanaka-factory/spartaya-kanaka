import {writeFileSync} from "node:fs";
import {createRuntimeDatabase} from "./runtime-db";
import {assertCommerceEnvironment} from "../src/lib/commerce/runtime";
async function main(){assertCommerceEnvironment();const db=createRuntimeDatabase();try{
 const identity=await db.$queryRaw`SELECT DATABASE() databaseName, VERSION() version, @@port port, @@tx_isolation sessionDefaultIsolation, @@foreign_key_checks foreignKeyChecks, @@check_constraint_checks checkConstraintChecks`;
 const constraints=await db.$queryRaw`SELECT TABLE_NAME tableName, CONSTRAINT_NAME constraintName, CONSTRAINT_TYPE constraintType FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_NAME`;
 const indexes=await db.$queryRaw`SELECT TABLE_NAME tableName, INDEX_NAME indexName, COLUMN_NAME columnName, SEQ_IN_INDEX sequenceInIndex FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`;
 writeFileSync("docs/phase3/integration/database-engineering.json",JSON.stringify({readOnly:true,identity,constraints,indexes},(_,v)=>typeof v==="bigint"?String(v):v,2)+"\n");console.log("Read-only database constraint/index evidence saved; no row data or credentials included.");
}finally{await db.$disconnect();}}main().catch(()=>{console.error("Read-only database inspection failed; no credentials logged.");process.exitCode=1;});
