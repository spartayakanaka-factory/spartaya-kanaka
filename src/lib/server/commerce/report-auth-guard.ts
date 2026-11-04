/** Bound pending authentication lookups during a database outage. Never grant access on timeout. */
export function createReportAuthGuard(limit = 8, timeoutMs = 5000) {
  let pending = 0;
  return async function guard<T>(
    load: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    if (pending >= limit) return { ok: false };
    pending++;
    const operation = Promise.resolve()
      .then(load)
      .finally(() => {
        pending--;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation.then((value) => ({ ok: true as const, value })),
        new Promise<{ ok: false }>((resolve) => {
          timer = setTimeout(() => resolve({ ok: false }), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
export const reportAuthGuard = createReportAuthGuard();
export const reportDatabaseGuard = createReportAuthGuard();
