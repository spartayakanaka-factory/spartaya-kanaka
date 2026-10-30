"use client";
import { useCallback, useEffect, useState } from "react";
type Data = {
  customers: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    banned: boolean;
    emailVerified: boolean;
  }[];
  total: number;
  page: number;
};
export function CustomerAccessPanel() {
  const [data, setData] = useState<Data | null>(null),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const r = await fetch("/api/admin/commerce?resource=customers&page=" + page, {
        cache: "no-store",
        signal,
      });
      if (!r.ok) throw Error("تعذر تحميل الحسابات. راجع صلاحية المالك.");
      setData(await r.json());
    },
    [page],
  );
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/admin/commerce?resource=customers&page=" + page, {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error("Unable to load customer accounts");
        return (await r.json()) as Data;
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setMessage(e.message);
      });
    return () => c.abort();
  }, [page]);
  return (
    <>
      <p className="admin-notice">
        الإيقاف ينهي جلسات الحساب ويمنع دخوله مجدداً. لا يحذف الطلبات أو البيانات، ولا ينشئ قائمة
        حظر لأرقام الهواتف أو طلبات الضيوف.
      </p>
      <p role="status">{message}</p>
      <section className="admin-panel">
        <h2>الحسابات المسجلة</h2>
        {data ? (
          <>
            <p>
              {data.total} حساباً · الصفحة {page + 1}
            </p>
            <div className="factory-customer-list">
              {data.customers.map((c) => (
                <article key={c.id}>
                  <header>
                    <h3>{c.name}</h3>
                    <strong>{c.banned ? "الوصول موقوف" : "حساب متاح"}</strong>
                  </header>
                  <address>
                    <bdi>{c.email}</bdi>
                    {c.phone ? (
                      <p>
                        <a href={"tel:" + c.phone}>
                          <bdi>{c.phone}</bdi>
                        </a>
                      </p>
                    ) : null}
                  </address>
                  <p>{c.emailVerified ? "البريد متحقق" : "البريد لم يُتحقق بعد"}</p>
                  <form
                    className="admin-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget,
                        f = new FormData(form);
                      if (
                        !window.confirm(
                          c.banned
                            ? "إعادة السماح لهذا الحساب بالدخول؟"
                            : "إيقاف الحساب وإنهاء جلساته؟",
                        )
                      )
                        return;
                      setBusy(true);
                      setMessage("");
                      try {
                        const r = await fetch("/api/admin/commerce", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            action: "customerAccess",
                            userId: c.id,
                            banned: !c.banned,
                            reason: f.get("reason"),
                            key: crypto.randomUUID(),
                          }),
                        });
                        if (!r.ok) throw Error("تعذر تعديل الوصول. حدّث الصفحة وراجع الصلاحية.");
                        await load();
                        form.reset();
                        setMessage("تم تحديث الوصول وتسجيل السبب في سجل المراجعة.");
                      } catch (e) {
                        setMessage((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label>
                      سبب موثق
                      <textarea name="reason" required minLength={8} maxLength={500} />
                    </label>
                    <button className="admin-button admin-button-secondary" disabled={busy}>
                      {c.banned ? "استعادة وصول الحساب" : "إيقاف وصول الحساب"}
                    </button>
                  </form>
                </article>
              ))}
            </div>
            {!data.customers.length ? (
              <p>لا توجد حسابات مسجلة بعد. طلبات الضيوف تظهر في الطلبات.</p>
            ) : null}
            <div className="admin-shortcuts">
              <button
                className="admin-button admin-button-secondary"
                disabled={page === 0 || busy}
                onClick={() => setPage(page - 1)}
              >
                السابق
              </button>
              <button
                className="admin-button admin-button-secondary"
                disabled={(page + 1) * 30 >= data.total || busy}
                onClick={() => setPage(page + 1)}
              >
                التالي
              </button>
            </div>
          </>
        ) : (
          <p>جارٍ تحميل الحسابات…</p>
        )}
      </section>
    </>
  );
}
