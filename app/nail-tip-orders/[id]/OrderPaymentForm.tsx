"use client";

import { useState } from "react";

type OrderPaymentFormProps = {
  orderId: string;
  defaultPaymentUrl?: string | null;
  defaultTransactionId?: string | null;
  defaultPaymentDueAt?: string | null;
};

export default function OrderPaymentForm({
  orderId,
  defaultPaymentUrl,
  defaultTransactionId,
  defaultPaymentDueAt,
}: OrderPaymentFormProps) {
  const [paymentUrl, setPaymentUrl] = useState(defaultPaymentUrl || "");
  const [transactionId, setTransactionId] = useState(defaultTransactionId || "");
  const [paymentDueAt, setPaymentDueAt] = useState(
    defaultPaymentDueAt ? defaultPaymentDueAt.slice(0, 16) : ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);

    try {
      const res = await fetch(`/api/nail-tip-orders/${orderId}/payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentUrl,
          transactionId,
          paymentDueAt: paymentDueAt ? new Date(paymentDueAt).toISOString() : null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "決済情報の保存に失敗しました");
      }

      alert("決済情報を保存しました");
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "決済情報の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="text-lg font-bold text-slate-900">
        DG決済リンク
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        MAPで作成した決済URLを貼り付けて保存します。
        保存後、この注文は支払待ちになります。
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            決済URL
          </label>
          <input
            value={paymentUrl}
            onChange={(e) => setPaymentUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            取引ID・管理番号
          </label>
          <input
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="DG管理番号など"
            className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            支払期限
          </label>
          <input
            type="datetime-local"
            value={paymentDueAt}
            onChange={(e) => setPaymentDueAt(e.target.value)}
            className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
          />
        </div>

        {paymentUrl ? (
          <a
            href={paymentUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-center text-sm font-bold text-purple-700"
          >
            決済URLを開く
          </a>
        ) : null}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "保存中..." : "決済情報を保存する"}
        </button>
      </div>
    </section>
  );
}