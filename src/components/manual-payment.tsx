"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { formatMoneyMinor } from "@/lib/money";
import styles from "./manual-payment.module.css";
type Detail = {
  editable: boolean;
  paymentState: string;
  reference: string | null;
  explanation: string | null;
  evidence: {
    id: string;
    revision: number;
    createdAt: string;
    width: number;
    height: number;
    previewUrl: string;
  }[];
};
export type ManualPayment = {
  id: string;
  state: string;
  method?: string;
  amountMinor: string;
  evidenceRequired?: boolean;
  instructions?: {
    identifier: string;
    recipient: string;
    instructionsAr: string;
    instructionsEn: string;
  } | null;
};
const messages: Record<string, [string, string]> = {
  EVIDENCE_IMAGE_REQUIRED: [
    "اختر صورة JPEG أو PNG أو WebP صالحة.",
    "Choose a valid JPEG, PNG or WebP image.",
  ],
  EVIDENCE_SIZE_LIMIT: ["حجم الصورة المسموح 5 ميجابايت.", "The image limit is 5 MB."],
  INPUT_TOO_LARGE: ["حجم الصورة المسموح 5 ميجابايت.", "The image limit is 5 MB."],
  EVIDENCE_ALREADY_USED: [
    "سبق استخدام هذه الصورة. راجع المصنع لتوضيح التحويل.",
    "This image was already used. Contact the factory to clarify the transfer.",
  ],
  TRANSFER_REFERENCE_ALREADY_USED: [
    "مرجع التحويل مستخدم بالفعل. راجع بيانات الإيصال.",
    "This transfer reference was already used. Check the receipt.",
  ],
  TRANSFER_REFERENCE_LOCKED: [
    "مرجع التحويل مسجّل بالفعل. تواصل مع المصنع لتصحيحه.",
    "The reference is already recorded. Contact the factory to correct it.",
  ],
  EVIDENCE_REVIEW_LOCKED: [
    "الإثبات قيد المراجعة أو تم التحقق منه، ولا يمكن تغييره.",
    "Evidence is under review or verified and cannot be changed.",
  ],
  EVIDENCE_RATE_LIMIT: [
    "انتظر قليلاً قبل إعادة رفع الصورة.",
    "Please wait before uploading again.",
  ],
};
export function ManualPaymentCard({
  payment,
  ar,
  staff = false,
  onChanged,
}: {
  payment: ManualPayment;
  ar: boolean;
  staff?: boolean;
  onChanged?: () => Promise<void>;
}) {
  const t = (a: string, e: string) => (ar ? a : e);
  const [detail, setDetail] = useState<Detail | null>(null),
    [file, setFile] = useState<File | null>(null),
    [reference, setReference] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<string | null>(null);
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  const endpoint =
    "/api/commerce/payment-evidence?paymentId=" + payment.id + (staff ? "&audience=staff" : "");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const r = await fetch(endpoint, { cache: "no-store", signal });
      if (!r.ok) throw Error("EVIDENCE_UNAVAILABLE");
      const result = (await r.json()) as Detail;
      setDetail(result);
      setReference(result.reference || "");
      return result;
    },
    [endpoint],
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error("EVIDENCE_UNAVAILABLE");
        return (await r.json()) as Detail;
      })
      .then((result) => {
        setDetail(result);
        setReference(result.reference || "");
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setMessage(
            ar ? "تعذر تحميل الإثبات. حاول تحديثه." : "Unable to load evidence. Try refreshing.",
          );
      });
    return () => controller.abort();
  }, [endpoint, ar, payment.state]);
  return (
    <section
      className={styles.card}
      aria-label={t("إثبات التحويل الخاص", "Private transfer evidence")}
    >
      {payment.instructions && !staff ? (
        <>
          <h3>{t("تعليمات التحويل", "Transfer instructions")}</h3>
          <dl className="commerce-totals">
            <div>
              <dt>{t("المبلغ المطلوب", "Required amount")}</dt>
              <dd>{formatMoneyMinor(Number(payment.amountMinor), ar ? "ar" : "en", "EGP")}</dd>
            </div>
            <div>
              <dt>{t("المستلم", "Recipient")}</dt>
              <dd>{payment.instructions.recipient}</dd>
            </div>
            <div>
              <dt>{payment.method === "INSTAPAY" ? "InstaPay" : t("المحفظة", "Wallet")}</dt>
              <dd>
                <bdi>{payment.instructions.identifier}</bdi>
              </dd>
            </div>
          </dl>
          <p className="preserve-lines">
            {ar ? payment.instructions.instructionsAr : payment.instructions.instructionsEn}
          </p>
        </>
      ) : null}
      <h3>{t("إثبات التحويل", "Transfer evidence")}</h3>
      <p>
        {payment.state === "SUCCEEDED"
          ? t(
              "تمت مطابقة هذه الدفعة بواسطة الفريق المخوّل.",
              "This payment has been reconciled by authorized staff.",
            )
          : t(
              "تظل الدفعة غير متحققة حتى مطابقة التحويل في حساب الاستلام بواسطة مسؤول مخوّل.",
              "Payment remains unverified until authorized staff reconcile the receiving account.",
            )}
      </p>
      {detail?.explanation ? (
        <p role="note">{t("سبب الرفض: ", "Rejection reason: ") + detail.explanation}</p>
      ) : null}
      {detail?.evidence.length ? (
        <div>
          <p>
            {t("تم استلام الإثبات — النسخة ", "Evidence received — revision ") +
              detail.evidence[0].revision}
          </p>
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={async () => {
              try {
                const latest = await load();
                setPreview(preview ? null : latest.evidence[0]?.id || null);
              } catch {
                setMessage(
                  t(
                    "تعذر فتح الإثبات. حدّث الصفحة وحاول مجدداً.",
                    "Unable to open evidence. Refresh and retry.",
                  ),
                );
              }
            }}
          >
            {preview
              ? t("إخفاء الصورة", "Hide image")
              : t("عرض الصورة الخاصة", "View private image")}
          </button>
          {preview
            ? detail.evidence
                .filter((e) => e.id === preview)
                .map((e) => (
                  <Image
                    key={e.id}
                    src={e.previewUrl}
                    alt={t("إثبات تحويل خاص", "Private transfer receipt")}
                    width={e.width}
                    height={e.height}
                    unoptimized
                    className={styles.image}
                    referrerPolicy="no-referrer"
                  />
                ))
            : null}
          {detail.evidence.length > 1 ? (
            <details>
              <summary>{t("سجل النسخ السابقة", "Previous revisions")}</summary>
              {detail.evidence.slice(1).map((e) => (
                <p key={e.id}>
                  {t("نسخة ", "Revision ") + e.revision} ·{" "}
                  {new Date(e.createdAt).toLocaleString(ar ? "ar-EG" : "en-GB")}
                </p>
              ))}
            </details>
          ) : null}
        </div>
      ) : (
        <p>{t("لم تُرفع صورة للتحويل بعد.", "No transfer image has been submitted yet.")}</p>
      )}
      {!staff && detail?.editable ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setBusy(true);
            setMessage("");
            try {
              if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
                throw Error("EVIDENCE_IMAGE_REQUIRED");
              if (file.size > 5 * 1024 * 1024) throw Error("EVIDENCE_SIZE_LIMIT");
              const fingerprint = [file.name, file.size, file.lastModified, reference].join(":");
              if (submission.current?.fingerprint !== fingerprint)
                submission.current = { fingerprint, key: crypto.randomUUID() };
              const result = await fetch(endpoint, {
                method: "POST",
                headers: {
                  "Content-Type": file.type,
                  "Idempotency-Key": submission.current.key,
                  ...(reference.trim() ? { "X-Transfer-Reference": reference.trim() } : {}),
                },
                body: file,
              });
              if (!result.ok) throw Error((await result.json()).error);
              await load();
              await onChanged?.();
              setPreview(null);
              setMessage(
                t(
                  "تم رفع الصورة للمراجعة. لم تُسجّل دفعة بعد.",
                  "Image submitted for review. No payment has been credited.",
                ),
              );
            } catch (error) {
              const code = (error as Error).message;
              setMessage(
                messages[code]?.[ar ? 0 : 1] ||
                  t(
                    "تعذر الرفع. الصورة السابقة محفوظة؛ حاول مجدداً.",
                    "Upload failed. Any previous image is preserved; please retry.",
                  ),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t("مرجع التحويل (اختياري عند توفره)", "Transfer reference (optional if available)")}
            <input
              name="transferReference"
              dir="ltr"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={Boolean(detail.reference)}
              minLength={8}
              maxLength={96}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label>
            {t("صورة الإيصال — حتى 5 ميجابايت", "Receipt image — up to 5 MB")}
            <input
              name="receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <p>
            {t(
              "الصورة خاصة. أخفِ الأرصدة والبيانات غير اللازمة قبل رفعها.",
              "The image is private. Hide balances and unnecessary details before uploading.",
            )}
          </p>
          <button className="button" disabled={busy}>
            {busy
              ? t("جارٍ رفع الصورة…", "Uploading image…")
              : detail.evidence.length
                ? t("رفع صورة بديلة", "Upload replacement")
                : t("إرسال الإثبات للمراجعة", "Submit evidence for review")}
          </button>
        </form>
      ) : !staff && detail ? (
        <p>
          {t(
            "الصورة مقفلة أثناء المراجعة وبعد التحقق من الدفع.",
            "Evidence is locked during review and after payment verification.",
          )}
        </p>
      ) : null}
      <p role="status">{message}</p>
    </section>
  );
}
