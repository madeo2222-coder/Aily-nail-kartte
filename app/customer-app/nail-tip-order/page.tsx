"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  NAIL_TIP_PRODUCTS,
  type NailTipProduct as CatalogNailTipProduct,
} from "@/lib/nail-tip-products/catalog";

type MeResponse = {
  authenticated: boolean;
  customer?: {
    id?: string;
    salon_id?: string | null;
    name?: string | null;
  };
};

type NailTipProduct = CatalogNailTipProduct & {
  description: string;
  badge: string;
  cardClassName: string;
  textClassName: string;
};

const productPresentation: Record<
  (typeof NAIL_TIP_PRODUCTS)[number]["code"],
  Omit<NailTipProduct, keyof CatalogNailTipProduct>
> = {
  ruby_love: {
    description: "恋愛運・魅力アップをテーマにしたデザイン",
    badge: "恋愛運人気No.1",
    cardClassName: "border-pink-200 bg-pink-50",
    textClassName: "text-pink-600",
  },
  sapphire_work: {
    description: "判断力・信頼感アップをテーマにしたデザイン",
    badge: "仕事運人気No.1",
    cardClassName: "border-blue-200 bg-blue-50",
    textClassName: "text-blue-600",
  },
  citrine_money: {
    description: "金運・豊かさアップをテーマにしたデザイン",
    badge: "金運人気No.1",
    cardClassName: "border-amber-200 bg-amber-50",
    textClassName: "text-amber-600",
  },
  diamond_premium: {
    description:
      "ジュエリーパーツを使用したプレミアムデザイン。使用素材や証明書の詳細は、ご注文前に個別にご案内します。",
    badge: "プレミアム",
    cardClassName: "border-purple-200 bg-purple-50",
    textClassName: "text-purple-600",
  },
};

const nailTipProducts: NailTipProduct[] = NAIL_TIP_PRODUCTS.map((product) => ({
  ...product,
  ...productPresentation[product.code],
}));

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
  { key: "mypage", label: "マイ", icon: "👤", href: "" },
];

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function findRecommendedProduct(stone: string) {
  const normalizedStone = stone.toLowerCase();

  if (stone.includes("ルビー") || normalizedStone.includes("ruby")) {
    return "ruby_love";
  }

  if (stone.includes("サファイア") || normalizedStone.includes("sapphire")) {
    return "sapphire_work";
  }

  if (stone.includes("シトリン") || normalizedStone.includes("citrine")) {
    return "citrine_money";
  }

  if (
    stone.includes("ダイヤ") ||
    stone.includes("天然ダイヤ") ||
    normalizedStone.includes("diamond")
  ) {
    return "diamond_premium";
  }

  return "diamond_premium";
}

function NailTipOrderContent() {
  const searchParams = useSearchParams();

  const color = searchParams.get("color") || "未選択";
  const stone = searchParams.get("stone") || "未選択";
  const theme = searchParams.get("theme") || "未選択";

  const recommendedProductId = useMemo(() => {
    return findRecommendedProduct(stone);
  }, [stone]);

  const [message, setMessage] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(recommendedProductId);
  const [designRequest, setDesignRequest] = useState("");
  const [sizeStatus, setSizeStatus] = useState("サイズ未確認");
  const [deliveryRequest, setDeliveryRequest] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [salonId, setSalonId] = useState("");

  useEffect(() => {
    setSelectedProductId(recommendedProductId);
  }, [recommendedProductId]);

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch("/api/line-login/me", {
          cache: "no-store",
        });

        const json = (await res.json()) as MeResponse;

        setCustomerId(json.customer?.id || "");
        setSalonId(json.customer?.salon_id || "");
      } catch {
        setCustomerId("");
        setSalonId("");
      }
    }

    fetchMe();
  }, []);

  const selectedProduct = useMemo(() => {
    return (
      nailTipProducts.find((product) => product.code === selectedProductId) ||
      nailTipProducts[0]
    );
  }, [selectedProductId]);

  const summaryText = useMemo(() => {
    return `${color} / ${stone} / ${theme}`;
  }, [color, stone, theme]);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  async function handleSubmit() {
    try {
      const response = await fetch("/api/nail-tip-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          salonId,
          customerId,
          luckyColor: color,
          luckyStone: stone,
          nailTheme: theme,
          productCode: selectedProduct.code,
          designRequest,
          sizeStatus,
          deliveryRequest,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        showMessage(json.error || "注文保存に失敗しました");
        return;
      }

      showMessage("ネイルチップ注文を受け付けました");

      setDesignRequest("");
      setDeliveryRequest("");
      setSizeStatus("サイズ未確認");
      setSelectedProductId(recommendedProductId);
    } catch (error) {
      console.error(error);
      showMessage("通信エラーが発生しました");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">
            開運ネイルチップ注文
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            算命学ネイル診断の結果をもとに、あなたに合わせた開運ネイルチップを相談・注文できます。
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            診断からのおすすめ内容
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-2xl bg-purple-50 p-4">
              <div className="text-xs text-purple-500">ラッキーカラー</div>
              <div className="mt-1 text-lg font-bold text-purple-900">
                {color}
              </div>
            </div>

            <div className="rounded-2xl bg-pink-50 p-4">
              <div className="text-xs text-pink-500">ラッキーストーン</div>
              <div className="mt-1 text-lg font-bold text-pink-900">
                {stone}
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50 p-4">
              <div className="text-xs text-amber-600">おすすめ方向性</div>
              <div className="mt-1 text-sm font-bold leading-6 text-amber-900">
                {theme}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {summaryText}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            開運ネイルチップ商品一覧
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            診断結果に近い商品を自動でおすすめします。別の商品も選択できます。
          </p>

          <div className="mt-4 space-y-3">
            {nailTipProducts.map((product) => {
              const isSelected = selectedProductId === product.code;
              const isRecommended = recommendedProductId === product.code;

              return (
                <button
                  key={product.code}
                  type="button"
                  onClick={() => setSelectedProductId(product.code)}
                  className={`w-full rounded-3xl border p-4 text-left transition ${
                    product.cardClassName
                  } ${
                    isSelected
                      ? "ring-2 ring-slate-900"
                      : "hover:ring-2 hover:ring-slate-300"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className={`text-xs font-black ${product.textClassName}`}>
                        {product.badge}
                        {isRecommended ? " / 診断おすすめ" : ""}
                      </div>
                      <div className="mt-1 text-lg font-black text-slate-900">
                        {product.name}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">
                        {product.description}
                      </div>
                      <div className="mt-2 text-xs font-bold text-slate-500">
                        {product.stone} / {product.fortune}
                      </div>
                    </div>

                    <div className="shrink-0 text-left sm:text-right">
                      <div className={`text-2xl font-black ${product.textClassName}`}>
                        {formatYen(product.price)}
                      </div>
                      <div className="mt-2 text-xl">
                        {isSelected ? "☑" : "□"}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            注文希望内容
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">選択中の商品</div>
            <div className="mt-1 text-lg font-black text-slate-900">
              {selectedProduct.name}
            </div>
            <div className="mt-1 text-sm font-bold text-slate-600">
              {formatYen(selectedProduct.price)} / {selectedProduct.stone}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                デザイン希望・雰囲気
              </label>
              <textarea
                value={designRequest}
                onChange={(e) => setDesignRequest(e.target.value)}
                rows={4}
                placeholder="例：派手すぎない上品系、仕事でも使える、ストーンは控えめ等"
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                チップサイズ
              </label>
              <select
                value={sizeStatus}
                onChange={(e) => setSizeStatus(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                <option value="サイズ未確認">サイズ未確認</option>
                <option value="サイズ測定済み">サイズ測定済み</option>
                <option value="サイズ確認キット希望">
                  サイズ確認キット希望
                </option>
                <option value="過去注文と同じサイズ">
                  過去注文と同じサイズ
                </option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                配送・納期希望
              </label>
              <textarea
                value={deliveryRequest}
                onChange={(e) => setDeliveryRequest(e.target.value)}
                rows={3}
                placeholder="例：急ぎではない、〇日までに欲しい、ギフト用等"
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              className="w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-bold text-white"
            >
              この内容で注文相談する
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            Overseas customers
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            For international orders and worldwide shipping requests, please
            use our English consultation form.
          </p>
          <Link
            href="/customer-app/inbound"
            className="mt-4 block rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white"
          >
            International Custom Nail Tips
          </Link>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            店舗施術もできます
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            実際に店舗で施術を受けたい場合は、開運ネイル相談として予約できます。
          </p>

          <Link
            href="/customer-app/reserve?menu=開運ネイル相談"
            className="mt-4 block rounded-2xl border border-rose-200 bg-white px-4 py-3 text-center text-sm font-bold text-rose-600"
          >
            店舗で施術予約する
          </Link>
        </section>
      </div>

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
                onClick={() =>
                  showMessage(`${item.label} 画面は次段階で実装します`)
                }
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

export default function NailTipOrderPage() {
  return (
    <Suspense fallback={null}>
      <NailTipOrderContent />
    </Suspense>
  );
}
