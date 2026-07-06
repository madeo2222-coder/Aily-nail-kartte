"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SyncItem = {
  ok?: boolean;
  skipped?: boolean;
  subject?: string;
  error?: string;
  reason?: string;
  parsed?: {
    source?: "hpb" | "minimo";
    action?: "reservation" | "cancel";
    customerName?: string;
    reservationNumber?: string;
  };
  result?: {
    mode?: string;
    reservationId?: string | null;
  };
};

type SyncResult = {
  ok?: boolean;
  error?: string;
  parsed?: unknown;
  result?: unknown;
  count?: number;
  results?: SyncItem[];
};

function getSourceLabel(source?: string) {
  if (source === "minimo") return "ミニモ";
  if (source === "hpb") return "HPB";
  return "その他";
}

function getModeLabel(mode?: string) {
  if (mode === "inserted") return "新規";
  if (mode === "updated") return "更新";
  if (mode === "cancelled") return "キャンセル";
  if (mode === "cancel_missing") return "キャンセル元なし";
  return mode || "-";
}

export default function HpbMailSyncTestPage() {
  const [mailText, setMailText] = useState("");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [sending, setSending] = useState(false);
  const [gmailSyncing, setGmailSyncing] = useState(false);

  const summary = useMemo(() => {
    const items = result?.results || [];

    return {
      total: result?.count || 0,
      success: items.filter((item) => item.ok && !item.skipped).length,
      skipped: items.filter((item) => item.skipped).length,
      failed: items.filter((item) => item.ok === false).length,
      hpb: items.filter((item) => item.parsed?.source === "hpb" && item.ok).length,
      minimo: items.filter((item) => item.parsed?.source === "minimo" && item.ok)
        .length,
      cancelled: items.filter((item) => item.result?.mode === "cancelled").length,
      inserted: items.filter((item) => item.result?.mode === "inserted").length,
      updated: items.filter((item) => item.result?.mode === "updated").length,
    };
  }, [result]);

  async function handleSync() {
    if (!mailText.trim()) {
      alert("予約メール本文を貼り付けてください");
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

      alert("予約メール本文の同期が完了しました");
    } catch (error) {
      console.error(error);
      alert("通信エラーが発生しました");
    } finally {
      setSending(false);
    }
  }

  async function handleGmailSync() {
    const ok = window.confirm(
      "Gmailから最新の予約メールを取得して同期しますか？"
    );
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

      alert(`予約同期が完了しました（取得 ${json.count || 0} 件）`);
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
            予約同期センター
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/90">
            Gmailに届いたHPB・ミニモの予約/キャンセルメールを同期します。
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
            Gmailから今すぐ予約同期
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            ailynail2026@gmail.com に届いたHPB・ミニモの予約メールを取得して、予約カレンダーへ反映します。
          </p>

          <button
            type="button"
            onClick={handleGmailSync}
            disabled={gmailSyncing}
            className="mt-4 w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {gmailSyncing ? "予約同期中..." : "予約今すぐ同期"}
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

            {result.results ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">取得</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">
                      {summary.total}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">成功</div>
                    <div className="mt-1 text-2xl font-bold text-emerald-700">
                      {summary.success}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">失敗</div>
                    <div className="mt-1 text-2xl font-bold text-red-700">
                      {summary.failed}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">スキップ</div>
                    <div className="mt-1 text-2xl font-bold text-slate-700">
                      {summary.skipped}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div className="rounded-2xl bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">HPB</div>
                    <div className="mt-1 text-xl font-bold text-orange-700">
                      {summary.hpb}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">ミニモ</div>
                    <div className="mt-1 text-xl font-bold text-purple-700">
                      {summary.minimo}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">新規</div>
                    <div className="mt-1 text-xl font-bold text-slate-900">
                      {summary.inserted}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">更新</div>
                    <div className="mt-1 text-xl font-bold text-slate-900">
                      {summary.updated}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <div className="text-xs font-bold text-slate-500">
                      キャンセル
                    </div>
                    <div className="mt-1 text-xl font-bold text-slate-900">
                      {summary.cancelled}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {result.results.map((item, index) => (
                    <div
                      key={`${item.subject || "mail"}-${index}`}
                      className="rounded-2xl bg-white p-4 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${
                            item.ok
                              ? "bg-emerald-100 text-emerald-700"
                              : item.skipped
                                ? "bg-slate-100 text-slate-600"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {item.ok ? "成功" : item.skipped ? "スキップ" : "失敗"}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                          {getSourceLabel(item.parsed?.source)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                          {getModeLabel(item.result?.mode)}
                        </span>
                      </div>

                      <div className="mt-2 font-bold text-slate-900">
                        {item.parsed?.customerName || item.subject || "メール"}
                      </div>

                      {item.parsed?.reservationNumber ? (
                        <div className="mt-1 text-xs text-slate-500">
                          予約番号/ID：{item.parsed.reservationNumber}
                        </div>
                      ) : null}

                      {item.error || item.reason ? (
                        <div className="mt-2 text-xs font-bold text-red-600">
                          {item.error || item.reason}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <pre className="mt-4 max-h-[520px] overflow-auto rounded-2xl bg-white p-4 text-xs leading-5 text-slate-700">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        ) : null}

        <section className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
          <label className="block text-sm font-bold text-slate-900">
            予約メール本文を手動同期
          </label>

          <textarea
            value={mailText}
            onChange={(event) => setMailText(event.target.value)}
            rows={18}
            placeholder="ここにHPBまたはミニモの予約/キャンセルメール本文を貼り付けてください。"
            className="mt-3 w-full rounded-2xl border border-rose-100 bg-rose-50/30 px-4 py-3 text-sm leading-6 outline-none focus:border-rose-300"
          />

          <button
            type="button"
            onClick={handleSync}
            disabled={sending}
            className="mt-4 w-full rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {sending ? "同期中..." : "予約メール本文を同期テスト"}
          </button>
        </section>
      </div>
    </main>
  );
}