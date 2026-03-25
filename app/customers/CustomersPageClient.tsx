"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
  created_at: string | null;
};

type Visit = {
  id: string;
  customer_id: string;
  visit_date: string | null;
  price: number | null;
  next_visit_date: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  created_at: string | null;
  visitCount: number;
  ltv: number;
  lastVisitDate: string | null;
  nextVisitDate: string | null;
};

type FilterType = "all" | "upcoming" | "follow" | "lost";
type MessagePattern = "simple" | "slot" | "coupon";
type SignatureType = "shop" | "akane" | "marina";

export default function CustomersPageClient() {
  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get("filter") || "all") as FilterType;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const [messagePattern, setMessagePattern] = useState<MessagePattern>("simple");
  const [signatureType, setSignatureType] = useState<SignatureType>("shop");

  useEffect(() => {
    const nextFilter = (searchParams.get("filter") || "all") as FilterType;
    setFilter(nextFilter);
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("id, name, phone, created_at")
      .order("created_at", { ascending: false });

    if (customerError) {
      console.error("customers fetch error:", customerError);
      setLoading(false);
      return;
    }

    const { data: visitData, error: visitError } = await supabase
      .from("visits")
      .select("id, customer_id, visit_date, price, next_visit_date")
      .order("visit_date", { ascending: false });

    if (visitError) {
      console.error("visits fetch error:", visitError);
      setLoading(false);
      return;
    }

    setCustomers(customerData || []);
    setVisits(visitData || []);
    setLoading(false);
  }

  function diffDaysFromToday(dateStr: string | null) {
    if (!dateStr) return null;

    const today = new Date();
    const baseToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const target = new Date(dateStr);
    if (Number.isNaN(target.getTime())) return null;

    const baseTarget = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate()
    );

    const diffMs = baseToday.getTime() - baseTarget.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  function formatDate(date: string | null) {
    if (!date) return "-";

    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "-";

    return d.toLocaleDateString("ja-JP");
  }

  function normalizePhone(phone: string) {
    const raw = (phone || "").trim();
    if (!raw) return "";

    if (raw.startsWith("+81")) return raw;

    const digits = raw.replace(/[^\d]/g, "");
    if (digits.startsWith("0")) {
      return `+81${digits.slice(1)}`;
    }

    return raw;
  }

  function getSignatureLabel(type: SignatureType) {
    if (type === "shop") return "店舗名";
    if (type === "akane") return "Akane";
    if (type === "marina") return "Marina";
    return type;
  }

  function getSignatureText(type: SignatureType) {
    if (type === "shop") {
      return "Aily Nail Studio";
    }
    if (type === "akane") {
      return "Akane";
    }
    if (type === "marina") {
      return "Marina";
    }
    return "Aily Nail Studio";
  }

  function getPatternLabel(pattern: MessagePattern) {
    if (pattern === "simple") return "シンプル";
    if (pattern === "slot") return "空き枠案内";
    if (pattern === "coupon") return "クーポン訴求";
    return pattern;
  }

  function buildMessage(
    customerName: string,
    currentFilter: FilterType,
    pattern: MessagePattern,
    signature: SignatureType
  ) {
    const name = customerName || "お客様";
    const sign = getSignatureText(signature);

    if (currentFilter === "follow") {
      if (pattern === "simple") {
        return `${name}様

こんにちは、${sign}です。
その後お爪の状態はいかがでしょうか？

前回ご来店から少しお時間が経ちましたので、
そろそろメンテナンス時期かなと思いご連絡しました。

ご都合よいタイミングがあれば、
ぜひご予約お待ちしております。`;
      }

      if (pattern === "slot") {
        return `${name}様

こんにちは、${sign}です。
今週〜来週でご案内しやすいお時間がございます。

メンテナンスご希望でしたら
ご希望日時をいくつか送っていただければ調整いたします。

お気軽にご連絡ください。`;
      }

      return `${name}様

こんにちは、${sign}です。
ご来店のお礼を込めて、
次回ご利用しやすいご案内をしております。

そろそろ付け替え・メンテナンスの時期でしたら
ぜひお気軽にご予約ください。`;
    }

    if (currentFilter === "lost") {
      if (pattern === "simple") {
        return `${name}様

ご無沙汰しております、${sign}です。
以前はご来店いただきありがとうございました。

またネイルをされるタイミングがありましたら、
ぜひお任せいただけると嬉しいです。

いつでもご予約お待ちしております。`;
      }

      if (pattern === "slot") {
        return `${name}様

ご無沙汰しております、${sign}です。
最近ご案内しやすいお時間帯が出ております。

もしまたネイルをされる機会がありましたら、
ご希望日時だけでもお気軽にご連絡ください。`;
      }

      return `${name}様

ご無沙汰しております、${sign}です。
感謝の気持ちを込めて、
久しぶりのご来店でもご利用しやすいご案内をしております。

またお会いできるのを楽しみにしております。`;
    }

    return `${name}様

こんにちは、${sign}です。
ご予約・ご来店お待ちしております。`;
  }

  async function saveLineFollowLog(params: {
    customerId: string;
    logType: "copy" | "open_line";
    filterType: FilterType;
    messageBody: string;
  }) {
    const { customerId, logType, filterType, messageBody } = params;

    const { error } = await supabase.from("line_follow_logs").insert([
      {
        customer_id: customerId,
        log_type: logType,
        filter_type: filterType,
        message_pattern: messagePattern,
        signature_type: signatureType,
        message_body: messageBody,
      },
    ]);

    if (error) {
      console.error("line_follow_logs insert error:", error);
    }
  }

  async function handleCopy(customer: CustomerRow) {
    try {
      const message = buildMessage(
        customer.name,
        filter,
        messagePattern,
        signatureType
      );

      await navigator.clipboard.writeText(message);

      if (filter === "follow" || filter === "lost") {
        await saveLineFollowLog({
          customerId: customer.id,
          logType: "copy",
          filterType: filter,
          messageBody: message,
        });
      }

      alert("文面をコピーしました");
    } catch (error) {
      console.error(error);
      alert("コピーに失敗しました");
    }
  }

  async function handleOpenLine(customer: CustomerRow) {
    try {
      const message = buildMessage(
        customer.name,
        filter,
        messagePattern,
        signatureType
      );

      if (filter === "follow" || filter === "lost") {
        await saveLineFollowLog({
          customerId: customer.id,
          logType: "open_line",
          filterType: filter,
          messageBody: message,
        });
      }

      const encoded = encodeURIComponent(message);
      const url = `https://line.me/R/msg/text/?${encoded}`;
      window.open(url, "_blank");
    } catch (error) {
      console.error(error);
      alert("LINEを開けませんでした");
    }
  }

  const customerRows = useMemo<CustomerRow[]>(() => {
    return customers.map((customer) => {
      const customerVisits = visits.filter((v) => v.customer_id === customer.id);

      const visitCount = customerVisits.length;
      const ltv = customerVisits.reduce((sum, v) => {
        return sum + Number(v.price || 0);
      }, 0);

      const sortedByVisitDate = [...customerVisits].sort((a, b) => {
        const aTime = a.visit_date ? new Date(a.visit_date).getTime() : 0;
        const bTime = b.visit_date ? new Date(b.visit_date).getTime() : 0;
        return bTime - aTime;
      });

      const lastVisitDate =
        sortedByVisitDate.length > 0 ? sortedByVisitDate[0].visit_date : null;

      const futureNextVisitDates = customerVisits
        .map((v) => v.next_visit_date)
        .filter((d): d is string => !!d)
        .sort((a, b) => {
          return new Date(a).getTime() - new Date(b).getTime();
        });

      const nextVisitDate =
        futureNextVisitDates.length > 0 ? futureNextVisitDates[0] : null;

      return {
        id: customer.id,
        name: customer.name || "名前未設定",
        phone: customer.phone || "-",
        created_at: customer.created_at,
        visitCount,
        ltv,
        lastVisitDate,
        nextVisitDate,
      };
    });
  }, [customers, visits]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return customerRows;

    if (filter === "upcoming") {
      return customerRows.filter((row) => !!row.nextVisitDate);
    }

    if (filter === "follow") {
      return customerRows.filter((row) => {
        const days = diffDaysFromToday(row.lastVisitDate);
        return days !== null && days < 30 && !row.nextVisitDate;
      });
    }

    if (filter === "lost") {
      return customerRows.filter((row) => {
        const days = diffDaysFromToday(row.lastVisitDate);
        return days !== null && days >= 30 && !row.nextVisitDate;
      });
    }

    return customerRows;
  }, [customerRows, filter]);

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  const showFollowActions = filter === "follow" || filter === "lost";

  return (
    <div className="p-4 pb-24">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-xl font-bold">顧客一覧</h1>

        <Link
          href="/customers/new"
          className="px-4 py-2 rounded-lg bg-black text-white text-sm whitespace-nowrap"
        >
          新規顧客追加
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto mb-4">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap ${
            filter === "all" ? "bg-black text-white" : "bg-white"
          }`}
        >
          すべて
        </button>

        <button
          onClick={() => setFilter("upcoming")}
          className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap ${
            filter === "upcoming" ? "bg-black text-white" : "bg-white"
          }`}
        >
          次回来店予定
        </button>

        <button
          onClick={() => setFilter("follow")}
          className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap ${
            filter === "follow" ? "bg-black text-white" : "bg-white"
          }`}
        >
          フォロー必要
        </button>

        <button
          onClick={() => setFilter("lost")}
          className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap ${
            filter === "lost" ? "bg-black text-white" : "bg-white"
          }`}
        >
          失客
        </button>
      </div>

      {showFollowActions && (
        <div className="mb-4 space-y-3">
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setMessagePattern("simple")}
              className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap ${
                messagePattern === "simple" ? "bg-black text-white" : "bg-white"
              }`}
            >
              シンプル
            </button>

            <button
              onClick={() => setMessagePattern("slot")}
              className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap ${
                messagePattern === "slot" ? "bg-black text-white" : "bg-white"
              }`}
            >
              空き枠案内
            </button>

            <button
              onClick={() => setMessagePattern("coupon")}
              className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap ${
                messagePattern === "coupon" ? "bg-black text-white" : "bg-white"
              }`}
            >
              クーポン訴求
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setSignatureType("shop")}
              className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap ${
                signatureType === "shop" ? "bg-black text-white" : "bg-white"
              }`}
            >
              店舗名
            </button>

            <button
              onClick={() => setSignatureType("akane")}
              className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap ${
                signatureType === "akane" ? "bg-black text-white" : "bg-white"
              }`}
            >
              Akane
            </button>

            <button
              onClick={() => setSignatureType("marina")}
              className={`px-4 py-2 rounded-full border text-sm whitespace-nowrap ${
                signatureType === "marina" ? "bg-black text-white" : "bg-white"
              }`}
            >
              Marina
            </button>
          </div>

          <div className="text-sm text-gray-500">
            文面：{getPatternLabel(messagePattern)} / 署名：{getSignatureLabel(signatureType)}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {filteredRows.length === 0 ? (
          <div className="border rounded-xl p-4 bg-white text-sm text-gray-500">
            顧客がいません
          </div>
        ) : (
          filteredRows.map((row) => (
            <div
              key={row.id}
              className="border rounded-2xl p-4 bg-white shadow-sm"
            >
              <Link href={`/customers/${row.id}`} className="block">
                <div className="font-bold text-2xl mb-3">{row.name}</div>

                <div className="text-gray-500 text-base mb-1">
                  電話番号：{row.phone}
                </div>
                <div className="text-gray-500 text-base mb-1">
                  来店回数：{row.visitCount}回
                </div>
                <div className="text-gray-500 text-base mb-1">
                  LTV：¥{Number(row.ltv || 0).toLocaleString()}
                </div>
                <div className="text-gray-500 text-base mb-1">
                  最終来店日：{formatDate(row.lastVisitDate)}
                </div>
                <div className="text-gray-500 text-base">
                  次回来店日：{formatDate(row.nextVisitDate)}
                </div>
              </Link>

              {showFollowActions && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleCopy(row)}
                    className="px-4 py-3 rounded-xl border text-sm bg-white"
                  >
                    文面コピー
                  </button>

                  <button
                    onClick={() => handleOpenLine(row)}
                    className="px-4 py-3 rounded-xl bg-black text-white text-sm"
                  >
                    LINEで開く
                  </button>
                </div>
              )}

              {showFollowActions && (
                <div className="mt-3 text-xs text-gray-500 break-all">
                  宛先目安：{normalizePhone(row.phone) || "電話番号未設定"}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}