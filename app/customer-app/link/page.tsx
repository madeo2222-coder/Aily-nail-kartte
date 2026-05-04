"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type MeResponse = {
  authenticated: boolean;
  pending?: {
    displayName: string;
    pictureUrl: string;
  } | null;
};

export default function CustomerAppLinkPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [pendingDisplayName, setPendingDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchPending() {
      try {
        const res = await fetch("/api/line-login/me", {
          cache: "no-store",
        });
        const json = (await res.json()) as MeResponse;

        if (json.authenticated) {
          router.replace("/customer-app");
          return;
        }

        if (!json.pending) {
          router.replace("/customer-app/login");
          return;
        }

        setPendingDisplayName(json.pending.displayName || "");
      } catch {
        router.replace("/customer-app/login");
      } finally {
        setLoading(false);
      }
    }

    fetchPending();
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    setMessage("");

    if (!name.trim() || !phone.trim()) {
      setErrorMessage("お名前と電話番号を入力してください。");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/line-login/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          phone,
        }),
      });

      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        redirectTo?: string;
      };

      if (!res.ok || !json.ok) {
        setErrorMessage(json.error || "連携に失敗しました。");
        setSubmitting(false);
        return;
      }

      setMessage("連携が完了しました。マイページへ移動します。");
      router.push(json.redirectTo || "/customer-app");
    } catch {
      setErrorMessage("連携処理に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">顧客連携</div>
            <div className="mt-3 text-sm text-slate-600">読み込み中...</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-green-500 via-emerald-500 to-teal-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">LINE連携</h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            初回のみ、お店の顧客情報とLINEアカウントを連携します。
          </p>

          {pendingDisplayName ? (
            <div className="mt-4 rounded-2xl bg-white/15 px-4 py-3 text-sm font-bold backdrop-blur-sm">
              LINE表示名: {pendingDisplayName}
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-base font-bold text-slate-900">顧客情報を確認</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            店舗に登録しているお名前と電話番号を入力してください。
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                お名前
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 花子"
                className="w-full rounded-2xl border bg-white px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                電話番号
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09012345678"
                className="w-full rounded-2xl border bg-white px-3 py-3"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {message ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                {message}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {submitting ? "連携中..." : "この内容で連携する"}
              </button>

              <Link
                href="/customer-app/login"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700"
              >
                ログイン画面へ戻る
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}