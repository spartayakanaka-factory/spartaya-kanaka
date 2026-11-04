"use client";
import { useState } from "react";
import { decimalFromMinor } from "@/lib/money";
import { parsePriceMinor } from "@/lib/admin/price";
type Submit = (body: unknown) => Promise<boolean>;
type Rate = {
  id: string;
  region: string;
  city?: string;
  area?: string;
  carrier: string;
  feeMinor: string;
  codFeeMinor?: string | null;
  codMaximumMinor?: string | null;
  enabled: boolean;
  codEnabled?: boolean;
  leadDays?: number;
  version?: number;
};
export function FactoryPaymentSettings({
  configuration,
  version,
  submit,
  busy,
  owner,
}: {
  configuration: Record<string, unknown>;
  version: number;
  submit: Submit;
  busy: boolean;
  owner: boolean;
}) {
  const methods = (configuration.manualInstructions || {}) as Record<
    string,
    {
      enabled: boolean;
      identifier: string;
      recipient: string;
      instructionsAr: string;
      instructionsEn: string;
    }
  >;
  return (
    <section className="admin-panel">
      <h2>المحافظ وInstaPay</h2>
      <p>
        تعليمات واضحة للعميل، ثم مراجعة التحويل في حساب الاستلام. الاختبار المحلي لا يرسل أموالاً
        ولا يطابق الحساب تلقائياً.
      </p>
      {(["WALLET", "INSTAPAY"] as const).map((method) => {
        const value = methods[method];
        return (
          <form
            key={method + version}
            className="admin-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await submit({
                action: "policy",
                version,
                configuration: {
                  ...configuration,
                  manualInstructions: {
                    ...methods,
                    [method]: {
                      enabled: f.get("enabled") === "on",
                      identifier: String(f.get("identifier") || ""),
                      recipient: String(f.get("recipient") || ""),
                      instructionsAr: String(f.get("instructionsAr") || ""),
                      instructionsEn: String(f.get("instructionsEn") || ""),
                    },
                  },
                },
              });
            }}
          >
            <h3>{method === "WALLET" ? "المحفظة المحمولة" : "InstaPay"}</h3>
            <fieldset disabled={!owner || busy}>
              <legend>بيانات الاستلام المعروضة للعميل</legend>
              <label>
                <input type="checkbox" name="enabled" defaultChecked={value?.enabled || false} />{" "}
                إتاحة الطريقة بعد اكتمال تعليماتها
              </label>
              <label>
                رقم المحفظة أو معرّف التحويل
                <input
                  name="identifier"
                  dir="ltr"
                  spellCheck={false}
                  autoComplete="off"
                  defaultValue={value?.identifier || ""}
                  maxLength={191}
                />
              </label>
              <label>
                اسم المستلم
                <input
                  name="recipient"
                  autoComplete="off"
                  defaultValue={value?.recipient || ""}
                  maxLength={120}
                />
              </label>
              <label>
                التعليمات بالعربية
                <textarea
                  name="instructionsAr"
                  defaultValue={value?.instructionsAr || ""}
                  maxLength={1000}
                  rows={3}
                />
              </label>
              <label>
                Instructions in English
                <textarea
                  name="instructionsEn"
                  dir="ltr"
                  defaultValue={value?.instructionsEn || ""}
                  maxLength={1000}
                  rows={3}
                />
              </label>
            </fieldset>
            {owner ? (
              <button className="admin-button" disabled={busy}>
                حفظ تعليمات {method === "WALLET" ? "المحفظة" : "InstaPay"}
              </button>
            ) : (
              <p>تعديل بيانات الاستلام متاح للمالك فقط.</p>
            )}
          </form>
        );
      })}
    </section>
  );
}
export function FactoryShippingSettings({
  rates,
  submit,
  busy,
  owner,
}: {
  rates: Rate[];
  submit: Submit;
  busy: boolean;
  owner: boolean;
}) {
  const [selected, setSelected] = useState("");
  const current = rates.find((r) => r.id === selected);
  return (
    <section className="admin-panel">
      <h2>التوصيل والدفع عند الاستلام</h2>
      <p>
        كل منطقة تحتاج رسوماً محددة. إتاحة الدفع عند الاستلام تتطلب سقفاً ورسوم تحصيل، وتظل للقطع
        الجاهزة فقط.
      </p>
      <label className="admin-form">
        المنطقة المراد تعديلها
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">إضافة منطقة جديدة</option>
          {rates.map((r) => (
            <option key={r.id} value={r.id}>
              {[r.region, r.city, r.area, r.carrier].filter(Boolean).join(" · ")} —{" "}
              {r.enabled ? "متاحة" : "معطلة"}
            </option>
          ))}
        </select>
      </label>
      <form
        className="admin-form"
        key={selected + ":" + (current?.version || 0)}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const amount = (name: string) => {
            const value = String(f.get(name) || "").trim();
            return value ? String(parsePriceMinor(value)) : null;
          };
          try {
            const cod = f.get("codEnabled") === "on";
            const ok = await submit({
              action: "rate",
              ...(current ? { id: current.id, version: current.version } : {}),
              country: "EG",
              currency: "EGP",
              region: f.get("region"),
              city: f.get("city"),
              area: f.get("area"),
              carrier: f.get("carrier"),
              feeMinor: amount("feeMinor"),
              leadDays: Number(f.get("leadDays")),
              enabled: f.get("enabled") === "on",
              codEnabled: cod,
              codFeeMinor: amount("codFeeMinor"),
              codMaximumMinor: amount("codMaximumMinor"),
            });
            if (ok) setSelected("");
          } catch {
            (form.elements.namedItem("feeMinor") as HTMLInputElement)?.setCustomValidity(
              "أدخل مبلغاً صحيحاً بالجنيه، دون قيم سالبة.",
            );
            form.reportValidity();
          }
        }}
      >
        <fieldset disabled={!owner || busy}>
          <legend>{current ? "تعديل خدمة التوصيل" : "بيانات خدمة جديدة"}</legend>
          <label>
            المحافظة
            <input name="region" required maxLength={96} defaultValue={current?.region || ""} />
          </label>
          <label>
            المدينة — فارغة لخدمة المحافظة كلها
            <input name="city" maxLength={96} defaultValue={current?.city || ""} />
          </label>
          <label>
            الحي / منطقة التسليم (اختياري)
            <input name="area" maxLength={96} defaultValue={current?.area || ""} />
          </label>
          <label>
            شركة أو خدمة التوصيل
            <input name="carrier" required maxLength={96} defaultValue={current?.carrier || ""} />
          </label>
          <label>
            رسوم التوصيل بالجنيه
            <input
              name="feeMinor"
              inputMode="decimal"
              required
              defaultValue={current ? decimalFromMinor(Number(current.feeMinor)) : ""}
              onInput={(e) => e.currentTarget.setCustomValidity("")}
            />
          </label>
          <label>
            مدة التوصيل بالأيام — حسب الخدمة
            <input
              name="leadDays"
              type="number"
              min={1}
              max={365}
              required
              defaultValue={current?.leadDays || ""}
            />
          </label>
          <label>
            <input name="enabled" type="checkbox" defaultChecked={current?.enabled || false} /> خدمة
            التوصيل متاحة
          </label>
          <label>
            <input
              name="codEnabled"
              type="checkbox"
              defaultChecked={current?.codEnabled || false}
            />{" "}
            السماح بالدفع عند الاستلام للجاهز
          </label>
          <label>
            رسوم التحصيل بالجنيه — مطلوبة عند الإتاحة
            <input
              name="codFeeMinor"
              inputMode="decimal"
              defaultValue={
                current?.codFeeMinor != null ? decimalFromMinor(Number(current.codFeeMinor)) : ""
              }
            />
          </label>
          <label>
            الحد الأقصى للطلب بالجنيه — مطلوب عند الإتاحة
            <input
              name="codMaximumMinor"
              inputMode="decimal"
              defaultValue={
                current?.codMaximumMinor != null
                  ? decimalFromMinor(Number(current.codMaximumMinor))
                  : ""
              }
            />
          </label>
        </fieldset>
        {owner ? (
          <button className="admin-button" disabled={busy}>
            {current ? "حفظ خدمة التوصيل" : "إضافة الخدمة"}
          </button>
        ) : (
          <p>تعديل التوصيل متاح للمالك فقط.</p>
        )}
      </form>
    </section>
  );
}
