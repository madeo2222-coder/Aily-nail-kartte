"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function normalizeNextPath(raw: string | null) {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(() => {
    return normalizeNextPath(searchParams.get("next"));
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!mounted) return;

      if (data.session) {
        router.replace(nextPath);
        router.refresh();
        return;
      }

      setChecking(false);
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, [router, nextPath]);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message || "ログインに失敗しました。");
      setLoading(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  };

  if (checking) {
    return (
      <main className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-sm border border-neutral-200 p-6">
          <p className="text-sm text-neutral-600">ログイン状態を確認しています...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-sm border border-neutral-200 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Naily AiDOL ログイン</h1>
          <p className="mt-2 text-sm text-neutral-600">
            管理画面はスタッフ / 管理者のみ閲覧できます。
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              メールアドレス
            </label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@example.com"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              パスワード
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-900"
              required
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "ログイン中..." : "ログインする"}
          </button>
        </form>

        <div className="mt-6 rounded-xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
          公開ページ:
          <span className="ml-1 font-medium text-neutral-700">/customer-intake</span>
          <br />
          管理ページ:
          <span className="ml-1 font-medium text-neutral-700">ログイン必須</span>
        </div>
      </div>
    </main>
  );
}