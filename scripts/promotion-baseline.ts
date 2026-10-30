/** Select an explicitly reviewed historical baseline; never infer an unknown ledger. */
export function promotionBaseline(value: string) {
  const baseline = value || "phase2";
  if (baseline !== "phase2" && baseline !== "phase3") throw Error("Unknown promotion baseline");
  return { baseline, migrationCount: baseline === "phase3" ? 4 : 2 } as const;
}
