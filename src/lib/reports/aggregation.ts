/** Reporting facts are immutable, reconciled events; order totals are not cash. */
export type ReportOrder = {
  id: string;
  state: string;
  currency: string;
  totalMinor: bigint;
  paidMinor: bigint;
  refundedMinor: bigint;
  creditedMinor: bigint;
  paymentMethod: string;
  isMadeToOrder: boolean;
  codReconciled: boolean;
};
export type ReportEvent = {
  id: string;
  orderId: string | null;
  kind: string;
  operationKey: string;
  data: unknown;
  order: ReportOrder | null;
};
export type ReportPayment = {
  id: string;
  orderId: string;
  currency: string;
  amountMinor: bigint;
  method: string;
  purpose: string;
  state: string;
};
export type ReportRefund = {
  id: string;
  orderId: string;
  amountMinor: bigint;
  state: string;
  kind: string;
};
type Amounts = {
  orderValue: bigint;
  outstanding: bigint;
  collected: bigint;
  refunded: bigint;
  cod: bigint;
  wallet: bigint;
  instapay: bigint;
  deposits: bigint;
  codCount: bigint;
  walletCount: bigint;
  instapayCount: bigint;
  codPending: bigint;
};
const empty = (): Amounts => ({
  orderValue: BigInt(0),
  outstanding: BigInt(0),
  collected: BigInt(0),
  refunded: BigInt(0),
  cod: BigInt(0),
  wallet: BigInt(0),
  instapay: BigInt(0),
  deposits: BigInt(0),
  codCount: BigInt(0),
  walletCount: BigInt(0),
  instapayCount: BigInt(0),
  codPending: BigInt(0),
});
const terminal = new Set(["CANCELLED", "EXPIRED", "RETURNED"]);
function payload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("REPORT_INVALID_FINANCIAL_FACT");
  return value as Record<string, unknown>;
}
export function aggregateReports(
  orders: ReportOrder[],
  events: ReportEvent[],
  payments: ReportPayment[],
  refunds: ReportRefund[],
) {
  const amounts = new Map<string, Amounts>(),
    states: Record<string, number> = {},
    seen = new Set<string>();
  let unpaidOrders = 0,
    awaitingFulfillment = 0;
  const receiptsByOrder = new Map<string, bigint>(),
    refundsByOrder = new Map<string, bigint>();
  const bound = (map: Map<string, bigint>, id: string, amount: bigint, limit: bigint) => {
    const total = (map.get(id) || BigInt(0)) + amount;
    if (total > limit) throw Error("REPORT_INVALID_FINANCIAL_FACT");
    map.set(id, total);
  };
  const paymentMap = new Map(payments.map((p) => [p.id, p])),
    refundMap = new Map(refunds.map((r) => [r.id, r]));
  const currency = (code: string) => {
    if (!/^[A-Z]{3}$/.test(code)) throw Error("REPORT_INVALID_FINANCIAL_FACT");
    let item = amounts.get(code);
    if (!item) {
      item = empty();
      amounts.set(code, item);
    }
    return item;
  };
  for (const o of orders) {
    if (
      o.totalMinor < BigInt(0) ||
      o.paidMinor < BigInt(0) ||
      o.paidMinor > o.totalMinor ||
      o.refundedMinor < BigInt(0) ||
      o.refundedMinor > o.paidMinor ||
      o.creditedMinor < BigInt(0)
    )
      throw Error("REPORT_INVALID_FINANCIAL_FACT");
    states[o.state] = (states[o.state] || 0) + 1;
    const a = currency(o.currency);
    if (!terminal.has(o.state)) {
      a.orderValue += o.totalMinor;
      const balance = o.totalMinor - o.paidMinor - o.creditedMinor + o.refundedMinor;
      if (balance < BigInt(0)) throw Error("REPORT_INVALID_FINANCIAL_FACT");
      a.outstanding += balance;
      if (o.paymentMethod === "COD") a.codPending += balance;
      if (balance > BigInt(0) && o.paidMinor - o.refundedMinor <= BigInt(0)) unpaidOrders++;
      if (["CONFIRMED", "IN_PRODUCTION", "READY"].includes(o.state)) awaitingFulfillment++;
    }
  }
  for (const e of events) {
    if (!e.order || !e.orderId || e.order.id !== e.orderId)
      throw Error("REPORT_INVALID_FINANCIAL_FACT");
    const data = payload(e.data),
      a = currency(e.order.currency);
    if (e.kind === "payment.verified") {
      const p = typeof data.paymentId === "string" ? paymentMap.get(data.paymentId) : undefined;
      if (
        !p ||
        p.orderId !== e.orderId ||
        p.currency !== e.order.currency ||
        p.state !== "SUCCEEDED" ||
        !["WALLET", "INSTAPAY", "MOCK_CARD"].includes(p.method) ||
        p.method !== e.order.paymentMethod ||
        p.amountMinor > e.order.paidMinor ||
        String(p.amountMinor) !== data.amount ||
        p.currency !== data.currency ||
        p.amountMinor <= BigInt(0)
      )
        throw Error("REPORT_INVALID_FINANCIAL_FACT");
      const key = "payment:" + p.id;
      if (seen.has(key)) throw Error("REPORT_DUPLICATE_FINANCIAL_FACT");
      seen.add(key);
      bound(receiptsByOrder, e.orderId, p.amountMinor, e.order.paidMinor);
      a.collected += p.amountMinor;
      if (p.method === "WALLET") {
        a.wallet += p.amountMinor;
        a.walletCount += BigInt(1);
      }
      if (p.method === "INSTAPAY") {
        a.instapay += p.amountMinor;
        a.instapayCount += BigInt(1);
      }
      if (p.purpose === "INITIAL" && e.order.isMadeToOrder) a.deposits += p.amountMinor;
    } else if (e.kind === "fulfillment.cod_reconciled") {
      if (
        e.order.paymentMethod !== "COD" ||
        !e.order.codReconciled ||
        e.order.paidMinor < e.order.totalMinor ||
        e.operationKey !== `fulfill:${e.orderId}:cod_reconciled`
      )
        throw Error("REPORT_INVALID_FINANCIAL_FACT");
      const key = "cod:" + e.orderId;
      if (seen.has(key)) throw Error("REPORT_DUPLICATE_FINANCIAL_FACT");
      seen.add(key);
      bound(receiptsByOrder, e.orderId, e.order.totalMinor, e.order.paidMinor);
      a.collected += e.order.totalMinor;
      a.cod += e.order.totalMinor;
      a.codCount += BigInt(1);
    } else if (e.kind === "finance.reconcile" && data.kind === "REFUND") {
      const r = typeof data.requestId === "string" ? refundMap.get(data.requestId) : undefined;
      if (
        !r ||
        r.kind !== "REFUND" ||
        r.state !== "RECONCILED" ||
        r.orderId !== e.orderId ||
        r.amountMinor > e.order.refundedMinor ||
        String(r.amountMinor) !== data.amount ||
        r.amountMinor <= BigInt(0)
      )
        throw Error("REPORT_INVALID_FINANCIAL_FACT");
      const key = "refund:" + r.id;
      if (seen.has(key)) throw Error("REPORT_DUPLICATE_FINANCIAL_FACT");
      seen.add(key);
      bound(refundsByOrder, e.orderId, r.amountMinor, e.order.refundedMinor);
      a.refunded += r.amountMinor;
    } else if (e.kind === "finance.reconcile" && data.kind !== "VERIFY_TRANSFER") {
      throw Error("REPORT_INVALID_FINANCIAL_FACT");
    }
  }
  return {
    totalOrders: orders.length,
    unpaidOrders,
    awaitingFulfillment,
    states,
    currencies: [...amounts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, a]) => ({
        currency: code,
        ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])),
        netCollected: String(a.collected - a.refunded),
      })),
  };
}
