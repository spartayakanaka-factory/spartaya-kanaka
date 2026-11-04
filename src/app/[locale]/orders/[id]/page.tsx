import {notFound} from "next/navigation";
import {CommercePage} from "@/components/commerce-client";
import {commerceEnabled} from "@/lib/commerce/runtime";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{locale:string;id:string}>}){const {locale,id}=await params;if(!commerceEnabled()||!["ar","en"].includes(locale))notFound();return <CommercePage locale={locale} view="order" orderId={id}/>;}
