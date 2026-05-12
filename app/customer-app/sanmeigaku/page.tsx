"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DiagnosisResult = {
  luckyColor: string;
  luckyStone: string;
  nailTheme: string;
  message: string;
};

type MeResponse = {
  authenticated: boolean;
  customer?: {
    id?: string;
    salon_id?: string | null;
    name?: string | null;
  } | null;
};

const fortuneOptions = [
  "恋愛運",
  "仕事運",
  "金運",
  "美容運",
  "人間関係運",
  "全体運",
];

const moodOptions = [
  "上品",
  "可愛い",
  "大人っぽい",
  "華やか",
  "ナチュラル",
  "個性的",
];
const premiumStones = [
  {
    name: "天然ダイヤモンド",
    grade: "Premium",
    message:
      "圧倒的な輝きと浄化力を持つ最高級天然石。特別な開運タイミングや贈答用にもおすすめ。",
  },
  {
    name: "ルビー",
    grade: "Luxury",
    message:
      "情熱・恋愛運・女性性を高める高級天然石。魅力を引き上げたい時におすすめ。",
  },
  {
    name: "サファイア",
    grade: "Luxury",
    message:
      "仕事運・知性・冷静な判断力を整える高級天然石。経営者層にも人気。",
  },
];
const fortuneColorSets = [
  {
    lucky: "#ec4899",
    luckyName: "ローズピンク",
    avoid: "#6b7280",
    avoidName: "ダークグレー",
    love: "#f472b6",
    loveName: "フェミニンピンク",
    money: "#facc15",
    moneyName: "ゴールドイエロー",
  },
  {
    lucky: "#8b5cf6",
    luckyName: "パープル",
    avoid: "#1f2937",
    avoidName: "ブラック",
    love: "#c084fc",
    loveName: "ラベンダー",
    money: "#22c55e",
    moneyName: "エメラルドグリーン",
  },
  {
    lucky: "#06b6d4",
    luckyName: "ターコイズ",
    avoid: "#78716c",
    avoidName: "ブラウン",
    love: "#fb7185",
    loveName: "ローズレッド",
    money: "#eab308",
    moneyName: "シャイニーゴールド",
  },
];
const luckyDayMessages = [
  {
    title: "恋愛運アップ日",
    day: "7日・16日・25日",
    message:
      "ピンク系ネイルや天然石を身につけることで、人間関係や恋愛運の流れが整いやすい日です。",
  },
  {
    title: "金運アップ日",
    day: "8日・18日・28日",
    message:
      "ゴールド系カラーや輝きのあるストーンを取り入れることで、豊かさの流れを引き寄せやすい日です。",
  },
  {
    title: "美容運アップ日",
    day: "5日・15日・24日",
    message:
      "ネイル・美容・自分磨きをすることで、自信と魅力が高まりやすいタイミングです。",
  },
];
const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "diagnosis", label: "診断", icon: "✨", href: "/customer-app/sanmeigaku" },
  { key: "history", label: "履歴", icon: "📝", href: "/customer-app/history" },
  { key: "mypage", label: "マイ", icon: "👤", href: "" },
];

function buildDiagnosis(
  name: string,
  birthday: string,
  fortune: string,
  mood: string
): DiagnosisResult {
  const seedText = `${name}-${birthday}-${fortune}-${mood}`;
  const seed = seedText
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  const colors = [
    "ローズピンク",
    "シャンパンゴールド",
    "ラベンダー",
    "ミルキーホワイト",
    "コーラルオレンジ",
    "ペールブルー",
  ];

  const stones = [
    "天然ダイヤモンド",
    "ローズクォーツ",
    "シトリン",
    "アメジスト",
    "ムーンストーン",
    "クリスタル",
  ];

  const themes = [
    "やわらかいグラデーションに小粒ストーンを合わせた開運ネイル",
    "透明感のあるワンカラーに天然ダイヤを一粒合わせた上品ネイル",
    "肌なじみカラーにポイントビジューを置いた大人可愛いネイル",
    "ラメを控えめに重ねた、運気を底上げするきれいめネイル",
    "指先が明るく見えるカラーに天然石風アートを入れたネイル",
    "落ち着いたベースカラーに光を集めるストーンを合わせたネイル",
  ];

  const color = colors[seed % colors.length];
  const stone = stones[(seed + 2) % stones.length];
  const theme = themes[(seed + 4) % themes.length];

  return {
    luckyColor: color,
    luckyStone: stone,
    nailTheme: theme,
    message: `${name || "お客様"}様は、今月「${fortune}」を整える流れが強いタイミングです。${mood}な雰囲気をベースに、${color}と${stone}を取り入れることで、指先から前向きな印象を作りやすくなります。`,
  };
}

function buildTipOrderHref(result: DiagnosisResult) {
  const params = new URLSearchParams();

  params.set("color", result.luckyColor);
  params.set("stone", result.luckyStone);
  params.set("theme", result.nailTheme);

  return `/customer-app/nail-tip-order?${params.toString()}`;
}

export default function SanmeigakuNailDiagnosisPage() {
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [fortune, setFortune] = useState(fortuneOptions[0]);
  const [mood, setMood] = useState(moodOptions[0]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [salonId, setSalonId] = useState("");

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch("/api/line-login/me", {
          cache: "no-store",
        });

        const json = (await res.json()) as MeResponse;

        setCustomerId(json.customer?.id || "");
        setSalonId(json.customer?.salon_id || "");

        if (!name && json.customer?.name) {
          setName(json.customer.name);
        }
      } catch {
        setCustomerId("");
        setSalonId("");
      }
    }

    fetchMe();
  }, [name]);

  const result = useMemo(() => {
    return buildDiagnosis(name, birthday, fortune, mood);
  }, [name, birthday, fortune, mood]);
const selectedFortuneColor = useMemo(() => {
  const seedText = `${name}-${birthday}-${fortune}-${mood}-color`;
  const seed = seedText
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return fortuneColorSets[seed % fortuneColorSets.length];
}, [name, birthday, fortune, mood]);
   const selectedLuckyDay = useMemo(() => {
  const seedText = `${name}-${birthday}-${fortune}-${mood}-luckyday`;

  const seed = seedText
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return luckyDayMessages[seed % luckyDayMessages.length];
}, [name, birthday, fortune, mood]);
  const tipOrderHref = useMemo(() => {
    return buildTipOrderHref(result);
  }, [result]);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      showMessage("お名前を入力してください");
      return;
    }

    if (!birthday) {
      showMessage("生年月日を入力してください");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/sanmeigaku-diagnoses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          salonId,
          customerId,
          name,
          birthday,
          fortune,
          mood,
          luckyColor: result.luckyColor,
          luckyStone: result.luckyStone,
          nailTheme: result.nailTheme,
          message: result.message,
          diagnosisType: "free_nail",
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        showMessage(json.error || "診断保存に失敗しました");
        setSubmitted(true);
        return;
      }

      setSubmitted(true);
      showMessage("診断結果を保存しました");
    } catch (error) {
      console.error(error);
      setSubmitted(true);
      showMessage("診断結果の保存中に通信エラーが発生しました");
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
            あなたの未来が上がる
            <br />
            算命学ネイル診断
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            お名前・生年月日・今月上げたい運気から、今のあなたに合うカラー、ストーン、ネイルデザインを提案します。
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">診断情報</div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                お名前
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：山田 花子"
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                生年月日
              </label>
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                今月上げたい運気
              </label>
              <select
                value={fortune}
                onChange={(e) => setFortune(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                {fortuneOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                好きな雰囲気
              </label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                {moodOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? "診断中..." : "診断する"}
            </button>
          </div>
        </section>

        {submitted ? (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold text-slate-900">診断結果</div>
              <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-600">
                今月の開運ネイル
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-purple-50 p-4 text-sm font-bold leading-6 text-purple-800">
              {result.message}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">ラッキーカラー</div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {result.luckyColor}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">ラッキーストーン</div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {result.luckyStone}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">
                  おすすめネイル方向性
                </div>
                <div className="mt-1 text-sm font-bold leading-6 text-slate-900">
                  {result.nailTheme}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              診断結果をもとに、店舗施術またはネイルチップ注文を選べます。
              通販の場合は、来店せずに開運デザインの相談・注文ができます。
            </div>
            <section className="mt-6 space-y-4">
  <div className="text-lg font-bold text-slate-900">
    今日の開運カラー診断
  </div>

  <div className="grid grid-cols-2 gap-3">
    <div className="rounded-3xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-bold text-slate-500">
        ラッキーカラー
      </div>

      <div
        className="mt-3 h-14 rounded-2xl"
        style={{ backgroundColor: selectedFortuneColor.lucky }}
      />

      <div className="mt-3 font-bold text-slate-900">
        {selectedFortuneColor.luckyName}
      </div>
    </div>

    <div className="rounded-3xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-bold text-slate-500">
        NGカラー
      </div>

      <div
        className="mt-3 h-14 rounded-2xl"
        style={{ backgroundColor: selectedFortuneColor.avoid }}
      />

      <div className="mt-3 font-bold text-slate-900">
        {selectedFortuneColor.avoidName}
      </div>
    </div>

    <div className="rounded-3xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-bold text-pink-500">
        恋愛運UP
      </div>

      <div
        className="mt-3 h-14 rounded-2xl"
        style={{ backgroundColor: selectedFortuneColor.love }}
      />

      <div className="mt-3 font-bold text-slate-900">
        {selectedFortuneColor.loveName}
      </div>
    </div>

    <div className="rounded-3xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-bold text-yellow-600">
        金運UP
      </div>

      <div
        className="mt-3 h-14 rounded-2xl"
        style={{ backgroundColor: selectedFortuneColor.money }}
      />

      <div className="mt-3 font-bold text-slate-900">
        {selectedFortuneColor.moneyName}
      </div>
    </div>
  </div>
</section>
<div className="mt-4 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
  <div className="flex items-center justify-between">
    <div>
      <div className="text-xs font-bold tracking-wide text-amber-600">
        PREMIUM STONE
      </div>

      <div className="mt-1 text-lg font-bold text-slate-900">
        プレミアム天然石提案
      </div>
    </div>

    <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
      高級ライン
    </div>
  </div>

  <div className="mt-4 space-y-3">
    {premiumStones.map((stone) => (
      <div
        key={stone.name}
        className="rounded-2xl border border-amber-100 bg-white p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-base font-bold text-slate-900">
            {stone.name}
          </div>

          <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">
            {stone.grade}
          </div>
        </div>

        <div className="mt-2 text-sm leading-6 text-slate-700">
          {stone.message}
        </div>
      </div>
    ))}
  </div>

  <div className="mt-4 rounded-2xl bg-amber-100/60 p-4 text-sm leading-6 text-amber-900">
    宝石商ルートによる天然石を使用した、
    高級開運ネイル・ネイルチップ・ギフト相談にも対応予定です。
  </div>
</div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <Link
                href={tipOrderHref}
                className="block w-full rounded-2xl bg-purple-600 px-4 py-3 text-center text-sm font-bold text-white shadow"
              >
                この内容でネイルチップ注文する
              </Link>

              <Link
                href="/customer-app/reserve?menu=開運ネイル相談"
                className="block w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-center text-sm font-bold text-rose-600"
              >
                店舗で施術予約する
              </Link>
            </div>
          </section>
        ) : null}
      </div>
<section className="mt-6 rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm">
  <div className="flex items-center justify-between">
    <div>
      <div className="text-xs font-bold tracking-wide text-rose-500">
        LUCKY DAY
      </div>

      <div className="mt-1 text-lg font-bold text-slate-900">
        今月の開運日
      </div>
    </div>

    <div className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-600">
      運気上昇
    </div>
  </div>

  <div className="mt-4 rounded-2xl bg-white p-4">
    <div className="text-sm font-bold text-rose-500">
      {selectedLuckyDay.title}
    </div>

    <div className="mt-2 text-2xl font-bold text-slate-900">
      {selectedLuckyDay.day}
    </div>

    <div className="mt-3 text-sm leading-6 text-slate-700">
      {selectedLuckyDay.message}
    </div>
  </div>
<section className="mt-6 rounded-[32px] bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-500 p-[1px] shadow-xl">
  <div className="rounded-[31px] bg-white/95 p-5 backdrop-blur">
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs font-bold tracking-[0.2em] text-fuchsia-500">
          SHARE CARD
        </div>

        <div className="mt-1 text-xl font-black text-slate-900">
          あなたの開運診断結果
        </div>
      </div>

      <div className="rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-bold text-fuchsia-600">
        AI解析
      </div>
    </div>

    <div className="mt-5 rounded-3xl bg-gradient-to-br from-pink-50 to-rose-50 p-5">
      <div className="text-sm text-slate-500">
        今日のラッキーカラー
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div
          className="h-14 w-14 rounded-2xl shadow"
          style={{
            backgroundColor: selectedFortuneColor.lucky,
          }}
        />

        <div>
          <div className="text-2xl font-black text-slate-900">
            {selectedFortuneColor.luckyName}
          </div>

          <div className="text-sm text-slate-500">
            運気を引き寄せる開運カラー
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-white/80 p-4">
        <div className="text-sm font-bold text-rose-500">
          今月の開運日
        </div>

        <div className="mt-2 text-3xl font-black text-slate-900">
          {selectedLuckyDay.day}
        </div>

        <div className="mt-2 text-sm leading-6 text-slate-700">
          {selectedLuckyDay.message}
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-white/80 p-4">
        <div className="text-sm font-bold text-fuchsia-500">
          AIメッセージ
        </div>

        <div className="mt-2 text-sm leading-7 text-slate-700">
          {result.message}
        </div>
      </div>
    </div>

    <button
      type="button"
      className="mt-5 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-rose-500 px-4 py-4 text-sm font-black text-white shadow-lg"
    >
      診断結果をシェアする（準備中）
    </button>
  </div>
</section>
  <Link
    href="/customer-app/reserve?menu=開運ネイル相談"
    className="mt-4 block w-full rounded-2xl bg-rose-500 px-4 py-3 text-center text-sm font-bold text-white shadow"
  >
    開運日に予約相談する
  </Link>
</section>
      {message ? (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-24px)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-blue-700">{message}</div>
              <button
                type="button"
                onClick={() => setMessage("")}
                className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-bold text-blue-700"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {signedInNavItems.map((item) => {
            const isActive = item.key === "diagnosis";

            if (item.href) {
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium transition ${
                    isActive
                      ? "bg-purple-50 text-purple-500"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span className="mt-1 leading-none">{item.label}</span>
                </Link>
              );
            }

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => showMessage(`${item.label} 画面は次段階で実装します`)}
                className="flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium text-gray-500 transition hover:text-gray-800"
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="mt-1 leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}