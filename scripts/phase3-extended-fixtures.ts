import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRuntimeDatabase } from "./runtime-db";
import { assertCommerceEnvironment } from "../src/lib/commerce/runtime";
import { fixtureProduct } from "../src/lib/commerce/fixtures";
async function main(){
  assertCommerceEnvironment();const db=createRuntimeDatabase();
  try{
    if(await db.legacyProductMapping.count())throw Error("Imported catalog is not a fixture target.");
    const fixtures=JSON.parse(readFileSync(path.join(process.env.P3_STATE_DIR!,"staff.json"),"utf8"));
    const source=await db.product.findUniqueOrThrow({where:{id:fixtures.ready.id},include:{media:true,categories:true}});
    const freshReady=await fixtureProduct(db,"extended-ready-"+randomUUID(),"READY_MADE",20);
    for(const media of source.media)await db.productMedia.create({data:{productId:freshReady.id,mediaId:media.mediaId,position:media.position}});
    for(const category of source.categories)await db.productCategory.create({data:{productId:freshReady.id,categoryId:category.categoryId,position:category.position}});
    writeFileSync(path.join(process.env.P3_STATE_DIR!,"extended-staff.json"),JSON.stringify({...fixtures,ready:freshReady}),{mode:0o600});
    const data=[];
    for(const fullAdvance of [false,true]){
      const product=await fixtureProduct(db,"extended-"+randomUUID(),"MADE_TO_ORDER",0);
      if(fullAdvance)await db.manufacturingPolicy.update({where:{productId:product.id},data:{depositMode:"FULL_ADVANCE",depositType:"PERCENT",depositValue:100}});
      for(const media of source.media)await db.productMedia.create({data:{productId:product.id,mediaId:media.mediaId,position:media.position}});
      for(const category of source.categories)await db.productCategory.create({data:{productId:product.id,categoryId:category.categoryId,position:category.position}});
      data.push({id:product.id,slug:product.slug,fullAdvance});
    }
    const xss=await fixtureProduct(db,"security-"+randomUUID(),"READY_MADE",1);
    const payload='<img src=x onerror="globalThis.__phase3Injected=1">';
    await db.product.update({where:{id:xss.id},data:{titleAr:"اختبار أمان اصطناعي "+payload,titleEn:"Synthetic security fixture "+payload,descriptionAr:payload,descriptionEn:payload}});
    for(const media of source.media)await db.productMedia.create({data:{productId:xss.id,mediaId:media.mediaId,position:media.position}});
    for(const category of source.categories)await db.productCategory.create({data:{productId:xss.id,categoryId:category.categoryId,position:category.position}});
    writeFileSync(path.join(process.env.P3_STATE_DIR!,"extended-security.json"),JSON.stringify({id:xss.id,slug:xss.slug}),{mode:0o600});
    writeFileSync(path.join(process.env.P3_STATE_DIR!,"extended-products.json"),JSON.stringify(data),{mode:0o600});console.log("Two new synthetic manufacturing fixtures created; existing policies untouched.");
  }finally{await db.$disconnect();}
}main().catch(()=>{console.error("Extended disposable fixture setup failed.");process.exitCode=1;});
