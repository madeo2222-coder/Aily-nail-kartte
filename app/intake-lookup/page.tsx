"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type IntakeRow = {
  id: number;
  customer_id: number | null;
  name: string;
  phone: string;
  allergy: string | null;
  ng_items: string | null;
  agreed: Record<string, boolean> | null;
  signature_name: string;
  signature_data_url: string;
  created_at: string;
};

const NOTICE_LABELS: Record<string, string> = {
  infection: "体調不良・感染症等の注意事項",
  allergyRisk: "アレルギー・薬剤反応リスク",
  noRefund: "返金不可・お直し案内",
  healthCondition: "持病・妊娠・服薬等の申告",
  photoConsent: "施術記録写真について",
};

export default function IntakeLookupPage() {
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<IntakeRow | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("customer_intakes")
        .select(
          "id,customer_id,name,phone,allergy,ng_items,agreed,signature_name,signature_data_url,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      setRows((data || []) as IntakeRow[]);
    } catch (error) {
      console.error(error);
      setMessage("初回来店情報の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return rows;
    }

    return rows.filter((row) => {
      const name = (row.name || "").toLowerCase();
      const phone = (row.phone || "").toLowerCase();
      const allergy = (row.allergy || "").toLowerCase();
      const ngItems = (row.ng_items || "").toLowerCase();

      return (
        name.includes(keyword) ||
        phone.includes(keyword) ||
        allergy.includes(keyword) ||
        ngItems.includes(keyword)
      );
    });
  }, [rows, search]);

  const formatDateTime = (value: string) => {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderAgreements = (agreed: Record<string, boolean> | null) => {
    if (!agreed || Object.keys(agreed).length === 0) {
      return <p className="text-sm text-gray-500">確認データなし</p>;
    }

    return (
      <div className="space-y-2">
        {Object.entries(agreed).map(([key, value]) => (
          <div
            key={key}
            className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2"
          >
            <span className="text-sm leading-6 text-gray-700">
              {NOTICE_LABELS[key] || key}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                value
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {value ? "確認済み" : "未確認"}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-orange-500">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold text-gray-900">
                初回情報クイック確認
              </h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                来店受付や施術前に、名前や電話番号で初回入力情報をすぐ確認できます。
              </p>
            </div>

            <div className="flex gap-2">
              <Link
                href="/customer-intake/list"
                className="rounded-2xl border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
              >
                一覧ページへ
              </Link>
              <button
                type="button"
                onClick={fetchRows}
                className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
              >
                再読み込み
              </button>
            </div>
          </div>

          <div className="mt-5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名前・電話番号で検索"
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-4 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />
          </div>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/5">
            読み込み中...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/5">
            該当する初回情報はありません。
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelected(row)}
                className="rounded-3xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5 transition hover:ring-orange-300"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-gray-900">
                        {row.name || "名称未設定"}
                      </h2>
                      {row.customer_id ? (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">
                          顧客連携済み
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">
                          未連携
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                      <p>
                        <span className="font-medium text-gray-900">電話番号：</span>
                        {row.phone || "-"}
                      </p>
                      <p>
                        <span className="font-medium text-gray-900">登録日時：</span>
                        {formatDateTime(row.created_at)}
                      </p>
                      <p>
                        <span className="font-medium text-gray-900">署名者名：</span>
                        {row.signature_name || "-"}
                      </p>
                      <p>
                        <span className="font-medium text-gray-900">顧客ID：</span>
                        {row.customer_id ?? "-"}
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-gray-50 p-4">
                        <p className="mb-2 text-sm font-bold text-gray-900">
                          アレルギー
                        </p>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                          {row.allergy?.trim() ? row.allergy : "未入力"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-gray-50 p-4">
                        <p className="mb-2 text-sm font-bold text-gray-900">
                          施術NG項目
                        </p>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                          {row.ng_items?.trim() ? row.ng_items : "未入力"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {row.customer_id ? (
                        <Link
                          href={`/customers/${row.customer_id}/intake`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-2xl bg-orange-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600"
                        >
                          顧客の初回詳細へ
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {row.signature_data_url ? (
                      <img
                        src={row.signature_data_url}
                        alt="署名"
                        className="h-24 w-48 rounded-xl border border-gray-200 bg-white object-contain"
                      />
                    ) : (
                      <div className="flex h-24 w-48 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
                        署名なし
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.2em] text-orange-500">
                    QUICK VIEW
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-gray-900">
                    {selected.name}
                  </h2>
                  <p className="mt-2 text-sm text-gray-600">
                    登録日時：{formatDateTime(selected.created_at)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-2xl border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
                >
                  閉じる
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="mb-2 text-sm font-bold text-gray-900">電話番号</p>
                  <p className="text-sm text-gray-700">{selected.phone || "-"}</p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="mb-2 text-sm font-bold text-gray-900">署名者名</p>
                  <p className="text-sm text-gray-700">
                    {selected.signature_name || "-"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="mb-2 text-sm font-bold text-gray-900">
                    アレルギー
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                    {selected.allergy?.trim() ? selected.allergy : "未入力"}
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="mb-2 text-sm font-bold text-gray-900">
                    施術NG項目
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                    {selected.ng_items?.trim() ? selected.ng_items : "未入力"}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-gray-50 p-4">
                <p className="mb-3 text-sm font-bold text-gray-900">注意事項確認</p>
                {renderAgreements(selected.agreed)}
              </div>

              <div className="mt-4 rounded-2xl bg-gray-50 p-4">
                <p className="mb-3 text-sm font-bold text-gray-900">署名画像</p>
                {selected.signature_data_url ? (
                  <img
                    src={selected.signature_data_url}
                    alt="署名"
                    className="max-h-[260px] w-full rounded-2xl border border-gray-200 bg-white object-contain"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-400">
                    署名なし
                  </div>
                )}
              </div>

              {selected.customer_id ? (
                <div className="mt-4">
                  <Link
                    href={`/customers/${selected.customer_id}/intake`}
                    className="inline-flex rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
                  >
                    顧客の初回詳細へ
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}