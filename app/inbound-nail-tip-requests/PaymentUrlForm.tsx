"use client";

import { useState } from "react";

type Props = {
  requestId: string;
  defaultUrl?: string | null;
};

export default function PaymentUrlForm({
  requestId,
  defaultUrl,
}: Props) {
  const [paymentUrl, setPaymentUrl] = useState(defaultUrl || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!paymentUrl.trim()) {
      alert("決済URLを入力してください");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/inbound-nail-tip-requests/${requestId}/payment-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentUrl,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok || !json.ok) {
        alert(json.error || "保存失敗");
        return;
      }

      alert("保存しました");
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border bg-emerald-50 p-4">
      <div className="mb-2 text-sm font-bold text-emerald-700">
        DG決済URL
      </div>

      <input
        value={paymentUrl}
        onChange={(e) => setPaymentUrl(e.target.value)}
        placeholder="https://..."
        className="w-full rounded-xl border bg-white px-3 py-3 text-sm"
      />

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white"
      >
        {saving ? "保存中..." : "決済URL保存"}
      </button>
    </div>
  );
}