"use client";

import { useState } from "react";

type StatusFormProps = {
  requestId: string;
  defaultStatus?: string | null;
};

const statusOptions = [
  { value: "new", label: "新規" },
  { value: "reviewing", label: "確認中" },
  { value: "quoted", label: "見積済み" },
  { value: "payment_waiting", label: "支払待ち" },
  { value: "paid", label: "支払済み" },
  { value: "making", label: "制作中" },
  { value: "shipped", label: "発送済み" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "キャンセル" },
];

export default function StatusForm({
  requestId,
  defaultStatus,
}: StatusFormProps) {
  const [status, setStatus] = useState(defaultStatus || "new");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);

    try {
      const response = await fetch(
        `/api/inbound-nail-tip-requests/${requestId}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "ステータス更新に失敗しました");
      }

      alert("ステータスを更新しました");
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
    <div className="mt-4 rounded-2xl bg-slate-50 p-4">
      <label className="mb-2 block text-sm font-bold text-slate-700">
        ステータス変更
      </label>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
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

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}