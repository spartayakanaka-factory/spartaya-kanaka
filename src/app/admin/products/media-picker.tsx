"use client";

import { useState } from "react";

type MediaOption = { id: string; label: string; url?: string | null };

export function MediaPicker({ assets, selected: initialSelected = [] }: { assets: MediaOption[]; selected?: string[] }) {
  const [library, setLibrary] = useState(assets);
  const [selected, setSelected] = useState(initialSelected);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const available = library.filter((asset) => !selected.includes(asset.id));

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage("");
    const ids = [...selected];
    try {
      if (ids.length + files.length > 30) throw new Error("اختر حتى 30 صورة للمنتج.");
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
          throw new Error("الصورة يجب أن تكون JPG أو PNG أو WebP أو AVIF وأقل من 10 ميجابايت.");
        }
        const signing = await fetch("/api/admin/media/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: file.type, size: file.size }),
        });
        if (!signing.ok) throw new Error("تخزين الصور غير متاح في هذه البيئة.");
        const { uploadUrl, key, signedHeaders } = await signing.json() as { uploadUrl: string; key: string; signedHeaders: Record<string, string> };
        const uploaded = await fetch(uploadUrl, { method: "PUT", headers: signedHeaders, body: file });
        if (!uploaded.ok) throw new Error("تعذر رفع الصورة إلى مساحة التخزين.");
        const finalized = await fetch("/api/admin/media/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, size: file.size, altAr: file.name.replace(/\.[^.]+$/, "") }),
        });
        if (!finalized.ok) {
          const result = await finalized.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error === "INVALID_IMAGE" ? "محتوى الصورة أو حجمها لا يطابق نوع الملف. اختر صورة أصلية بالصيغة الصحيحة." : "تعذر تجهيز الصورة للكتالوج. حاول مجدداً.");
        }
        const result = await finalized.json() as { id: string; url: string; alt?: string };
        ids.push(result.id);
        setLibrary((items) => [...items.filter((item) => item.id !== result.id), { id: result.id, label: result.alt || file.name, url: result.url }]);
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

  return <div className="admin-media-picker wide">
    <div className="admin-form-grid">
      <label>اختر صور المنتج من مكتبة الوسائط<select multiple onChange={(event) => setSelected(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))} size={Math.max(3, Math.min(6, available.length + selected.length))} value={selected}>
        {[...selected.map((id) => library.find((asset) => asset.id === id)).filter((asset): asset is MediaOption => Boolean(asset)), ...available].map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
      </select><small className="admin-muted">ترتيب الاختيار يحدد الصورة الرئيسية ثم صور المعرض.</small></label>
      <label>رفع صور جديدة<input accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} multiple onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} type="file" /><small className="admin-muted">حتى 10 ميجابايت لكل صورة. تحفظ النسخة الأصلية في التخزين الخارجي.</small></label>
    </div>
    {selected.map((id) => <input key={id} name="mediaIds" type="hidden" value={id} />)}
    {message ? <p aria-live="polite" className={message.startsWith("تم") ? "admin-notice" : "admin-error"}>{message}</p> : null}
    {busy ? <p aria-live="polite" className="admin-muted">جارٍ رفع الصور وتجهيزها…</p> : null}
  </div>;
}
