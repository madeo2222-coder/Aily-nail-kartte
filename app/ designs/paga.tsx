"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type VisitRow = {
  id: string;
  customer_id: string | null;
  menu: string | null;
  color: string | null;
  memo: string | null;
  price: number | null;
  created_at: string | null;
  photo_urls: string[] | null;
  customers:
    | {
        id: string;
        name: string | null;
        phone: string | null;
        line_name: string | null;
        allergy: string | null;
      }
    | {
        id: string;
        name: string | null;
        phone: string | null;
        line_name: string | null;
        allergy: string | null;
      }[]
    | null;
};

type DesignItem = {
  visitId: string;
  customerId: string | null;
  customerName: string;
  menu: string | null;
  color: string | null;
  memo: string | null;
  price: number | null;
  createdAt: string | null;
  photoUrl: string;
};

function formatDate(date: string | null) {
  if (!date) return "日付未登録";

  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "日付未登録";

  const [, y, m, d] = match;
  return `${y}/${Number(m)}/${Number(d)}`;
}

function formatCurrency(value: number | null) {
  return `¥${(value ?? 0).toLocaleString("ja-JP")}`;
}

function normalizeCustomerName(customer: VisitRow["customers"]) {
  if (!customer) return "名前未登録";

  if (Array.isArray(customer)) {
    return customer[0]?.name?.trim() || "名前未登録";
  }

  return customer.name?.trim() || "名前未登録";
}

export default function DesignsPage() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [searchMenu, setSearchMenu] = useState("");
  const [searchColor, setSearchColor] = useState("");
  const [searchMemo, setSearchMemo] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetchDesigns();
  }, [mounted]);

  async function fetchDesigns() {
    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("visits")
        .select(
          `
          id,
          customer_id,
          menu,
          color,
          memo,
          price,
          created_at,
          photo_urls,
          customers (
            id,
            name,
            phone,
            line_name,
            allergy
          )
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMessage(error.message);
        setVisits([]);
        return;
      }

      setVisits((data as VisitRow[]) ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "デザイン一覧の取得に失敗しました"
      );
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }

  const designItems = useMemo(() => {
    const items: DesignItem[] = [];

    visits.forEach((visit) => {
      const photos = Array.isArray(visit.photo_urls) ? visit.photo_urls : [];
      const customerName = normalizeCustomerName(visit.customers);

      photos.forEach((photoUrl) => {
        if (!photoUrl) return;

        items.push({
          visitId: visit.id,
          customerId: visit.customer_id,
          customerName,
          menu: visit.menu,
          color: visit.color,
          memo: visit.memo,
          price: visit.price,
          createdAt: visit.created_at,
          photoUrl,
        });
      });
    });

    return items;
  }, [visits]);

  const filteredItems = useMemo(() => {
    const menuKeyword = searchMenu.trim().toLowerCase();
    const colorKeyword = searchColor.trim().toLowerCase();
    const memoKeyword = searchMemo.trim().toLowerCase();

    return designItems.filter((item) => {
      const menu = (item.menu ?? "").toLowerCase();
      const color = (item.color ?? "").toLowerCase();
      const memo = (item.memo ?? "").toLowerCase();

      const menuMatch = !menuKeyword || menu.includes(menuKeyword);
      const colorMatch = !colorKeyword || color.includes(colorKeyword);
      const memoMatch = !memoKeyword || memo.includes(memoKeyword);

      return menuMatch && colorMatch && memoMatch;
    });
  }, [designItems, searchMenu, searchColor, searchMemo]);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-neutral-500">読み込み中...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-pink-600">Naily AiDOL</p>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
              デザイン検索
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              過去施術の写真を menu / color / memo で検索して、提案や再現に使えます。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link
              href="/dashboard"
              className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              ダッシュボード
            </Link>
            <Link
              href="/customers"
              className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              顧客一覧
            </Link>
            <Link
              href="/visits"
              className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              来店履歴
            </Link>
            <Link
              href="/reviews"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-100"
            >
              口コミ導線
            </Link>
          </div>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-pink-200 bg-gradient-to-br from-pink-50 to-white p-5 shadow-sm">
            <div className="mb-2 inline-flex rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-700">
              活用ポイント
            </div>
            <h2 className="text-lg font-bold text-neutral-900">提案用に使う</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              似た色味・似たデザイン・過去オーダーを探して、
              カウンセリング時の提案精度を上げられます。
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
            <div className="mb-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              連携導線
            </div>
            <h2 className="text-lg font-bold text-neutral-900">口コミ導線と連携</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              満足度の高い施術写真を確認したあと、そのまま口コミ依頼導線へつなげられます。
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-neutral-900">検索条件</h2>
            <p className="mt-1 text-sm text-neutral-500">
              menu・color・memo の組み合わせで絞り込めます。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                メニュー
              </label>
              <input
                type="text"
                value={searchMenu}
                onChange={(e) => setSearchMenu(e.target.value)}
                placeholder="ワンカラー / マグネット など"
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                suppressHydrationWarning
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                カラー
              </label>
              <input
                type="text"
                value={searchColor}
                onChange={(e) => setSearchColor(e.target.value)}
                placeholder="ベージュ / ピンク / 黒 など"
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                suppressHydrationWarning
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                メモ
              </label>
              <input
                type="text"
                value={searchMemo}
                onChange={(e) => setSearchMemo(e.target.value)}
                placeholder="ラメ / シンプル / 春っぽい など"
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
                suppressHydrationWarning
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            表示件数{" "}
            <span className="font-semibold text-neutral-900">
              {filteredItems.length}
            </span>{" "}
            / {designItems.length}
          </div>
        </div>

        {errorMessage ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900">デザイン一覧</h2>
            <Link
              href="/reviews"
              className="text-sm font-medium text-amber-600 hover:text-amber-700"
            >
              口コミ導線へ
            </Link>
          </div>

          {loading ? (
            <p className="text-sm text-neutral-500">読み込み中...</p>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
              <p className="text-sm text-neutral-500">
                条件に合うデザインが見つかりませんでした。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item, index) => (
                <div
                  key={`${item.visitId}-${index}`}
                  className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
                >
                  <a href={item.photoUrl} target="_blank" rel="noreferrer">
                    <img
                      src={item.photoUrl}
                      alt={`${item.customerName} の施術写真`}
                      className="h-72 w-full object-cover"
                    />
                  </a>

                  <div className="p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                        {formatDate(item.createdAt)}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                        {formatCurrency(item.price)}
                      </span>
                    </div>

                    <div className="grid gap-3">
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-xs font-medium text-neutral-500">顧客名</p>
                        <p className="mt-1 text-sm font-semibold text-neutral-900">
                          {item.customerName}
                        </p>
                      </div>

                      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-xs font-medium text-neutral-500">メニュー</p>
                        <p className="mt-1 text-sm font-semibold text-neutral-900">
                          {item.menu?.trim() || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-xs font-medium text-neutral-500">カラー</p>
                        <p className="mt-1 text-sm font-semibold text-neutral-900">
                          {item.color?.trim() || "-"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-xs font-medium text-neutral-500">メモ</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-neutral-900">
                          {item.memo?.trim() || "-"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.customerId ? (
                        <Link
                          href={`/customers/${item.customerId}`}
                          className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                        >
                          顧客詳細
                        </Link>
                      ) : (
                        <span className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-400">
                          顧客詳細なし
                        </span>
                      )}

                      {item.customerId ? (
                        <Link
                          href={`/customers/${item.customerId}/mypage`}
                          className="rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm font-medium text-pink-700 transition hover:border-pink-300 hover:bg-pink-100"
                        >
                          マイページ
                        </Link>
                      ) : null}

                      <Link
                        href={`/reviews?customer_name=${encodeURIComponent(
                          item.customerName
                        )}`}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
                      >
                        口コミ導線
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}