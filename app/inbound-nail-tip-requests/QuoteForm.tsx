"use client";

import { useState } from "react";

type Props = {
  requestId: string;
  defaultAmount?: number | null;
};

export default function QuoteForm({
  requestId,
  defaultAmount,
}: Props) {
  const [amount, setAmount] = useState(
    defaultAmount ? String(defaultAmount) : ""
  );

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);

    try {
      const response = await fetch(
        `/api/inbound-nail-tip-requests/${requestId}/quote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            quoteAmount: Number(amount),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "保存失敗");
      }

      alert("見積金額を保存しました");
      window.location.reload();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "保存失敗"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-amber-50 p-4">
      <div className="mb-2 text-sm font-bold text-amber-800">
        見積金額
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="18000"
          className="flex-1 rounded-xl border px-3 py-2"
        />

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}