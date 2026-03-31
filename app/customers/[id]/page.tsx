"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
};

type Visit = {
  id: string;
  customer_id: string;
  visit_date: string | null;
  price: number | null;
  memo: string | null;
  next_visit_date: string | null;
  next_proposal: string | null;
};

type CustomerIntake = {
  id: number | string;
  customer_id: string | null;
  name: string | null;
  phone: string | null;
  birth_date: string | null;
  allergy: string | null;
  skin_trouble: string | null;
  constitution: string | null;
  avoid_items: string | null;
  signer_name: string | null;
  signature_data_url: string | null;
  check_health: boolean | null;
  check_reaction: boolean | null;
  check_refund: boolean | null;
  check_condition: boolean | null;
  check_photo: boolean | null;
  submitted_at: string | null;
  created_at?: string | null;
};

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params?.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [intake, setIntake] = useState<CustomerIntake | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    fetchCustomerDetail();
  }, [customerId]);

  async function fetchCustomerDetail() {
    setLoading(true);

    try {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("id", customerId)
        .single();

      if (customerError) {
        console.error("customers取得エラー:", customerError);
        alert("顧客情報の取得に失敗しました");
        setLoading(false);
        return;
      }

      setCustomer(customerData);

      const { data: visitsData, error: visitsError } = await supabase
        .from("visits")
        .select(
          "id, customer_id, visit_date, price, memo, next_visit_date, next_proposal"
        )
        .eq("customer_id", customerId)
        .order("visit_date", { ascending: false });

      if (visitsError) {
        console.error("visits取得エラー:", visitsError);
        setVisits([]);
      } else {
        setVisits((visitsData || []) as Visit[]);
      }

      try {
        const intakeRes = await supabase
          .from("customer_intakes")
          .select("*")
          .eq("customer_id", customerId);

        if (intakeRes.error) {
          console.error("customer_intakes取得エラー:", intakeRes.error);
          console.error(
            "customer_intakes取得エラー詳細:",
            JSON.stringify(intakeRes.error, null, 2)
          );
          setIntake(null);
        } else {
          const intakeRows = ((intakeRes.data || []) as any[])
            .filter((item) => item && item.customer_id)
            .map((item) => ({
              id: item.id,
              customer_id: item.customer_id ?? null,
              name: typeof item.name === "string" ? item.name : null,
              phone: typeof item.phone === "string" ? item.phone : null,
              birth_date:
                typeof item.birth_date === "string" ? item.birth_date : null,
              allergy: typeof item.allergy === "string" ? item.allergy : null,
              skin_trouble:
                typeof item.skin_trouble === "string"
                  ? item.skin_trouble
                  : null,
              constitution:
                typeof item.constitution === "string"
                  ? item.constitution
                  : null,
              avoid_items:
                typeof item.avoid_items === "string" ? item.avoid_items : null,
              signer_name:
                typeof item.signer_name === "string" ? item.signer_name : null,
              signature_data_url:
                typeof item.signature_data_url === "string"
                  ? item.signature_data_url
                  : null,
              check_health:
                typeof item.check_health === "boolean"
                  ? item.check_health
                  : null,
              check_reaction:
                typeof item.check_reaction === "boolean"
                  ? item.check_reaction
                  : null,
              check_refund:
                typeof item.check_refund === "boolean"
                  ? item.check_refund
                  : null,
              check_condition:
                typeof item.check_condition === "boolean"
                  ? item.check_condition
                  : null,
              check_photo:
                typeof item.check_photo === "boolean" ? item.check_photo : null,
              submitted_at:
                typeof item.submitted_at === "string" ? item.submitted_at : null,
              created_at:
                typeof item.created_at === "string" ? item.created_at : null,
            })) as CustomerIntake[];

          const latestIntake =
            intakeRows.sort((a, b) => {
              const aTime = a.created_at
                ? new Date(a.created_at).getTime()
                : a.submitted_at
                ? new Date(a.submitted_at).getTime()
                : 0;
              const bTime = b.created_at
                ? new Date(b.created_at).getTime()
                : b.submitted_at
                ? new Date(b.submitted_at).getTime()
                : 0;
              return bTime - aTime;
            })[0] || null;

          setIntake(latestIntake);
        }
      } catch (error) {
        console.error("customer_intakes想定外エラー:", error);
        setIntake(null);
      }
    } catch (error) {
      console.error("詳細取得エラー:", error);
      alert("データ取得中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCustomer() {
    const ok = window.confirm("この顧客を削除しますか？");
    if (!ok) return;

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", customerId);

    if (error) {
      console.error("顧客削除エラー:", error);
      alert("顧客の削除に失敗しました");
      return;
    }

    alert("顧客を削除しました");
    router.push("/customers");
  }

  function formatDate(date: string | null) {
    if (!date) return "-";

    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return date;

    return d.toLocaleString("ja-JP");
  }

  function yesNo(value: boolean | null) {
    if (value === null) return "-";
    return value ? "確認済み" : "未確認";
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  if (!customer) {
    return <div className="p-4 pb-24">顧客情報が見つかりません</div>;
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/customers")}
          className="text-sm text-gray-600 underline"
        >
          ← 顧客一覧に戻る
        </button>

        <div className="flex gap-2">
          <Link
            href={`/customers/${customerId}/edit`}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white"
          >
            編集
          </Link>
          <button
            onClick={handleDeleteCustomer}
            className="rounded bg-red-600 px-3 py-2 text-sm text-white"
          >
            削除
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold">{customer.name}</h1>
        <p className="mt-2 text-sm text-gray-600">電話番号: {customer.phone || "-"}</p>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-bold">初回カウンセリング</h2>

        {intake ? (
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-semibold text-gray-700">アレルギー情報</p>
              <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3">
                {intake.allergy || "-"}
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700">皮膚トラブル</p>
              <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3">
                {intake.skin_trouble || "-"}
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700">体質</p>
              <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3">
                {intake.constitution || "-"}
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700">
                施術NG項目・避けてほしいこと
              </p>
              <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3">
                {intake.avoid_items || "-"}
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700">初回記録の氏名</p>
              <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3">
                {intake.name || "-"}
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700">初回記録の電話番号</p>
              <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3">
                {intake.phone || "-"}
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700">生年月日</p>
              <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3">
                {formatDate(intake.birth_date)}
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700">注意事項確認</p>
              <div className="mt-1 rounded bg-gray-50 p-3 space-y-1">
                <p>体調不良・感染症など: {yesNo(intake.check_health)}</p>
                <p>反応リスク確認: {yesNo(intake.check_reaction)}</p>
                <p>返金ポリシー確認: {yesNo(intake.check_refund)}</p>
                <p>持病・妊娠・服薬申告: {yesNo(intake.check_condition)}</p>
                <p>写真撮影確認: {yesNo(intake.check_photo)}</p>
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700">署名者名</p>
              <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3">
                {intake.signer_name || "-"}
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700">署名</p>
              <div className="mt-1 rounded bg-gray-50 p-3">
                {intake.signature_data_url ? (
                  <img
                    src={intake.signature_data_url}
                    alt="署名"
                    className="max-h-64 w-full rounded border bg-white object-contain"
                  />
                ) : (
                  <div>-</div>
                )}
              </div>
            </div>

            <div>
              <p className="font-semibold text-gray-700">送信日時</p>
              <div className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3">
                {formatDate(intake.submitted_at)}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            初回カウンセリング情報はまだ登録されていません
          </p>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">来店履歴</h2>
          <Link
            href={`/visits/new?customer_id=${customerId}`}
            className="rounded bg-black px-3 py-2 text-sm text-white"
          >
            来店履歴を追加
          </Link>
        </div>

        {visits.length === 0 ? (
          <p className="text-sm text-gray-500">来店履歴はまだありません</p>
        ) : (
          <div className="space-y-3">
            {visits.map((visit) => (
              <div key={visit.id} className="rounded-xl border p-3">
                <p className="text-sm">
                  <span className="font-semibold">来店日:</span>{" "}
                  {formatDate(visit.visit_date)}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">売上:</span>{" "}
                  {visit.price ? `¥${visit.price.toLocaleString()}` : "-"}
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  <span className="font-semibold">メモ:</span> {visit.memo || "-"}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">次回来店日:</span>{" "}
                  {formatDate(visit.next_visit_date)}
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  <span className="font-semibold">次回提案:</span>{" "}
                  {visit.next_proposal || "-"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}