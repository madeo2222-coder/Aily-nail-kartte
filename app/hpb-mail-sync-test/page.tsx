"use client";

import Link from "next/link";
import { useState } from "react";

type SyncResult = {
  ok?: boolean;
  error?: string;
  parsed?: unknown;
  result?: unknown;
  count?: number;
  results?: unknown[];
};

export default function HpbMailSyncTestPage() {
  const [mailText, setMailText] = useState("");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [sending, setSending] = useState(false);
  const [gmailSyncing, setGmailSyncing] = useState(false);

  async function handleSync() {
    if (!mailText.trim()) {
      alert("HPBメール本文を貼り付けてください");
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await fetch("/api/hpb-mail-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: mailText }),
      });

      const json = (await response.json()) as SyncResult;
      setResult(json);

      if (!response.ok || !json.ok) {
        alert(json.error || "同期に失敗しました");
        return;
      }

      alert("HPBメール同期テストが完了しました");
    } catch (error) {
      console.error(error);
      alert("通信エラーが発生しました");
    } finally {
      setSending(false);
    }
  }

  async function handleGmailSync() {
    const ok = window.confirm("Gmailから最新のHPBメールを取得して同期しますか？");
    if (!ok) return;

    setGmailSyncing(true);
    setResult(null);

    try {
      const response = await fetch("/api/hpb-gmail-sync", {
        method: "POST",
      });

      const json = (await response.json()) as SyncResult;
      setResult(json);

      if (!response.ok || !json.ok) {
        alert(json.error || "Gmail同期に失敗しました");
        return;
      }

      alert(`Gmail同期が完了しました（取得 ${json.count || 0} 件）`);
    } catch (error) {
      console.error(error);
      alert("Gmail同期の通信エラーが発生しました");
    } finally {
      setGmailSyncing(false);
    }
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto w-full max-w-[920px] space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            NAILY AIDOL
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white">
            HPBメール同期テスト
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/90">
            SALON BOARDから届いた予約・キャンセルメールを同期します。
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/reservations"
            className="rounded-2xl border bg-white px-4 py-3 text-sm font-bold text-rose-600 shadow-sm"
          >
            予約一覧へ
          </Link>

          <Link
            href="/reservations/calendar"
            className="rounded-2xl border bg-white px-4 py-3 text-sm font-bold text-rose-600 shadow-sm"
          >
            カレンダーへ
          </Link>
        </div>

        <section className="rounded-[28px] border border-orange-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-slate-900">
            Gmailから今すぐ同期
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            ailynail2026@gmail.com に届いたSALON BOARD/HPBメールを取得して、予約カレンダーへ反映します。
          </p>

          <button
            type="button"
            onClick={handleGmailSync}
            disabled={gmailSyncing}
            className="mt-4 w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {gmailSyncing ? "Gmail同期中..." : "Gmailから今すぐ同期"}
          </button>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
          <label className="block text-sm font-bold text-slate-900">
            HPBメール本文を手動同期
          </label>

          <textarea
            value={mailText}
            onChange={(event) => setMailText(event.target.value)}
            rows={18}
            placeholder="ここにHPBの予約連絡メール、またはキャンセル連絡メールの本文を貼り付けてください。"
            className="mt-3 w-full rounded-2xl border border-rose-100 bg-rose-50/30 px-4 py-3 text-sm leading-6 outline-none focus:border-rose-300"
          />

          <button
            type="button"
            onClick={handleSync}
            disabled={sending}
            className="mt-4 w-full rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {sending ? "同期中..." : "HPBメール本文を同期テスト"}
          </button>
        </section>

        {result ? (
          <section
            className={`rounded-[28px] border p-5 shadow-sm ${
              result.ok
                ? "border-emerald-100 bg-emerald-50"
                : "border-red-100 bg-red-50"
            }`}
          >
            <div
              className={`text-sm font-bold ${
                result.ok ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {result.ok ? "同期成功" : "同期失敗"}
            </div>

            {result.error ? (
              <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-red-700">
                {result.error}
              </div>
            ) : null}

            <pre className="mt-4 max-h-[520px] overflow-auto rounded-2xl bg-white p-4 text-xs leading-5 text-slate-700">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        ) : null}
      </div>
    </main>
  );
}