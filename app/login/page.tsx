"use client";

import { FormEvent, useState } from "react";

type LoginResponse = {
  ok: boolean;
  role?: "staff" | "owner";
  redirectTo?: string;
  error?: string;
};

export default function StaffLoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    const trimmedLoginId = loginId.trim();
    const trimmedPassword = password.trim();

    setErrorMessage("");

    if (!trimmedLoginId || !trimmedPassword) {
      setErrorMessage(
        "ログインIDとパスワードを入力してください。"
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/staff-login/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loginId: trimmedLoginId,
          password: trimmedPassword,
        }),
      });

      const json = (await response.json()) as LoginResponse;

      if (!response.ok || !json.ok) {
        setErrorMessage(
          json.error || "ログインに失敗しました。"
        );
        return;
      }

      const redirectTo =
        json.redirectTo ||
        (json.role === "owner"
          ? "/owner-dashboard"
          : "/dashboard");

      window.location.href = redirectTo;
    } catch (error) {
      console.error("ログイン通信エラー:", error);
      setErrorMessage("ログインに失敗しました。");
    } finally {
      setLoading(false);
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
              ログイン
            </h1>

            <p className="mt-2 text-sm leading-6 text-white/90">
              スタッフまたはオーナーのログイン情報を入力してください。
            </p>
          </div>

          <div className="p-6">
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4 text-center">
                <div className="text-2xl" aria-hidden="true">
                  💅
                </div>
                <div className="mt-2 text-sm font-bold text-slate-800">
                  スタッフ
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  予約・顧客・来店
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                <div className="text-2xl" aria-hidden="true">
                  👑
                </div>
                <div className="mt-2 text-sm font-bold text-slate-800">
                  オーナー
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  売上・経費・分析
                </div>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  ログインID
                </span>

                <input
                  type="text"
                  value={loginId}
                  onChange={(event) =>
                    setLoginId(event.target.value)
                  }
                  disabled={loading}
                  autoComplete="username"
                  className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-100 disabled:bg-slate-50"
                  placeholder="ログインIDを入力"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  パスワード
                </span>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    disabled={loading}
                    autoComplete="current-password"
                    className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 pr-20 text-base text-slate-900 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-100 disabled:bg-slate-50"
                    placeholder="パスワードを入力"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((previous) => !previous)
                    }
                    disabled={loading}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-xs font-bold text-rose-500 disabled:opacity-50"
                  >
                    {showPassword ? "隠す" : "表示"}
                  </button>
                </div>
              </label>

              {errorMessage ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-950 px-4 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "ログイン中..."
                  : "ログインする"}
              </button>
            </form>

            <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
              オーナー用IDでログインするとオーナー経営ボード、
              スタッフ用IDではスタッフホームが開きます。
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}