"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type CustomerRow = {
  id: number;
  name: string;
  phone: string;
};

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

export default function CustomerIntakeDetailPage({ params }: PageProps) {
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    const resolveParams = async () => {
      try {
        const resolved = await params;
        const idNumber = Number(resolved.id);

        if (!mounted) return;

        if (!idNumber || Number.isNaN(idNumber)) {
          setMessage("顧客IDが不正です。");
          setLoading(false);
          return;
        }

        setCustomerId(idNumber);
      } catch (error) {
        console.error(error);
        if (!mounted) return;
        setMessage("ページ情報の取得に失敗しました。");
        setLoading(false);
      }
    };

    resolveParams();

    return () => {
      mounted = false;
    };
  }, [params]);

  useEffect(() => {
    if (!customerId) return;

    const fetchData = async () => {
      setLoading(true);
      setMessage("");

      try {
        const { data: customerData, error: customerError } = await supabase
          .from("customers")
          .select("id,name,phone")
          .eq("id", customerId)
          .single();

        if (customerError) {
          throw customerError;
        }

        const customerRow = customerData as CustomerRow;
        setCustomer(customerRow);

        const { data: byCustomerId, error: byCustomerIdError } = await supabase
          .from("customer_intakes")
          .select(
            "id,customer_id,name,phone,allergy,ng_items,agreed,signature_name,signature_data_url,created_at"
          )
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });

        if (byCustomerIdError) {
          throw byCustomerIdError;
        }

        let mergedRows = (byCustomerId || []) as IntakeRow[];

        if (mergedRows.length === 0 && customerRow.phone) {
          const { data: byPhone, error: byPhoneError } = await supabase
            .from("customer_intakes")
            .select(
              "id,customer_id,name,phone,allergy,ng_items,agreed,signature_name,signature_data_url,created_at"
            )
            .eq("phone", customerRow.phone)
            .order("created_at", { ascending: false });

          if (byPhoneError) {
            throw byPhoneError;
          }

          mergedRows = (byPhone || []) as IntakeRow[];
        }

        setIntakes(mergedRows);
      } catch (error) {
        console.error(error);
        setMessage("初回来店情報の取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [customerId]);

  const latestIntake = useMemo(() => {
    if (intakes.length === 0) return null;
    return intakes[0];
  }, [intakes]);

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

  const renderAgreementList = (agreed: Record<string, boolean> | null) => {
    if (!agreed || Object.keys(agreed).length === 0) {
      return <p className="text-sm text-gray-500">確認データなし</p>;
    }

    return (
      <div className="space-y-2">
        {Object.entries(agreed).map(([key, value]) => (
          <div
            key={key}
            className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-3 ring-1 ring-black/5"
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-orange-500">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold text-gray-900">
                顧客 初回来店情報
              </h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                顧客ごとの最新の初回入力内容と、過去の入力履歴を確認できます。
              </p>
            </div>

            <div className="flex gap-2">
              <Link
                href={customerId ? `/customers/${customerId}` : "/customers"}
                className="rounded-2xl border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
              >
                顧客詳細へ戻る
              </Link>

              <Link
                href="/customer-intake/list"
                className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
              >
                一覧へ
              </Link>
            </div>
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
        ) : !customer ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-black/5">
            顧客情報が見つかりませんでした。
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <h2 className="text-lg font-bold text-gray-900">顧客情報</h2>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="mb-2 text-sm font-bold text-gray-900">顧客ID</p>
                  <p className="text-sm text-gray-700">{customer.id}</p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="mb-2 text-sm font-bold text-gray-900">氏名</p>
                  <p className="text-sm text-gray-700">{customer.name || "-"}</p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="mb-2 text-sm font-bold text-gray-900">電話番号</p>
                  <p className="text-sm text-gray-700">{customer.phone || "-"}</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-gray-900">最新の初回来店情報</h2>
                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                  {intakes.length}件
                </span>
              </div>

              {!latestIntake ? (
                <div className="mt-4 rounded-2xl bg-gray-50 p-6 text-sm text-gray-500">
                  初回来店情報はまだ登録されていません。
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <p className="mb-2 text-sm font-bold text-gray-900">
                        登録日時
                      </p>
                      <p className="text-sm text-gray-700">
                        {formatDateTime(latestIntake.created_at)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-gray-50 p-4">
                      <p className="mb-2 text-sm font-bold text-gray-900">
                        署名者名
                      </p>
                      <p className="text-sm text-gray-700">
                        {latestIntake.signature_name || "-"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-gray-50 p-4">
                      <p className="mb-2 text-sm font-bold text-gray-900">
                        受付レコードID
                      </p>
                      <p className="text-sm text-gray-700">{latestIntake.id}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <p className="mb-2 text-sm font-bold text-gray-900">
                        アレルギー・皮膚トラブル
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {latestIntake.allergy?.trim()
                          ? latestIntake.allergy
                          : "未入力"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-gray-50 p-4">
                      <p className="mb-2 text-sm font-bold text-gray-900">
                        施術NG項目
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {latestIntake.ng_items?.trim()
                          ? latestIntake.ng_items
                          : "未入力"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="mb-3 text-sm font-bold text-gray-900">
                      注意事項確認
                    </p>
                    {renderAgreementList(latestIntake.agreed)}
                  </div>

                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="mb-3 text-sm font-bold text-gray-900">署名画像</p>
                    {latestIntake.signature_data_url ? (
                      <img
                        src={latestIntake.signature_data_url}
                        alt="署名"
                        className="max-h-[280px] w-full rounded-2xl border border-gray-200 bg-white object-contain"
                      />
                    ) : (
                      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-400">
                        署名なし
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <h2 className="text-lg font-bold text-gray-900">入力履歴</h2>

              {intakes.length === 0 ? (
                <div className="mt-4 rounded-2xl bg-gray-50 p-6 text-sm text-gray-500">
                  履歴はありません。
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {intakes.map((row, index) => (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-gray-200 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-gray-900">
                              {index === 0 ? "最新入力" : `履歴 ${index + 1}`}
                            </p>
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">
                              ID {row.id}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-gray-600">
                            登録日時：{formatDateTime(row.created_at)}
                          </p>
                        </div>

                        <div className="text-sm text-gray-600">
                          署名者名：{row.signature_name || "-"}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="mb-2 text-sm font-bold text-gray-900">
                            アレルギー
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                            {row.allergy?.trim() ? row.allergy : "未入力"}
                          </p>
                        </div>

                        <div className="rounded-xl bg-gray-50 p-3">
                          <p className="mb-2 text-sm font-bold text-gray-900">
                            施術NG項目
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                            {row.ng_items?.trim() ? row.ng_items : "未入力"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}