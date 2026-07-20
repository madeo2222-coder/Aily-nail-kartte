"use client";

import { useMemo, useState } from "react";

type PaymentHistoryStatus = "processing" | "pending" | "paid" | "failed";

type OrderPaymentFormProps = {
  orderId: string;
  productCode?: string | null;
  productName?: string | null;
  productPrice?: number | null;
  paymentStatus?: string | null;
  defaultPaymentUrl?: string | null;
  defaultTransactionId?: string | null;
  defaultPaymentDueAt?: string | null;
  paidAt?: string | null;
  latestPaymentStatus?: PaymentHistoryStatus | null;
  latestVeriTransOrderId?: string | null;
  paymentHistoryLoadFailed?: boolean;
};

function formatDateTime(value?: string | null) {
  if (!value) return "未登録";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未登録";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getPaymentState(params: {
  paymentStatus?: string | null;
  latestPaymentStatus?: PaymentHistoryStatus | null;
}) {
  if (params.paymentStatus === "paid" || params.latestPaymentStatus === "paid") {
    return { label: "支払済み", className: "bg-emerald-100 text-emerald-700" };
  }

  if (params.latestPaymentStatus === "processing") {
    return { label: "決済処理中", className: "bg-blue-100 text-blue-700" };
  }

  if (params.latestPaymentStatus === "pending") {
    return { label: "結果確認中", className: "bg-amber-100 text-amber-700" };
  }

  if (params.latestPaymentStatus === "failed") {
    return { label: "決済失敗", className: "bg-red-100 text-red-700" };
  }

  if (params.paymentStatus === "payment_waiting") {
    return { label: "支払待ち", className: "bg-purple-100 text-purple-700" };
  }

  return { label: "未生成", className: "bg-slate-100 text-slate-700" };
}

export default function OrderPaymentForm({
  orderId,
  productCode,
  productName,
  productPrice,
  paymentStatus,
  defaultPaymentUrl,
  defaultTransactionId,
  defaultPaymentDueAt,
  paidAt,
  latestPaymentStatus,
  latestVeriTransOrderId,
  paymentHistoryLoadFailed = false,
}: OrderPaymentFormProps) {
  const [generatedPaymentUrl, setGeneratedPaymentUrl] = useState("");
  const [currentPaymentDueAt, setCurrentPaymentDueAt] = useState(
    defaultPaymentDueAt || ""
  );
  const [generatedInThisSession, setGeneratedInThisSession] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isLegacyOrder =
    !productCode ||
    !Number.isInteger(productPrice) ||
    Number(productPrice) <= 0;
  const isPaid =
    paymentStatus === "paid" || latestPaymentStatus === "paid";
  const hasActivePayment =
    latestPaymentStatus === "processing" ||
    latestPaymentStatus === "pending" ||
    latestPaymentStatus === "paid";
  const canGenerate =
    !isLegacyOrder &&
    !isPaid &&
    !hasActivePayment &&
    !paymentHistoryLoadFailed &&
    !generatedInThisSession &&
    !generating;
  const displayedPaymentState = getPaymentState({
    paymentStatus: generatedInThisSession ? "payment_waiting" : paymentStatus,
    latestPaymentStatus: generatedInThisSession ? null : latestPaymentStatus,
  });
  const displayedTransactionId =
    latestVeriTransOrderId || defaultTransactionId || "未登録";

  const customerPaymentMessage = useMemo(() => {
    if (!generatedPaymentUrl) return "";

    return [
      "ネイルチップのご注文ありがとうございます。",
      "",
      "下記URLよりお支払いをお願いいたします。",
      "",
      generatedPaymentUrl,
      "",
      `お支払い期限：${formatDateTime(currentPaymentDueAt)}`,
      "",
      "お支払い確認後、制作を開始いたします。",
      "よろしくお願いいたします。",
    ].join("\n");
  }, [currentPaymentDueAt, generatedPaymentUrl]);

  function showCopyMessage(message: string) {
    setCopyMessage(message);
    window.setTimeout(() => setCopyMessage(""), 2500);
  }

  async function copyText(value: string, successMessage: string) {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      showCopyMessage(successMessage);
    } catch {
      showCopyMessage("コピーに失敗しました");
    }
  }

  async function handleGeneratePaymentUrl() {
    if (!canGenerate) return;

    setGenerating(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/nail-tip-orders/${encodeURIComponent(orderId)}/payment-url`,
        { method: "POST" }
      );
      const responseText = await response.text();
      let data: {
        ok?: boolean;
        paymentUrl?: string;
        paymentDueAt?: string;
        error?: string;
      };

      try {
        data = JSON.parse(responseText) as typeof data;
      } catch {
        throw new Error("決済URL生成で正常な応答を受信できませんでした");
      }

      if (
        !response.ok ||
        !data.ok ||
        !data.paymentUrl ||
        !data.paymentDueAt
      ) {
        throw new Error(data.error || "決済URLを生成できませんでした");
      }

      setGeneratedPaymentUrl(data.paymentUrl);
      setCurrentPaymentDueAt(data.paymentDueAt);
      setGeneratedInThisSession(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "決済URLを生成できませんでした"
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-bold text-slate-900">DGダミー決済</div>
        <div
          className={`rounded-full px-4 py-2 text-sm font-bold ${displayedPaymentState.className}`}
        >
          {displayedPaymentState.label}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-purple-50 p-4">
          <div className="text-xs text-purple-500">商品名</div>
          <div className="mt-1 font-bold text-purple-900">
            {productName || "未登録"}
          </div>
        </div>
        <div className="rounded-2xl bg-amber-50 p-4">
          <div className="text-xs text-amber-600">サーバー確定価格</div>
          <div className="mt-1 font-bold text-amber-900">
            {Number.isInteger(productPrice) && Number(productPrice) > 0
              ? `¥${Number(productPrice).toLocaleString("ja-JP")}`
              : "未登録"}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">支払期限</div>
          <div className="mt-1 font-bold text-slate-900">
            {formatDateTime(currentPaymentDueAt)}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">VeriTrans注文ID</div>
          <div className="mt-1 break-all font-bold text-slate-900">
            {displayedTransactionId}
          </div>
        </div>
        {isPaid ? (
          <div className="rounded-2xl bg-emerald-50 p-4 md:col-span-2">
            <div className="text-xs text-emerald-600">支払完了日時</div>
            <div className="mt-1 font-bold text-emerald-900">
              {formatDateTime(paidAt)}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        安全上、完全な決済URLは生成直後のみ表示されます。紛失した場合は新しい決済URLを再生成してください。
        支払済み、決済処理中、結果確認中の場合は再生成できません。
      </div>

      {isLegacyOrder ? (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
          この注文は旧形式のため、自動決済URLを生成できません。
        </div>
      ) : null}

      {paymentHistoryLoadFailed ? (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
          決済履歴を確認できないため、URL生成を停止しています。
        </div>
      ) : null}

      {latestPaymentStatus === "failed" && !generatedInThisSession ? (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-700">
          前回の決済は失敗しています。現在のRPCでは新しい決済URLを生成できます。
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleGeneratePaymentUrl}
        disabled={!canGenerate}
        className="mt-4 w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generating ? "生成中..." : "DGダミー決済URLを生成"}
      </button>

      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-sm font-bold text-emerald-800">
          生成済み決済URL（完全URL）
        </div>
        <div className="mt-2 break-all rounded-xl bg-white p-3 text-xs leading-5 text-slate-700">
          {generatedPaymentUrl ||
            "この画面を再読込した後は、完全なkey付きURLを復元できません。"}
        </div>
        <button
          type="button"
          onClick={() =>
            copyText(generatedPaymentUrl, "決済URLをコピーしました")
          }
          disabled={!generatedPaymentUrl}
          className="mt-3 w-full rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          決済URLをコピー
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <div className="text-sm font-bold text-slate-900">お客様案内文</div>
        <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-xs leading-6 text-slate-700">
          {customerPaymentMessage ||
            "完全な決済URLを生成した直後に案内文が表示されます。"}
        </pre>
        <button
          type="button"
          onClick={() =>
            copyText(customerPaymentMessage, "お客様案内文をコピーしました")
          }
          disabled={!customerPaymentMessage}
          className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          お客様案内文をコピー
        </button>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4">
        <div className="text-sm font-bold text-slate-900">過去の決済情報</div>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">保存済み決済URL（keyなしの場合があります）</dt>
            <dd className="mt-1 break-all text-slate-800">
              {defaultPaymentUrl || "未登録"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">保存済み取引ID</dt>
            <dd className="mt-1 break-all text-slate-800">
              {defaultTransactionId || "未登録"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">保存済み支払期限</dt>
            <dd className="mt-1 text-slate-800">
              {formatDateTime(defaultPaymentDueAt)}
            </dd>
          </div>
        </dl>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {copyMessage ? (
        <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
          {copyMessage}
        </div>
      ) : null}
    </section>
  );
}
