/** Labels only: canonical state transitions remain in the commerce services. */
export const orderStateLabels: Record<string, string> = {
  AWAITING_PAYMENT: "بانتظار الدفعة الأولى",
  CONFIRMED: "مؤكد · بانتظار التجهيز",
  IN_PRODUCTION: "قيد التصنيع",
  READY: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
  EXPIRED: "انتهت مهلة الدفع",
  RETURNED: "مرتجع",
};
export const paymentMethodLabels: Record<string, string> = {
  COD: "الدفع عند الاستلام",
  WALLET: "محفظة إلكترونية",
  INSTAPAY: "إنستاباي",
  MOCK_CARD: "بطاقة اختبار",
};
export const numberAr = (value: number) => new Intl.NumberFormat("ar-EG").format(value);
