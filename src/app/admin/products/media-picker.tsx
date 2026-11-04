"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type MediaOption = { id: string; label: string; url?: string | null };

export function MediaPicker({
  assets,
  selected: initialSelected = [],
}: {
  assets: MediaOption[];
  selected?: string[];
}) {
  const [library, setLibrary] = useState(assets);
  const [selected, setSelected] = useState(initialSelected);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0),
    [total, setTotal] = useState<number | null>(null),
    [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MediaOption[]>([]);
  const [libraryError, setLibraryError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setLibraryError("");
      fetch("/api/admin/media?q=" + encodeURIComponent(query) + "&page=" + page, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (r) => {
          if (!r.ok) throw Error("تعذر تحميل المكتبة. أعد المحاولة أو ارفع صورة جديدة.");
          return r.json();
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          setResults(data.assets);
          setTotal(data.total);
          setLibrary((items) => [
            ...new Map([...items, ...data.assets].map((item) => [item.id, item])).values(),
          ]);
          setLoading(false);
        })
        .catch((error) => {
          if (error.name !== "AbortError") {
            setLibraryError("تعذر تحميل مكتبة الصور. تحقق من الاتصال ثم أعد المحاولة.");
            setResults([]);
            setTotal(null);
            setLoading(false);
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, page, retry]);
  const available = results.filter((asset) => !selected.includes(asset.id));

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage("");
    const ids = [...selected];
    try {
      if (ids.length + files.length > 30) throw new Error("اختر حتى 30 صورة للمنتج.");
      for (const file of Array.from(files)) {
        if (
          file.size > 10 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)
        ) {
          throw new Error("الصورة يجب أن تكون JPG أو PNG أو WebP أو AVIF وأقل من 10 ميجابايت.");
        }
        const signing = await fetch("/api/admin/media/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: file.type, size: file.size }),
        });
        if (signing.status === 401 || signing.status === 403)
          throw new Error("لا تملك صلاحية رفع الصور. سجّل الدخول بحساب مسموح له.");
        if (!signing.ok) throw new Error("تخزين الصور غير متاح حالياً. حاول لاحقاً أو تواصل مع المسؤول.");
        const { uploadUrl, key, signedHeaders } = (await signing.json()) as {
          uploadUrl: string;
          key: string;
          signedHeaders: Record<string, string>;
        };
        const uploaded = await fetch(uploadUrl, {
          method: "PUT",
          headers: signedHeaders,
          body: file,
        });
        if (!uploaded.ok) throw new Error("تعذر رفع الصورة إلى مساحة التخزين.");
        const finalize = () => fetch("/api/admin/media/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key,
            size: file.size,
            altAr: file.name.replace(/\.[^.]+$/, "").slice(0, 191),
          }),
        });
        // Retry the same key if the first request lost its response after commit.
        let finalized = await finalize().catch(() => null);
        if (!finalized || finalized.status === 503) finalized = await finalize();
        if (!finalized.ok) {
          const result = (await finalized.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            result.error === "INVALID_IMAGE"
              ? "محتوى الصورة أو حجمها لا يطابق نوع الملف. اختر صورة أصلية بالصيغة الصحيحة."
              : "تعذر تجهيز الصورة للكتالوج. حاول مجدداً.",
          );
        }
        const result = (await finalized.json()) as { id: string; url: string; alt?: string };
        ids.push(result.id);
        setLibrary((items) => [
          ...items.filter((item) => item.id !== result.id),
          { id: result.id, label: result.alt || file.name, url: result.url },
        ]);
        setSelected([...new Set(ids)]);
      }
      setSelected([...new Set(ids)]);
      setMessage("تم رفع الصور وإضافتها إلى القائمة. احفظ المنتج لتثبيت ارتباطها.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر رفع الصورة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-media-picker wide" aria-label="صور المنتج">
      <h3>صور المنتج</h3>
      <p className="admin-muted">
        الصورة الأولى هي الرئيسية. إزالة صورة هنا تفصلها عن المنتج فقط ولا تحذف الأصل.
      </p>
      {selected.length ? (
        <ol className="admin-selected-media" aria-label="الصور المختارة بالترتيب">
          {selected.map((id, index) => {
            const asset = library.find((item) => item.id === id);
            return (
              <li key={id}>
                {asset?.url ? (
                  <Image src={asset.url} alt="" width={72} height={80} unoptimized />
                ) : (
                  <span>صورة مختارة</span>
                )}
                <div>
                  <strong>
                    {index === 0
                      ? "الصورة الرئيسية"
                      : "صورة المعرض " + (index + 1).toLocaleString("ar-EG")}
                  </strong>
                  <span title={asset?.label}>{asset?.label}</span>
                  <div className="admin-row-actions">
                    {index > 0 ? (
                      <button
                        className="admin-button"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setSelected([id, ...selected.filter((value) => value !== id)])
                        }
                      >
                        اجعلها رئيسية
                      </button>
                    ) : null}
                    <button
                      className="admin-button"
                      type="button"
                      disabled={busy}
                      aria-label={"إزالة الصورة من المنتج: " + asset?.label}
                      onClick={() => setSelected(selected.filter((value) => value !== id))}
                    >
                      إزالة
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="admin-muted">لم تُحدد صورة بعد. اختر من المكتبة أو ارفع صورة جديدة.</p>
      )}
      <div className="admin-form-grid">
        <label>
          بحث في مكتبة الصور
          <input
            type="search"
            value={query}
            maxLength={120}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
              setResults([]);
              setLoading(true);
            }}
            placeholder="اسم الصورة"
          />
          <small className="admin-muted">البحث في مكتبة صور المصنع كاملة.</small>
        </label>
        <label>
          رفع صور جديدة
          <input
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={busy}
            multiple
            onChange={(event) => {
              void upload(event.target.files);
              event.target.value = "";
            }}
            type="file"
          />
          <small className="admin-muted">
            حتى ١٠ ميجابايت للصورة و٣٠ صورة للمنتج. تُحفظ الأصول في التخزين الخارجي.
          </small>
        </label>
      </div>
      {libraryError ? (
        <div role="alert" className="admin-error">
          {libraryError}
          <button type="button" className="admin-button" onClick={() => setRetry(retry + 1)}>
            إعادة تحميل المكتبة
          </button>
        </div>
      ) : null}
      <div className="admin-media-library" role="region" aria-label="مكتبة صور المنتج" tabIndex={0}>
        <ul>
          {available.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                disabled={busy || selected.length >= 30}
                aria-label={"اختيار الصورة: " + asset.label}
                onClick={() => setSelected([...selected, asset.id])}
              >
                {asset.url ? (
                  <Image src={asset.url} alt="" width={96} height={90} unoptimized />
                ) : (
                  <span>لا توجد معاينة</span>
                )}
                <span title={asset.label}>{asset.label}</span>
              </button>
            </li>
          ))}
        </ul>
        {!loading && !available.length ? (
          <p className="admin-muted">لا توجد صور أخرى مطابقة. يمكنك رفع صورة جديدة.</p>
        ) : null}
      </div>
      <div className="admin-shortcuts" aria-label="صفحات مكتبة الصور">
        <button
          type="button"
          className="admin-button"
          disabled={loading || page === 0}
          onClick={() => {
            setLoading(true);
            setResults([]);
            setPage(page - 1);
          }}
        >
          الصور السابقة
        </button>
        <button
          type="button"
          className="admin-button"
          disabled={loading || total === null || (page + 1) * 36 >= total}
          onClick={() => {
            setLoading(true);
            setResults([]);
            setPage(page + 1);
          }}
        >
          الصور التالية
        </button>
        <span className="admin-muted" role="status">
          {loading
            ? "جارٍ تحميل الصور…"
            : total === null
              ? "المكتبة غير متاحة"
              : total.toLocaleString("ar-EG") + " صورة مطابقة"}
        </span>
      </div>
      <p className="admin-muted" role="status">
        {selected.length.toLocaleString("ar-EG")} من ٣٠ صورة مختارة
      </p>
      {selected.map((id) => (
        <input key={id} name="mediaIds" type="hidden" value={id} />
      ))}
      {message ? (
        <p aria-live="polite" className={message.startsWith("تم") ? "admin-notice" : "admin-error"}>
          {message}
        </p>
      ) : null}
      {busy ? (
        <p aria-live="polite" className="admin-muted">
          جارٍ رفع الصور وتجهيزها…
        </p>
      ) : null}
    </section>
  );
}
