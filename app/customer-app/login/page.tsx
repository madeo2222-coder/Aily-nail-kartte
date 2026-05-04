"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type MeResponse = {
  authenticated: boolean;
  customer?: {
    id: string;
    name: string | null;
    salon_id: string | null;
    line_user_id: string | null;
  } | null;
  pending?: {
    displayName: string;
    pictureUrl: string;
  } | null;
};

export default function CustomerAppLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pendingDisplayName, setPendingDisplayName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const queryError = useMemo(() => {
    return searchParams.get("error") || "";
  }, [searchParams]);

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch("/api/line-login/me", {
          cache: "no-store",
        });

        const json = (await res.json()) as MeResponse;

        if (json.authenticated) {
          router.replace("/customer-app");
          return;
        }

        if (json.pending) {
          setPendingDisplayName(json.pending.displayName || "");
        }
      } catch {
        setErrorMessage("ログイン状態の確認に失敗しました。");
      } finally {
        setLoading(false);
      }
    }

    fetchMe();
  }, [router]);

  useEffect(() => {
    if (queryError) {
      setErrorMessage(queryError);
    }
  }, [queryError]);

  async function handleLineLogin() {
    setChecking(true);
    window.location.href = "/api/line-login/session?mode=start&next=/customer-app";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">LINEログイン</div>
            <div className="mt-3 text-sm text-slate-600">読み込み中...</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">
            会員のお客様ログイン
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            これからはLINEアカウントでログインします。初回のみ、お客様情報との連携確認が入る場合があります。
          </p>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              href="/customer-app"
              className="rounded-xl bg-white px-4 py-2 text-center text-sm font-bold text-slate-900"
            >
              入口ページへ戻る
            </Link>
            <Link
              href="/customer-intake"
              className="rounded-xl border border-white/30 px-4 py-2 text-center text-sm font-bold text-white"
            >
              初めての方はこちら
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-base font-bold text-slate-900">LINEでログイン</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            公式LINEからご利用のお客様は、このままLINEログインへ進んでください。
          </p>

          {pendingDisplayName ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              {pendingDisplayName} さんのLINEアカウントで連携待ちです。続けて顧客連携へ進めます。
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleLineLogin}
              disabled={checking}
              className="w-full rounded-2xl bg-green-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {checking ? "LINEへ移動中..." : "LINEでログイン"}
            </button>

            {pendingDisplayName ? (
              <Link
                href="/customer-app/link"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700"
              >
                顧客連携画面へ進む
              </Link>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">ログイン後にできること</div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">次回予約</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                ご自身の顧客情報に紐づいた状態で予約できます。
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">来店履歴確認</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                前回メニューや担当者、次回提案を確認できます。
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">お知らせ確認</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                最新キャンペーンや再来提案を見られます。
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}