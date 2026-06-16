import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SanmeigakuLpPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-4 py-6">
        <section className="overflow-hidden rounded-[36px] bg-gradient-to-br from-fuchsia-500 via-pink-500 to-orange-400 p-6 shadow-2xl">
          <div className="text-xs font-black tracking-[0.3em] text-white/80">
            AI BEAUTY ORACLE
          </div>

          <h1 className="mt-4 text-3xl font-black leading-tight">
            あなたの運命ネイル診断
          </h1>

          <p className="mt-4 text-sm font-bold leading-7 text-white/90">
            生年月日と今月上げたい運気から、
            あなたに合うラッキーカラー・天然石・開運ネイルを無料診断します。
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {["恋愛運", "金運", "仕事運"].map((item) => (
              <div
                key={item}
                className="rounded-2xl bg-white/15 px-3 py-3 text-center text-xs font-black backdrop-blur"
              >
                {item}
              </div>
            ))}
          </div>

          <Link
            href="/customer-app/sanmeigaku"
            className="mt-6 block rounded-3xl bg-white px-5 py-4 text-center text-sm font-black text-fuchsia-600 shadow-xl"
          >
            無料で診断する
          </Link>
        </section>

        <section className="mt-5 rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-xl">
          <div className="text-xs font-black tracking-[0.25em] text-fuchsia-300">
            FREE DIAGNOSIS
          </div>

          <h2 className="mt-2 text-xl font-black">
            診断でわかること
          </h2>

          <div className="mt-4 space-y-3">
            {[
              ["💅", "あなたに似合う開運ネイル"],
              ["🎨", "今月のラッキーカラー"],
              ["💎", "相性の良い天然石"],
              ["📅", "今月の開運日"],
            ].map(([icon, text]) => (
              <div
                key={text}
                className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3"
              >
                <div className="text-xl">{icon}</div>
                <div className="text-sm font-bold">{text}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-xl">
          <div className="text-xs font-black tracking-[0.25em] text-amber-300">
            SAMPLE
          </div>

          <h2 className="mt-2 text-xl font-black">
            診断サンプル
          </h2>

          <div className="mt-4 space-y-3">
            <div className="rounded-3xl bg-white p-4 text-slate-900">
              <div className="text-xs font-black text-pink-500">
                恋愛運UP
              </div>
              <div className="mt-1 text-lg font-black">ルビー × ローズピンク</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                魅力を引き上げたい時におすすめの開運ネイル。
              </div>
            </div>

            <div className="rounded-3xl bg-white p-4 text-slate-900">
              <div className="text-xs font-black text-yellow-600">
                金運UP
              </div>
              <div className="mt-1 text-lg font-black">
                天然ダイヤ × シャンパンゴールド
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                豊かさと自信を引き寄せたい時におすすめ。
              </div>
            </div>

            <div className="rounded-3xl bg-white p-4 text-slate-900">
              <div className="text-xs font-black text-blue-500">
                仕事運UP
              </div>
              <div className="mt-1 text-lg font-black">サファイア × ネイビー</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">
                判断力や信頼感を整えたい時におすすめ。
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[32px] bg-gradient-to-br from-violet-600 to-fuchsia-600 p-5 shadow-xl">
          <h2 className="text-xl font-black">
            診断後はそのまま予約・チップ注文へ
          </h2>

          <p className="mt-3 text-sm font-bold leading-7 text-white/90">
            診断結果をもとに、店舗での開運ネイル相談や、
            あなただけのネイルチップ注文につなげられます。
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/15 p-4 text-center">
              <div className="text-2xl">🏠</div>
              <div className="mt-2 text-xs font-black">店舗施術</div>
            </div>

            <div className="rounded-2xl bg-white/15 p-4 text-center">
              <div className="text-2xl">📦</div>
              <div className="mt-2 text-xs font-black">チップ注文</div>
            </div>
          </div>
        </section>

        <Link
          href="/customer-app/sanmeigaku"
          className="mt-6 block rounded-3xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-orange-400 px-5 py-4 text-center text-sm font-black text-white shadow-xl"
        >
          今すぐ無料診断する
        </Link>

        <p className="mt-4 text-center text-xs leading-5 text-white/50">
          診断結果は美容・ネイル提案を目的としたコンテンツです。
        </p>
      </div>
    </main>
  );
}