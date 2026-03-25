"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string | null;
};

type Visit = {
  id: string;
  visit_date: string | null;
  price: number | null;
  memo: string | null;
  next_visit_date: string | null;
  next_suggestion: string | null;
  next_proposal: string | null;
};

type LineFollowLog = {
  id: string;
  log_type: "copy" | "open_line" | string;
  filter_type: string | null;
  message_pattern: string | null;
  signature_type: string | null;
  message_body: string | null;
  created_at: string;
};

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [logs, setLogs] = useState<LineFollowLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [openLogId, setOpenLogId] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    fetchCustomerDetail();
  }, [customerId]);

  async function fetchCustomerDetail() {
    setLoading(true);

    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single();

    if (customerError) {
      console.error("customer fetch error:", customerError);
    } else {
      setCustomer(customerData);
    }

    const { data: visitData, error: visitError } = await supabase
      .from("visits")
      .select("*")
      .eq("customer_id", customerId)
      .order("visit_date", { ascending: false });

    if (visitError) {
      console.error("visits fetch error:", visitError);
    } else {
      setVisits(visitData || []);
    }

    const { data: logData, error: logError } = await supabase
      .from("line_follow_logs")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (logError) {
      console.error("line_follow_logs fetch error:", logError);
    } else {
      setLogs(logData || []);
    }

    setLoading(false);
  }

  function formatDate(date: string | null) {
    if (!date) return "-";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("ja-JP");
  }

  function formatDateTime(date: string | null) {
    if (!date) return "-";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("ja-JP");
  }

  function getLogTypeLabel(type: string) {
    if (type === "copy") return "文面コピー";
    if (type === "open_line") return "LINEで開く";
    return type || "-";
  }

  function getFilterLabel(type: string | null) {
    if (type === "follow") return "フォロー必要";
    if (type === "lost") return "失客";
    if (type === "upcoming") return "次回来店予定";
    if (type === "all") return "すべて";
    return type || "-";
  }

  function getPatternLabel(type: string | null) {
    if (type === "simple") return "シンプル";
    if (type === "slot") return "空き枠案内";
    if (type === "coupon") return "クーポン訴求";
    return type || "-";
  }

  function getSignatureLabel(type: string | null) {
    if (type === "shop") return "店舗名";
    if (type === "akane") return "Akane";
    if (type === "marina") return "Marina";
    return type || "-";
  }

  function getProposalText(visit: Visit) {
    return visit.next_proposal || visit.next_suggestion || "-";
  }

  function toggleLog(logId: string) {
    setOpenLogId((prev) => (prev === logId ? null : logId));
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  if (!customer) {
    return <div className="p-4 pb-24">顧客情報が見つかりません</div>;
  }

  return (
    <div className="p-4 pb-24 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            電話番号：{customer.phone || "-"}
          </p>
          <p className="text-sm text-gray-500">
            登録日：{formatDate(customer.created_at)}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href={`/customers/${customer.id}/edit`}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm text-center"
          >
            顧客編集
          </Link>

          <Link
            href={`/visits/new?customer_id=${customer.id}`}
            className="px-4 py-2 rounded-lg border text-sm text-center"
          >
            来店履歴を追加
          </Link>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-bold mb-3">来店履歴</h2>

        {visits.length === 0 ? (
          <div className="border rounded-xl p-4 bg-white text-sm text-gray-500">
            来店履歴はまだありません
          </div>
        ) : (
          <div className="space-y-3">
            {visits.map((visit) => (
              <div
                key={visit.id}
                className="border rounded-xl p-4 bg-white shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold">
                      来店日：{formatDate(visit.visit_date)}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      売上：¥{Number(visit.price || 0).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      次回来店予定：{formatDate(visit.next_visit_date)}
                    </p>
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
                      次回提案：{getProposalText(visit)}
                    </p>
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">
                      メモ：{visit.memo || "-"}
                    </p>
                  </div>

                  <Link
                    href={`/visits/${visit.id}/edit`}
                    className="px-3 py-2 rounded-lg border text-sm shrink-0"
                  >
                    編集
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3">LINEフォロー履歴</h2>

        {logs.length === 0 ? (
          <div className="border rounded-xl p-4 bg-white text-sm text-gray-500">
            送信履歴はまだありません
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const isOpen = openLogId === log.id;

              return (
                <div
                  key={log.id}
                  className="border rounded-xl p-4 bg-white shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">
                        実行日時：{formatDateTime(log.created_at)}
                      </p>
                      <p className="text-sm mt-2">
                        操作：{getLogTypeLabel(log.log_type)}
                      </p>
                      <p className="text-sm">
                        対象：{getFilterLabel(log.filter_type)}
                      </p>
                      <p className="text-sm">
                        文面：{getPatternLabel(log.message_pattern)}
                      </p>
                      <p className="text-sm">
                        署名：{getSignatureLabel(log.signature_type)}
                      </p>
                    </div>

                    <button
                      onClick={() => toggleLog(log.id)}
                      className="px-3 py-2 rounded-lg border text-sm shrink-0"
                    >
                      {isOpen ? "閉じる" : "本文を見る"}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-3 p-3 bg-gray-100 rounded-lg text-sm whitespace-pre-wrap break-words">
                      {log.message_body || "-"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}