"use client";

import { useState } from "react";

export type VariantDraft = {
  id?: string;
  nameAr: string;
  nameEn: string;
  sku: string;
  price: string;
  optionsText: string;
  widthMm: string;
  heightMm: string;
  depthMm: string;
  weightGrams: string;
  quantity: string;
};

const blankVariant: VariantDraft = { nameAr: "", nameEn: "", sku: "", price: "", optionsText: "", widthMm: "", heightMm: "", depthMm: "", weightGrams: "", quantity: "" };

export function VariantEditor({ initial, existingProduct }: { initial: VariantDraft[]; existingProduct: boolean }) {
  const [variants, setVariants] = useState(initial.length ? initial : [blankVariant]);
  function update(index: number, key: keyof VariantDraft, value: string) {
    setVariants((current) => current.map((item, row) => row === index ? { ...item, [key]: value } : item));
  }
  return <section className="admin-variant-editor wide">
    <div className="admin-variant-heading"><div><strong>خيارات المنتج</strong><small>أضف المقاس أو التشطيب إن وجد. يظل لكل متغير رصيد مستقل.</small></div><button className="admin-button" onClick={() => setVariants((current) => [...current, { ...blankVariant, nameAr: "" }])} type="button">إضافة متغير</button></div>
    <input name="variantsJson" type="hidden" value={JSON.stringify(variants)} />
    {variants.map((variant, index) => <fieldset className="admin-variant-row" key={variant.id ?? index}>
      <legend>المتغير {index + 1}</legend>
      {variant.id ? <input type="hidden" value={variant.id} /> : null}
      <label>الاسم بالعربية<input maxLength={191} onChange={(event) => update(index, "nameAr", event.target.value)} required value={variant.nameAr} /></label>
      <label>الاسم بالإنجليزية<input maxLength={191} onChange={(event) => update(index, "nameEn", event.target.value)} value={variant.nameEn} /></label>
      <label>SKU<input dir="ltr" maxLength={96} onChange={(event) => update(index, "sku", event.target.value)} value={variant.sku} /></label>
      <label>سعر المتغير (ج.م.)<input inputMode="decimal" onChange={(event) => update(index, "price", event.target.value)} placeholder="اتركه فارغاً لاستخدام سعر المنتج" type="text" value={variant.price} /></label>
      <label className="wide">الخيارات — مثال: المقاس=وسط؛ التشطيب=مطروق<input maxLength={500} onChange={(event) => update(index, "optionsText", event.target.value)} value={variant.optionsText} /></label>
      <label>العرض (مم)<input max="50000" min="0" onChange={(event) => update(index, "widthMm", event.target.value)} type="number" value={variant.widthMm} /></label>
      <label>الارتفاع (مم)<input max="50000" min="0" onChange={(event) => update(index, "heightMm", event.target.value)} type="number" value={variant.heightMm} /></label>
      <label>العمق (مم)<input max="50000" min="0" onChange={(event) => update(index, "depthMm", event.target.value)} type="number" value={variant.depthMm} /></label>
      <label>الوزن (جرام)<input max="500000" min="0" onChange={(event) => update(index, "weightGrams", event.target.value)} type="number" value={variant.weightGrams} /></label>
      <label>كمية البداية<input disabled={existingProduct && Boolean(variant.id) && variant.quantity !== ""} max="9999999" min="0" onChange={(event) => update(index, "quantity", event.target.value)} placeholder="أدخل الكمية بعد الجرد" type="number" value={variant.quantity} /><small>{existingProduct && variant.id && variant.quantity !== "" ? "تُعدّل لاحقاً من صفحة المخزون." : "يُسجل الرصيد فقط عند إدخال كمية مؤكدة."}</small></label>
      {variants.length > 1 ? <button aria-label={"حذف المتغير " + (index + 1)} className="admin-text-button admin-text-danger" onClick={() => setVariants((current) => current.filter((_, row) => row !== index))} type="button">إزالة المتغير</button> : null}
    </fieldset>)}
  </section>;
}
