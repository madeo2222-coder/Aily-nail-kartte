"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const MINIMUM_PASSWORD_LENGTH = 8;

export default function SetupPasswordForm() {
  const [supabase] = useState(createSupabaseBrowserClient);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting || completed) return;

    setErrorMessage("");

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setErrorMessage("パスワードは8文字以上で入力してください。");
      return;
    }

    if (password !== passwordConfirmation) {
      setErrorMessage("確認用パスワードが一致していません。");
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.replace(
          "/staff/auth-error?reason=session_missing"
        );
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setErrorMessage(
          "パスワードを設定できませんでした。内容を確認して、もう一度お試しください。"
        );
        return;
      }

      setPassword("");
      setPasswordConfirmation("");
      setCompleted(true);
    } catch {
      setErrorMessage(
        "パスワードを設定できませんでした。時間をおいて、もう一度お試しください。"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return (
      <div
        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5"
        role="status"
      >
        <h2 className="text-base font-bold text-emerald-900">
          初回パスワードの設定が完了しました
        </h2>
        <p className="mt-2 text-sm leading-6 text-emerald-800">
          管理者によるアカウント確認後、ログインできるようになります。この画面を閉じて、管理者からの案内をお待ちください。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
        8文字以上のパスワードを設定してください。入力内容は送信後に画面へ表示されません。
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-700">
          新しいパスワード
        </span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
            autoComplete="new-password"
            minLength={MINIMUM_PASSWORD_LENGTH}
            required
            className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 pr-20 text-base text-slate-900 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-100 disabled:bg-slate-50"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            disabled={submitting}
            className="absolute inset-y-0 right-0 flex items-center px-4 text-xs font-bold text-rose-500 disabled:opacity-50"
          >
            {showPassword ? "隠す" : "表示"}
          </button>
        </div>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-bold text-slate-700">
          新しいパスワード（確認）
        </span>
        <input
          type={showPassword ? "text" : "password"}
          value={passwordConfirmation}
          onChange={(event) =>
            setPasswordConfirmation(event.target.value)
          }
          disabled={submitting}
          autoComplete="new-password"
          minLength={MINIMUM_PASSWORD_LENGTH}
          required
          className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-100 disabled:bg-slate-50"
        />
      </label>

      {errorMessage ? (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-2xl bg-slate-950 px-4 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "設定中..." : "パスワードを設定する"}
      </button>
    </form>
  );
}
