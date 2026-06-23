"use client";

import { useState } from "react";

type Props = {
  requestId: string;
  defaultShippingCompany?: string | null;
  defaultTrackingNumber?: string | null;
};

export default function ShippingForm({
  requestId,
  defaultShippingCompany,
  defaultTrackingNumber,
}: Props) {
  const [shippingCompany, setShippingCompany] = useState(
    defaultShippingCompany || ""
  );
  const [trackingNumber, setTrackingNumber] = useState(
    defaultTrackingNumber || ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!shippingCompany.trim()) {
      alert("配送会社を入力してください");
      return;
    }

    if (!trackingNumber.trim()) {
      alert("追跡番号を入力してください");
      return;
    }

    const ok = confirm("発送済みに更新しますか？");
    if (!ok) return;

    setSaving(true);

    try {
      const response = await fetch(
        `/api/inbound-nail-tip-requests/${requestId}/shipping`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shippingCompany,
            trackingNumber,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        alert(data.error || "発送情報の保存に失敗しました");
        return;
      }

      alert("発送情報を保存しました");
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border bg-blue-50 p-4">
      <div className="mb-2 text-sm font-bold text-blue-700">発送情報</div>

      <div className="space-y-3">
        <input
          value={shippingCompany}
          onChange={(event) => setShippingCompany(event.target.value)}
          placeholder="配送会社（EMS / DHL / FedEx / 日本郵便など）"
          className="w-full rounded-xl border bg-white px-3 py-3 text-sm"
        />

        <input
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value)}
          placeholder="追跡番号"
          className="w-full rounded-xl border bg-white px-3 py-3 text-sm"
        />

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-60"
        >
          {saving ? "保存中..." : "発送情報を保存して発送済みにする"}
        </button>
      </div>
    </div>
  );
}