/** Reporting facts are immutable, reconciled events; order totals are not cash. */
export type ReportOrder={id:string;state:string;currency:string;totalMinor:bigint;paidMinor:bigint;refundedMinor:bigint;creditedMinor:bigint;paymentMethod:string;isMadeToOrder:boolean};
export type ReportEvent={id:string;orderId:string|null;kind:string;operationKey:string;data:unknown;order:ReportOrder|null};
export type ReportPayment={id:string;orderId:string;currency:string;amountMinor:bigint;method:string;purpose:string};
export type ReportRefund={id:string;orderId:string;amountMinor:bigint;state:string;kind:string};
type Amounts={orderValue:bigint;outstanding:bigint;collected:bigint;refunded:bigint;cod:bigint;wallet:bigint;instapay:bigint;deposits:bigint};
const empty=():Amounts=>({orderValue:BigInt(0),outstanding:BigInt(0),collected:BigInt(0),refunded:BigInt(0),cod:BigInt(0),wallet:BigInt(0),instapay:BigInt(0),deposits:BigInt(0)});
const terminal=new Set(["CANCELLED","EXPIRED","RETURNED"]);
function payload(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw Error("REPORT_INVALID_FINANCIAL_FACT");return value as Record<string,unknown>;}
export function aggregateReports(orders:ReportOrder[],events:ReportEvent[],payments:ReportPayment[],refunds:ReportRefund[]){
 const amounts=new Map<string,Amounts>(),states:Record<string,number>={},seen=new Set<string>();
 const paymentMap=new Map(payments.map(p=>[p.id,p])),refundMap=new Map(refunds.map(r=>[r.id,r]));
 const currency=(code:string)=>{if(!/^[A-Z]{3}$/.test(code))throw Error("REPORT_INVALID_FINANCIAL_FACT");let item=amounts.get(code);if(!item){item=empty();amounts.set(code,item);}return item;};
 for(const o of orders){states[o.state]=(states[o.state]||0)+1;const a=currency(o.currency);if(!terminal.has(o.state)){a.orderValue+=o.totalMinor;const balance=o.totalMinor-o.paidMinor-o.creditedMinor+o.refundedMinor;if(balance<BigInt(0))throw Error("REPORT_INVALID_FINANCIAL_FACT");a.outstanding+=balance;}}
 for(const e of events){if(!e.order||!e.orderId||e.order.id!==e.orderId)throw Error("REPORT_INVALID_FINANCIAL_FACT");const data=payload(e.data),a=currency(e.order.currency);
  if(e.kind==="payment.verified"){
   const p=typeof data.paymentId==="string"?paymentMap.get(data.paymentId):undefined;
   if(!p||p.orderId!==e.orderId||p.currency!==e.order.currency||String(p.amountMinor)!==data.amount||p.currency!==data.currency||p.amountMinor<=BigInt(0))throw Error("REPORT_INVALID_FINANCIAL_FACT");
   const key="payment:"+p.id;if(seen.has(key))throw Error("REPORT_DUPLICATE_FINANCIAL_FACT");seen.add(key);a.collected+=p.amountMinor;if(p.method==="WALLET")a.wallet+=p.amountMinor;if(p.method==="INSTAPAY")a.instapay+=p.amountMinor;if(p.purpose==="INITIAL"&&e.order.isMadeToOrder)a.deposits+=p.amountMinor;
  }else if(e.kind==="fulfillment.cod_reconciled"){
   if(e.order.paymentMethod!=="COD"||e.operationKey!==`fulfill:${e.orderId}:cod_reconciled`)throw Error("REPORT_INVALID_FINANCIAL_FACT");const key="cod:"+e.orderId;if(seen.has(key))throw Error("REPORT_DUPLICATE_FINANCIAL_FACT");seen.add(key);a.collected+=e.order.totalMinor;a.cod+=e.order.totalMinor;
  }else if(e.kind==="finance.reconcile"&&data.kind==="REFUND"){
   const r=typeof data.requestId==="string"?refundMap.get(data.requestId):undefined;if(!r||r.kind!=="REFUND"||r.state!=="RECONCILED"||r.orderId!==e.orderId||String(r.amountMinor)!==data.amount||r.amountMinor<=BigInt(0))throw Error("REPORT_INVALID_FINANCIAL_FACT");const key="refund:"+r.id;if(seen.has(key))throw Error("REPORT_DUPLICATE_FINANCIAL_FACT");seen.add(key);a.refunded+=r.amountMinor;
  }
 }
 return {totalOrders:orders.length,states,currencies:[...amounts].sort(([a],[b])=>a.localeCompare(b)).map(([code,a])=>({currency:code,...Object.fromEntries(Object.entries(a).map(([k,v])=>[k,String(v)])),netCollected:String(a.collected-a.refunded)}))};
}
