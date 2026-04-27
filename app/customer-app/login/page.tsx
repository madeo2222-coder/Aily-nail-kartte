"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

function normalizePhoneInput(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function toLocalPhone(value: string) {
  const normalized = normalizePhoneInput(value);

  if (!normalized) return "";

  if (normalized.startsWith("+81")) {
    return `0${normalized.slice(3)}`;
  }

  if (normalized.startsWith("81")) {
    return `0${normalized.slice(2)}`;
  }

  return normalized;
}

function toInternationalPhone(value: string) {
  const normalized = normalizePhoneInput(value);

  if (!normalized) return "";

  if (normalized.startsWith("+81")) {
    return normalized;
  }

  if (normalized.startsWith("81")) {
    return `+${normalized}`;
  }

  if (normalized.startsWith("0")) {
    return `+81${normalized.slice(1)}`;
  }

  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

function buildPhoneCandidates(value: string) {
  const local = toLocalPhone(value);
  const international = toInternationalPhone(value);

  const candidates = [value, local, international]
    .map((item) => normalizePhoneInput(item))
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  user_id: string | null;
};

export default function CustomerAppLoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const internationalPhone = useMemo(() => {
    return toInternationalPhone(phone);
  }, [phone]);

  async function handleSendOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setErrorMessage("");
    setMessage("");

    const targetPhone = toInternationalPhone(phone);

    if (!targetPhone || !targetPhone.startsWith("+81")) {
      setErrorMessage("電話番号を正しく入力してください（例: 08012345678）");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      phone: targetPhone,
    });

    setLoading(false);

    if (error) {
      console.error("send otp error:", error);
      setErrorMessage(`認証コード送信に失敗しました: ${error.message}`);
      return;
    }

    setStep("otp");
    setMessage("認証コードを送信しました。SMSをご確認ください。");
  }

  async function handleVerifyOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setErrorMessage("");
    setMessage("");

    const targetPhone = toInternationalPhone(phone);
    const token = otpCode.trim();

    if (!targetPhone || !token) {
      setErrorMessage("電話番号と認証コードを入力してください");
      return;
    }

    setLoading(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: targetPhone,
      token,
      type: "sms",
    });

    if (verifyError) {
      console.error("verify otp error:", verifyError);
      setLoading(false);
      setErrorMessage(`ログインに失敗しました: ${verifyError.message}`);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("get user error:", userError);
      setLoading(false);
      setErrorMessage("ログイン後のユーザー取得に失敗しました");
      return;
    }

    const phoneCandidates = buildPhoneCandidates(user.phone || phone);

    if (phoneCandidates.length === 0) {
      setLoading(false);
      setErrorMessage("電話番号の照合候補を作れませんでした");
      return;
    }

    const { data: matchedCustomers, error: customerError } = await supabase
      .from("customers")
      .select("id, name, phone, user_id")
      .in("phone", phoneCandidates);

    if (customerError) {
      console.error("customer lookup error:", customerError);
      setLoading(false);
      setErrorMessage(`顧客照合に失敗しました: ${customerError.message}`);
      return;
    }

    const customers = (matchedCustomers || []) as CustomerRow[];

    if (customers.length === 0) {
      setLoading(false);
      setErrorMessage(
        "一致する顧客が見つかりませんでした。初めての方は初回入力をご利用ください。"
      );
      return;
    }

    if (customers.length > 1) {
      setLoading(false);
      setErrorMessage(
        "同じ電話番号の顧客が複数見つかりました。店舗側で顧客データ整理が必要です。"
      );
      return;
    }

    const customer = customers[0];

    if (customer.user_id && customer.user_id !== user.id) {
      setLoading(false);
      setErrorMessage(
        "この顧客データはすでに別ユーザーに紐づいています。店舗に確認してください。"
      );
      return;
    }

    if (!customer.user_id) {
      const { error: updateError } = await supabase
        .from("customers")
        .update({
          user_id: user.id,
        })
        .eq("id", customer.id);

      if (updateError) {
        console.error("customer bind error:", updateError);
        setLoading(false);
        setErrorMessage(`顧客紐づけに失敗しました: ${updateError.message}`);
        return;
      }
    }

    setLoading(false);
    setMessage(`${customer.name || "お客様"}様としてログインしました`);
    router.push("/customer-app");
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
            LINEからご来店いただいた既存のお客様はこちらからログインしてください。電話番号で認証後、来店履歴や次回提案を確認できます。
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

        {step === "phone" ? (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="text-base font-bold text-slate-900">電話番号を入力</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              店舗の顧客情報に登録している電話番号を入力してください。
            </p>

            <form onSubmit={handleSendOtp} className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  電話番号
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08012345678"
                  className="w-full rounded-2xl border bg-white px-3 py-3"
                />
                <div className="mt-2 text-xs text-slate-500">
                  送信先: {internationalPhone || "未入力"}
                </div>
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

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {loading ? "送信中..." : "認証コードを送信"}
              </button>
            </form>
          </section>
        ) : (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="text-base font-bold text-slate-900">認証コード入力</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {internationalPhone} に送信した6桁の認証コードを入力してください。
            </p>

            <form onSubmit={handleVerifyOtp} className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  認証コード
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
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
                  disabled={loading}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {loading ? "確認中..." : "ログインする"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setOtpCode("");
                    setErrorMessage("");
                    setMessage("");
                  }}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
                >
                  電話番号を修正する
                </button>
              </div>
            </form>
          </section>
        )}

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