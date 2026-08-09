"use client";

import Link from "next/link";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function StaffVerifyGooglePage() {
  const [supabase] = useState(createSupabaseBrowserClient);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleGoogleVerification() {
    if (submitting) return;

    setSubmitting(true);
    setErrorMessage("");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        setErrorMessage(
          "本人確認を開始できませんでした。時間をおいて、もう一度お試しください。"
        );
        setSubmitting(false);
      }
    } catch {
      setErrorMessage(
        "本人確認を開始できませんでした。時間をおいて、もう一度お試しください。"
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-orange-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
        <section className="w-full overflow-hidden rounded-[30px] border border-rose-100 bg-white shadow-xl shadow-rose-100/40">
          <div className="bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-6 text-white">
            <p className="text-xs font-bold tracking-[0.25em] text-white/80">
              NAILY AIDOL
            </p>
            <h1 className="mt-3 text-2xl font-bold">
              初回設定・本人確認
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/90">
              管理者から案内されたGoogleアカウントで本人確認してください。
            </p>
          </div>

          <div className="space-y-4 p-6">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              本人確認後、スタッフ個別ログインで使用するパスワードを設定します。
            </div>

            {errorMessage ? (
              <div
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleGoogleVerification}
              disabled={submitting}
              className="w-full rounded-2xl bg-slate-950 px-4 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "本人確認へ移動中..." : "Googleで本人確認"}
            </button>

            <Link
              href="/login"
              className="block text-center text-sm font-bold text-rose-500 hover:text-rose-600"
            >
              ログイン画面へ戻る
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
