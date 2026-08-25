"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GENDER_VALUES,
  PREFERRED_MOOD_VALUES,
  REQUESTED_FORTUNE_VALUES,
  type Gender,
  type PreferredMood,
  type RequestedFortune,
} from "@/lib/sanmeigaku/types";

type MeResponse = {
  authenticated: boolean;
  customer?: { name?: string | null } | null;
};

const genderOptions: Array<{ value: Gender | ""; label: string }> = [
  { value: "", label: "回答しない" },
  { value: GENDER_VALUES[0], label: "女性" },
  { value: GENDER_VALUES[1], label: "男性" },
  { value: GENDER_VALUES[2], label: "その他" },
  { value: GENDER_VALUES[3], label: "回答を控える" },
];

const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  {
    key: "diagnosis",
    label: "診断",
    icon: "✨",
    href: "/customer-app/sanmeigaku",
  },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "mypage", label: "マイ", icon: "👤", href: "/customer-app/mypage" },
];

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function SanmeigakuNailDiagnosisPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [requestedFortune, setRequestedFortune] =
    useState<RequestedFortune>(REQUESTED_FORTUNE_VALUES[0]);
  const [preferredMood, setPreferredMood] = useState<PreferredMood>(
    PREFERRED_MOOD_VALUES[0]
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchMe() {
      try {
        const response = await fetch("/api/line-login/me", {
          cache: "no-store",
        });
        const json = (await response.json()) as MeResponse;

        if (json.authenticated && json.customer?.name) {
          setName(json.customer.name);
        }
      } catch {
        // The POST API performs the authoritative authentication check.
      }
    }

    void fetchMe();
  }, []);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3000);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      showMessage("お名前を入力してください");
      return;
    }

    if (!birthDate) {
      showMessage("生年月日を入力してください");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/sanmeigaku-diagnoses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          birthDate,
          gender: gender || null,
          requestedFortune,
          preferredMood,
        }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        diagnosisId?: string;
        error?: string;
      };

      if (!response.ok || !json.ok || !json.diagnosisId) {
        showMessage(json.error || "診断結果の保存に失敗しました");
        return;
      }

      router.push(`/customer-app/sanmeigaku/result/${json.diagnosisId}`);
    } catch {
      showMessage("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">
            あなたらしさを彩る
            <br />
            簡易ネイル診断
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            生年月日とお好みから、カラー、ストーン、ネイルデザインのヒントをご提案します。
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">診断情報</div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                お名前
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoComplete="name"
                placeholder="例：山田 花子"
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                生年月日
              </span>
              <input
                type="date"
                value={birthDate}
                min="1900-01-01"
                max={getToday()}
                onChange={(event) => setBirthDate(event.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                性別（任意・今回の結果決定には使用しません）
              </span>
              <select
                value={gender}
                onChange={(event) => setGender(event.target.value as Gender | "")}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                {genderOptions.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                今月意識したいテーマ
              </span>
              <select
                value={requestedFortune}
                onChange={(event) =>
                  setRequestedFortune(event.target.value as RequestedFortune)
                }
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                {REQUESTED_FORTUNE_VALUES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                好きな雰囲気
              </span>
              <select
                value={preferredMood}
                onChange={(event) =>
                  setPreferredMood(event.target.value as PreferredMood)
                }
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                {PREFERRED_MOOD_VALUES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">
              この診断は娯楽を目的とした簡易ネイル提案です。正式な算命学鑑定や、医療・法律・投資等の判断を目的とするものではありません。
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? "提案を作成中..." : "ネイル提案を見る"}
            </button>
          </div>
        </section>
      </div>

      {message ? (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-24px)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 shadow-lg">
            {message}
          </div>
        </div>
      ) : null}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {signedInNavItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium transition ${
                item.key === "diagnosis"
                  ? "bg-purple-50 text-purple-500"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="mt-1 leading-none">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </main>
  );
}
