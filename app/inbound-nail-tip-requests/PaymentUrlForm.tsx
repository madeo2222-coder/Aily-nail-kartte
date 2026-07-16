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
  const [processing, setProcessing] = useState(false);

  async function readJsonSafely(response: Response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function handleGenerateAndSend() {
    const ok = confirm(
      paymentUrl
        ? "DG決済URLを再生成して、見積メールを送信しますか？"
        : "DG決済URLを生成して、見積メールを送信しますか？"
    );

    if (!ok) return;

    setProcessing(true);

    try {
      const generateResponse = await fetch(
        `/api/inbound-nail-tip-requests/${requestId}/payment-url`,
        {
          method: "POST",
        }
      );

      const generateJson = await readJsonSafely(generateResponse);

      if (!generateResponse.ok || !generateJson?.ok) {
        alert(generateJson?.error || "DG決済URLの生成に失敗しました");
        return;
      }

      const generatedPaymentUrl = String(
        generateJson.paymentUrl || ""
      ).trim();

      if (!generatedPaymentUrl) {
        alert("生成された決済URLを取得できませんでした");
        return;
      }

      setPaymentUrl(generatedPaymentUrl);

      const sendResponse = await fetch(
        `/api/inbound-nail-tip-requests/${requestId}/send-quote`,
        {
          method: "POST",
        }
      );

      const sendJson = await readJsonSafely(sendResponse);

      if (!sendResponse.ok || !sendJson?.ok) {
        alert(
          `決済URLは生成されましたが、見積メール送信に失敗しました。\n\n${
            sendJson?.error || "送信失敗"
          }`
        );
        window.location.reload();
        return;
      }

      alert("DG決済URLを生成し、見積メールを送信しました");
      window.location.reload();
    } catch (error) {
      console.error("DG決済URL生成・見積メール送信エラー:", error);

      alert(
        error instanceof Error
          ? error.message
          : "DG決済URL生成・見積メール送信に失敗しました"
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleCopy() {
    if (!paymentUrl) {
      alert("まだDG決済URLが生成されていません");
      return;
    }

    try {
      await navigator.clipboard.writeText(paymentUrl);
      alert("DG決済URLをコピーしました");
    } catch {
      alert("コピーできませんでした");
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="text-sm font-bold text-emerald-700">
        DG決済URL
      </div>

      <p className="mt-2 text-sm leading-6 text-emerald-950">
        見積金額を確認後、決済ページのURLを自動生成してお客様へ見積メールを送信します。
      </p>

      {paymentUrl ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3">
          <div className="text-xs font-bold text-emerald-700">
            生成済みURL
          </div>

          <a
            href={paymentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block break-all text-sm font-bold text-emerald-900 underline"
          >
            {paymentUrl}
          </a>

          <button
            type="button"
            onClick={handleCopy}
            disabled={processing}
            className="mt-3 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            URLをコピー
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-slate-500">
          決済URLはまだ生成されていません。
        </div>
      )}

      <button
        type="button"
        onClick={handleGenerateAndSend}
        disabled={processing}
        className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {processing
          ? "URL生成・メール送信中..."
          : paymentUrl
            ? "DG決済URL再生成・見積メール再送信"
            : "DG決済URL生成・見積メール送信"}
      </button>
    </div>
  );
}