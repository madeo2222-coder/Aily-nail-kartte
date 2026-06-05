"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

function CustomerAppLoginPageContent() {
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

  function handleLineLogin() {
    setChecking(true);
    window.location.href =
      "/api/line-login/session?mode=start&next=/customer-app";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">
              LINEログイン
            </div>
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

          <div className="mt-5 space-y-3">
            <Link
              href="/customer-intake"
              className="block rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-orange-400 px-4 py-4 text-center text-base font-black text-white shadow-lg shadow-rose-200"
            >
              🌸 新規会員登録（無料）はこちら
              <div className="mt-1 text-xs font-bold text-white/95">
                登録1分・デザインギャラリー閲覧・予約OK
              </div>
            </Link>

            <Link
              href="/customer-app"
              className="block rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-900"
            >
              入口ページへ戻る
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            LINEでログイン
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            すでにマイページ登録済みのお客様は、このままLINEログインへ進んでください。
          </p>

          {pendingDisplayName ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              {pendingDisplayName}
              さんのLINEアカウントで連携待ちです。続けて顧客連携へ進めます。
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
          <div className="text-base font-bold text-slate-900">
            ログイン後にできること
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">
                デザインギャラリー
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                いろいろなネイルデザインを見ながら、気に入ったデザインで予約できます。
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">次回予約</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                ご自身の顧客情報に紐づいた状態で予約できます。
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">
                来店履歴・施術写真
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                前回メニューや担当者、施術写真を確認できます。
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function LoadingFallback() {
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

export default function CustomerAppLoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CustomerAppLoginPageContent />
    </Suspense>
  );
}