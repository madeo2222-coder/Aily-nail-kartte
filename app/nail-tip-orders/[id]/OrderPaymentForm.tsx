"use client";

import { useMemo, useState } from "react";

type OrderPaymentFormProps = {
  orderId: string;
  defaultPaymentUrl?: string | null;
  defaultTransactionId?: string | null;
  defaultPaymentDueAt?: string | null;
};

function formatDueDate(value: string) {
  if (!value) return "期限の記載なし";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "期限の記載なし";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isValidPaymentUrl(value: string) {
  if (!value.trim()) return false;

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

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
  const [copyMessage, setCopyMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const trimmedPaymentUrl = paymentUrl.trim();
  const canUsePaymentUrl = isValidPaymentUrl(trimmedPaymentUrl);

  const customerPaymentMessage = useMemo(() => {
    return [
      "ネイルチップのご注文ありがとうございます。",
      "",
      "下記URLよりお支払いをお願いいたします。",
      "",
      canUsePaymentUrl ? trimmedPaymentUrl : "【決済URL未作成】",
      "",
      `お支払い期限：${formatDueDate(paymentDueAt)}`,
      "",
      "お支払い確認後、制作を開始いたします。",
      "よろしくお願いいたします。",
    ].join("\n");
  }, [canUsePaymentUrl, trimmedPaymentUrl, paymentDueAt]);

  async function handleSave() {
    setErrorMessage("");

    if (!canUsePaymentUrl) {
      setErrorMessage(
        "決済URLは https:// または http:// から始まるURLを入力してください"
      );
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/nail-tip-orders/${orderId}/payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentUrl: trimmedPaymentUrl,
          transactionId: transactionId.trim(),
          paymentDueAt: paymentDueAt
            ? new Date(paymentDueAt).toISOString()
            : null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "決済情報の保存に失敗しました");
      }

      alert("決済情報を保存しました");
      window.location.reload();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "決済情報の保存に失敗しました"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyMessage() {
    try {
      await navigator.clipboard.writeText(customerPaymentMessage);
      setCopyMessage("お客様案内文をコピーしました");
      window.setTimeout(() => setCopyMessage(""), 2500);
    } catch {
      setCopyMessage("コピーに失敗しました");
      window.setTimeout(() => setCopyMessage(""), 2500);
    }
  }

  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="text-lg font-bold text-slate-900">DG決済リンク</div>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        まずはDG決済URL・取引ID・支払期限を注文に保存します。
        次の工程で、この部分をDG Unified APIによる自動作成に切り替えます。
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            決済URL
          </label>
          <input
            value={paymentUrl}
            onChange={(e) => {
              setPaymentUrl(e.target.value);
              setErrorMessage("");
            }}
            placeholder="https://..."
            className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
          />

          {trimmedPaymentUrl && !canUsePaymentUrl ? (
            <div className="mt-2 rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold leading-5 text-red-700">
              決済URLは https:// または http:// から始まるURLを入力してください。
            </div>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-slate-700">
            取引ID
          </label>
          <input
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="paymentId または orderId"
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

        {canUsePaymentUrl ? (
          <a
            href={trimmedPaymentUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-center text-sm font-bold text-purple-700"
          >
            決済URLを開く
          </a>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !canUsePaymentUrl}
          className="w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "保存中..." : "決済情報を保存する"}
        </button>

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-sm font-bold text-slate-900">お客様案内文</div>

          <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-xs leading-6 text-slate-700">
            {customerPaymentMessage}
          </pre>

          <button
            type="button"
            onClick={handleCopyMessage}
            className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
          >
            お客様案内文をコピー
          </button>

          {copyMessage ? (
            <div className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
              {copyMessage}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}