"use client";

import { useState } from "react";
import Link from "next/link";

type MergeResult = {
  ok?: boolean;
  error?: string;
  keepCustomerId?: string;
  mergeCustomerId?: string;
  keepCustomerName?: string;
  mergeCustomerName?: string;
  moved?: Record<string, number>;
};

export default function CustomerMergePage() {
  const [keepCustomerId, setKeepCustomerId] = useState("");
  const [mergeCustomerId, setMergeCustomerId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);

  async function handleMerge() {
    if (!keepCustomerId.trim() || !mergeCustomerId.trim()) {
      alert("残す顧客IDと統合する顧客IDを入力してください");
      return;
    }

    if (keepCustomerId.trim() === mergeCustomerId.trim()) {
      alert("同じ顧客IDは統合できません");
      return;
    }

    const ok = window.confirm(
      "顧客を統合します。\n統合する顧客の予約・来店・売上・通知ログを残す顧客へ移動し、統合する顧客は削除されます。\n実行してよろしいですか？"
    );

    if (!ok) return;

    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/customers/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keepCustomerId: keepCustomerId.trim(),
          mergeCustomerId: mergeCustomerId.trim(),
        }),
      });

      const json = (await response.json()) as MergeResult;
      setResult(json);

      if (!response.ok || !json.ok) {
        alert(json.error || "顧客統合に失敗しました");
        return;
      }

      alert("顧客統合が完了しました");
    } catch (error) {
      console.error(error);
      alert("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto w-full max-w-[760px] space-y-4 p-4 pb-24">
        <section className="rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            NAILY AIDOL
          </p>
          <h1 className="mt-2 text-2xl font-bold">顧客統合</h1>
          <p className="mt-2 text-sm leading-6 text-white/90">
            重複した顧客カルテを1つにまとめます。
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/customers"
            className="rounded-2xl border bg-white px-4 py-3 text-sm font-bold text-rose-600 shadow-sm"
          >
            顧客一覧へ
          </Link>
        </div>

        <section className="space-y-4 rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            <div className="font-bold">注意</div>
            <div>
              「残す顧客ID」に統合先、「統合する顧客ID」に削除する側を入力してください。
              予約・来店・売上・通知ログは残す顧客へ移動されます。
            </div>
          </div>

          <label className="block">
            <div className="text-sm font-bold text-slate-800">
              残す顧客ID
            </div>
            <input
              value={keepCustomerId}
              onChange={(event) => setKeepCustomerId(event.target.value)}
              placeholder="例：残したい顧客のUUID"
              className="mt-2 w-full rounded-2xl border border-rose-100 bg-rose-50/30 px-4 py-3 text-sm outline-none focus:border-rose-300"
            />
          </label>

          <label className="block">
            <div className="text-sm font-bold text-slate-800">
              統合する顧客ID
            </div>
            <input
              value={mergeCustomerId}
              onChange={(event) => setMergeCustomerId(event.target.value)}
              placeholder="例：削除する顧客のUUID"
              className="mt-2 w-full rounded-2xl border border-rose-100 bg-rose-50/30 px-4 py-3 text-sm outline-none focus:border-rose-300"
            />
          </label>

          <button
            type="button"
            onClick={handleMerge}
            disabled={submitting}
            className="w-full rounded-2xl bg-slate-950 px-4 py-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? "統合中..." : "顧客を統合する"}
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
              {result.ok ? "統合成功" : "統合失敗"}
            </div>

            {result.error ? (
              <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-red-700">
                {result.error}
              </div>
            ) : null}

            {result.ok && result.keepCustomerId ? (
              <Link
                href={`/customers/${result.keepCustomerId}`}
                className="mt-4 block rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-emerald-700"
              >
                統合後の顧客カルテを開く
              </Link>
            ) : null}

            <pre className="mt-4 max-h-[420px] overflow-auto rounded-2xl bg-white p-4 text-xs leading-5 text-slate-700">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        ) : null}
      </div>
    </main>
  );
}