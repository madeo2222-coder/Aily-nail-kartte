"use client";

import { useState } from "react";

type OrderStatusFormProps = {
  orderId: string;
  defaultStatus?: string | null;
};

const statusOptions = [
  { value: "requested", label: "注文相談中" },
  { value: "payment_waiting", label: "支払待ち" },
  { value: "paid", label: "支払済み" },
  { value: "making", label: "制作中" },
  { value: "shipped", label: "発送済み" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "キャンセル" },
];

function getStatusLabel(status: string | null | undefined) {
  const option = statusOptions.find((item) => item.value === status);
  return option?.label || "未設定";
}

export default function OrderStatusForm({
  orderId,
  defaultStatus,
}: OrderStatusFormProps) {
  const [status, setStatus] = useState(defaultStatus || "requested");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);

    try {
      const response = await fetch(`/api/nail-tip-orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "ステータス更新に失敗しました");
      }

      alert("注文ステータスを更新しました");
      window.location.reload();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "ステータス更新に失敗しました"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="text-lg font-bold text-slate-900">
        注文ステータス変更
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        現在の状態：{getStatusLabel(defaultStatus)}
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            ステータス
          </label>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
          >
            {statusOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "更新中..." : "注文ステータスを更新する"}
        </button>
      </div>
    </section>
  );
}