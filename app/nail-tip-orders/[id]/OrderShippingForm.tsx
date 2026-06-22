"use client";

import { useState } from "react";

type OrderShippingFormProps = {
  orderId: string;
  defaultShippingCompany?: string | null;
  defaultTrackingNumber?: string | null;
  defaultShippedAt?: string | null;
};

function toDisplayDateTime(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}/${month}/${day} ${hour}:${minute}`;
}

export default function OrderShippingForm({
  orderId,
  defaultShippingCompany,
  defaultTrackingNumber,
  defaultShippedAt,
}: OrderShippingFormProps) {
  const [shippingCompany, setShippingCompany] = useState(
    defaultShippingCompany || ""
  );
  const [trackingNumber, setTrackingNumber] = useState(
    defaultTrackingNumber || ""
  );
  const [shippedAt, setShippedAt] = useState(toDisplayDateTime(defaultShippedAt));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);

    try {
      const response = await fetch(`/api/nail-tip-orders/${orderId}/shipping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shippingCompany,
          trackingNumber,
          shippedAt,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "発送情報の保存に失敗しました");
      }

      alert(data.message || "発送情報を保存しました");
      window.location.reload();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "発送情報の保存に失敗しました"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="text-lg font-bold text-slate-900">発送情報</div>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        発送会社・追跡番号を保存すると、注文ステータスを発送済みに変更し、お客様へLINE通知します。
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            配送会社
          </label>
          <input
            value={shippingCompany}
            onChange={(event) => setShippingCompany(event.target.value)}
            placeholder="ヤマト運輸 / 佐川急便 / 日本郵便"
            className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            追跡番号
          </label>
          <input
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            placeholder="追跡番号を入力"
            className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            発送日時
          </label>
          <input
            type="text"
            value={shippedAt}
            onChange={(event) => setShippedAt(event.target.value)}
            placeholder="2026/06/23 01:28"
            className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "保存中..." : "発送情報を保存してLINE通知する"}
        </button>
      </div>
    </section>
  );
}