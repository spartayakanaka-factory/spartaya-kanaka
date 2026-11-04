"use client";

import { useState } from "react";

type DepositMode = "FULL_ADVANCE" | "DEPOSIT";
type DepositType = "PERCENT" | "FIXED_MINOR";

export function DepositFields({
  initialMode,
  initialType,
  initialValue,
}: {
  initialMode: DepositMode;
  initialType: DepositType;
  initialValue: string;
}) {
  const [mode, setMode] = useState(initialMode);
  const [type, setType] = useState(initialType);
  return (
    <>
      <label>
        طريقة الدفعة
        <select
          name="depositMode"
          value={mode}
          onChange={(event) => setMode(event.target.value as DepositMode)}
        >
          <option value="FULL_ADVANCE">دفع كامل مقدماً</option>
          <option value="DEPOSIT">عربون</option>
        </select>
      </label>
      {mode === "DEPOSIT" ? (
        <>
          <label>
            وحدة العربون
            <select
              name="depositType"
              value={type}
              onChange={(event) => setType(event.target.value as DepositType)}
            >
              <option value="PERCENT">نسبة مئوية</option>
              <option value="FIXED_MINOR">مبلغ بالجنيه</option>
            </select>
          </label>
          <label>
            {type === "PERCENT" ? "نسبة العربون (%)" : "مبلغ العربون بالجنيه"}
            <input
              key={type}
              defaultValue={initialMode === "DEPOSIT" && type === initialType ? initialValue : ""}
              inputMode={type === "PERCENT" ? "numeric" : "decimal"}
              min={type === "PERCENT" ? 1 : 0.01}
              max={type === "PERCENT" ? 100 : undefined}
              step={type === "PERCENT" ? 1 : 0.01}
              name="depositValue"
              required
              type="number"
            />
          </label>
        </>
      ) : (
        <>
          <input name="depositType" type="hidden" value={type} />
          <input name="depositValue" type="hidden" value="100" />
        </>
      )}
    </>
  );
}
