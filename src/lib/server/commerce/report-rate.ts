/** Per-process limit for local reports; hosted use needs a shared limiter. */
export function createReportRateLimit(limit = 30, windowMs = 60000) {
  const entries = new Map<string, { count: number; until: number }>();
  return (key: string, now = Date.now()) => {
    for (const [id, entry] of entries) if (entry.until <= now) entries.delete(id);
    const current = entries.get(key);
    if (!current) {
      if (entries.size >= 200) return false;
      entries.set(key, { count: 1, until: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count++;
    return true;
  };
}
export const allowReportRequest = createReportRateLimit();
