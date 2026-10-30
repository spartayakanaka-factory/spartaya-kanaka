import {describe,it,expect} from "vitest";
import {aggregateReports,type ReportOrder,type ReportEvent,type ReportPayment} from "./aggregation";
const order:ReportOrder={id:"order",state:"CONFIRMED",currency:"EGP",totalMinor:BigInt(10000),paidMinor:BigInt(5000),refundedMinor:BigInt(0),creditedMinor:BigInt(0),paymentMethod:"WALLET",isMadeToOrder:true};
const payment:ReportPayment={id:"payment",orderId:"order",currency:"EGP",amountMinor:BigInt(5000),method:"WALLET",purpose:"INITIAL"};
const verified:ReportEvent={id:"event",orderId:"order",order,kind:"payment.verified",operationKey:"verify",data:{paymentId:"payment",amount:"5000",currency:"EGP"}};
describe("owner reporting financial facts",()=>{
 it("separates order value, verified deposit and remaining balance without double counting",()=>{const r=aggregateReports([order],[verified],[payment],[]);expect(r.currencies[0]).toMatchObject({orderValue:"10000",outstanding:"5000",collected:"5000",wallet:"5000",deposits:"5000",netCollected:"5000"});});
 it("rejects duplicate or mismatched verified events",()=>{expect(()=>aggregateReports([order],[verified,verified],[payment],[])).toThrow("REPORT_DUPLICATE_FINANCIAL_FACT");expect(()=>aggregateReports([order],[{...verified,data:{paymentId:"payment",amount:"9999",currency:"EGP"}}],[payment],[])).toThrow("REPORT_INVALID_FINANCIAL_FACT");});
 it("does not include cancelled obligations or unverified proof in cash",()=>{const cancelled={...order,state:"CANCELLED"};expect(aggregateReports([cancelled],[],[],[]).currencies[0]).toMatchObject({orderValue:"0",outstanding:"0",collected:"0"});});
 it("subtracts only reconciled refunds and preserves integer precision",()=>{const refund={id:"refund",orderId:"order",amountMinor:BigInt(1000),kind:"REFUND",state:"RECONCILED"};const event={...verified,id:"refund-event",kind:"finance.reconcile",data:{requestId:"refund",kind:"REFUND",amount:"1000"}};expect(aggregateReports([order],[verified,event],[payment],[refund]).currencies[0].netCollected).toBe("4000");expect(()=>aggregateReports([order],[event],[],[{...refund,state:"REQUESTED"}])).toThrow();});
});
