"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function normalizePhone(phone: string | null | undefined) {
  return (phone || "").replace(/-/g, "").replace(/\s/g, "").trim();
}

function normalizeName(name: string | null | undefined) {
  return (name || "").replace(/\s/g, "").trim();
}

export default function CustomerDetailPage() {
  const params = useParams();
  const id = params?.id;

  const [customer, setCustomer] = useState<any>(null);
  const [intake, setIntake] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchData();
  }, [id]);

  async function fetchData() {
    setLoading(true);

    // 顧客取得
    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();

    if (customerError || !customerData) {
      setCustomer(null);
      setIntake(null);
      setLoading(false);
      return;
    }

    setCustomer(customerData);

    let foundIntake: any = null;

    // ① customer_id で探す
    const { data: intakeByCustomerId } = await supabase
      .from("customer_intakes")
      .select("*")
      .eq("customer_id", customerData.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intakeByCustomerId) {
      foundIntake = intakeByCustomerId;
    } else {
      // ② phone で探す（ハイフン違い吸収）
      const normalizedCustomerPhone = normalizePhone(customerData.phone);

      if (normalizedCustomerPhone) {
        const { data: intakeListByPhone } = await supabase
          .from("customer_intakes")
          .select("*")
          .order("created_at", { ascending: false });

        if (intakeListByPhone && intakeListByPhone.length > 0) {
          foundIntake =
            intakeListByPhone.find((row: any) => {
              const rowPhone = normalizePhone(row.phone);
              return rowPhone === normalizedCustomerPhone;
            }) || null;
        }
      }
    }

    if (!foundIntake) {
      // ③ name で探す（スペース違い吸収）
      const normalizedCustomerName = normalizeName(customerData.name);

      if (normalizedCustomerName) {
        const { data: intakeListByName } = await supabase
          .from("customer_intakes")
          .select("*")
          .order("created_at", { ascending: false });

        if (intakeListByName && intakeListByName.length > 0) {
          foundIntake =
            intakeListByName.find((row: any) => {
              const rowName = normalizeName(row.name);
              return rowName === normalizedCustomerName;
            }) || null;
        }
      }
    }

    setIntake(foundIntake);
    setLoading(false);
  }

  if (loading) return <div className="p-4">読み込み中...</div>;
  if (!customer) return <div className="p-4">顧客情報が見つかりません</div>;

  return (
    <div className="p-4 space-y-6">
      {/* 基本情報 */}
      <div className="rounded-3xl border p-5 bg-white">
        <h2 className="text-xl font-bold mb-3">基本情報</h2>

        <p>名前：{customer.name}</p>
        <p>電話番号：{customer.phone}</p>
      </div>

      {/* 初回受付情報 */}
      <div className="rounded-3xl border p-5 bg-white">
        <h2 className="text-xl font-bold mb-3">初回受付情報</h2>

        {intake ? (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-gray-500">アレルギー・体質</p>
              <p className="text-base whitespace-pre-wrap">
                {intake.allergy || "なし"}
              </p>
            </div>

            <div>
              <p className="text-gray-500">施術NG項目</p>
              <p className="text-base whitespace-pre-wrap">
                {intake.ng_items || "なし"}
              </p>
            </div>

            <div>
              <p className="text-gray-500">注意事項確認</p>
              <p className="text-base">
                {intake.agreed
                  ? Object.values(intake.agreed).every(Boolean)
                    ? "全て確認済み"
                    : "一部未確認"
                  : "未確認"}
              </p>
            </div>

            <div>
              <p className="text-gray-500">署名</p>
              <p className="text-base">{intake.signature_name || "あり"}</p>
            </div>

            <div>
              <p className="text-gray-500">受付日時</p>
              <p className="text-base">
                {intake.created_at
                  ? new Date(intake.created_at).toLocaleString("ja-JP")
                  : "-"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">初回受付情報はありません</p>
        )}
      </div>
    </div>
  );
}