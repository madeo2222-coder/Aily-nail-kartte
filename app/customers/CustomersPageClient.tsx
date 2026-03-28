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

type CustomerIntake = {
  id: string | number;
  customer_id: string | null;
  allergy: string | null;
  created_at?: string | null;
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
  allergy: string;
};

type FilterType = "all" | "next" | "follow" | "lost";
type MessagePattern = "simple" | "slot" | "coupon";
type SignatureType = "shop" | "akane" | "marina";

function normalizeFilterValue(value: string | null): FilterType {
  if (value === "next" || value === "upcoming") return "next";
  if (value === "follow") return "follow";
  if (value === "lost") return "lost";
  return "all";
}

export default function CustomersPageClient() {
  const searchParams = useSearchParams();

  const initialFilter = normalizeFilterValue(
    searchParams.get("type") || searchParams.get("filter")
  );

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [customerIntakes, setCustomerIntakes] = useState<CustomerIntake[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const [messagePattern, setMessagePattern] = useState<MessagePattern>("simple");
  const [signatureType, setSignatureType] = useState<SignatureType>("shop");

  useEffect(() => {
    const nextFilter = normalizeFilterValue(
      searchParams.get("type") || searchParams.get("filter")
    );
    setFilter(nextFilter);
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const [customerRes, visitRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, phone, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("visits")
        .select("id, customer_id, visit_date, price, next_visit_date")
        .order("visit_date", { ascending: false }),
    ]);

    if (customerRes.error) {
      console.error("customers fetch error:", customerRes.error);
      setLoading(false);
      return;
    }

    if (visitRes.error) {
      console.error("visits fetch error:", visitRes.error);
      setLoading(false);
      return;
    }

    setCustomers((customerRes.data || []) as Customer[]);
    setVisits((visitRes.data || []) as Visit[]);

    try {
      const intakeRes = await supabase
        .from("customer_intakes")
        .select("*");

      if (intakeRes.error) {
        console.error("customer_intakes fetch error:", intakeRes.error);
        console.error(
          "customer_intakes fetch error detail:",
          JSON.stringify(intakeRes.error, null, 2)
        );
        setCustomerIntakes([]);
      } else {
        const safeIntakes = ((intakeRes.data || []) as any[])
          .filter((item) => item && item.customer_id)
          .map((item) => ({
            id: item.id,
            customer_id: item.customer_id,
            allergy:
              typeof item.allergy === "string" ? item.allergy : null,
            created_at:
              typeof item.created_at === "string" ? item.created_at : null,
          })) as CustomerIntake[];

        setCustomerIntakes(safeIntakes);
      }
    } catch (error) {
      console.error("customer_intakes unexpected error:", error);
      setCustomerIntakes([]);
    }

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
    if (type === "shop") return "Aily Nail Studio";
    if (type === "akane") return "Akane";
    if (type === "marina") return "Marina";
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

  const latestIntakeMap = useMemo(() => {
    const map = new Map<string, CustomerIntake>();

    const sorted = [...customerIntakes].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    for (const intake of sorted) {
      if (!intake.customer_id) continue;
      if (!map.has(intake.customer_id)) {
        map.set(intake.customer_id, intake);
      }
    }

    return map;
  }, [customerIntakes]);

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

      const latestIntake = latestIntakeMap.get(customer.id);
      const allergy =
        latestIntake?.allergy && latestIntake.allergy.trim() !== ""
          ? latestIntake.allergy
          : "なし";

      return {
        id: customer.id,
        name: customer.name || "名前未設定",
        phone: customer.phone || "-",
        created_at: customer.created_at,
        visitCount,
        ltv,
        lastVisitDate,
        nextVisitDate,
        allergy,
      };
    });
  }, [customers, visits, latestIntakeMap]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return customerRows;

    if (filter === "next") {
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">顧客一覧</h1>

        <Link
          href="/customers/new"
          className="rounded-lg bg-black px-4 py-2 text-sm text-white whitespace-nowrap"
        >
          新規顧客追加
        </Link>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
            filter === "all" ? "bg-black text-white" : "bg-white"
          }`}
        >
          すべて
        </button>

        <button
          onClick={() => setFilter("next")}
          className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
            filter === "next" ? "bg-black text-white" : "bg-white"
          }`}
        >
          次回来店予定
        </button>

        <button
          onClick={() => setFilter("follow")}
          className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
            filter === "follow" ? "bg-black text-white" : "bg-white"
          }`}
        >
          フォロー必要
        </button>

        <button
          onClick={() => setFilter("lost")}
          className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
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
              className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
                messagePattern === "simple" ? "bg-black text-white" : "bg-white"
              }`}
            >
              シンプル
            </button>

            <button
              onClick={() => setMessagePattern("slot")}
              className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
                messagePattern === "slot" ? "bg-black text-white" : "bg-white"
              }`}
            >
              空き枠案内
            </button>

            <button
              onClick={() => setMessagePattern("coupon")}
              className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
                messagePattern === "coupon" ? "bg-black text-white" : "bg-white"
              }`}
            >
              クーポン訴求
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setSignatureType("shop")}
              className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
                signatureType === "shop" ? "bg-black text-white" : "bg-white"
              }`}
            >
              店舗名
            </button>

            <button
              onClick={() => setSignatureType("akane")}
              className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
                signatureType === "akane" ? "bg-black text-white" : "bg-white"
              }`}
            >
              Akane
            </button>

            <button
              onClick={() => setSignatureType("marina")}
              className={`rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
                signatureType === "marina" ? "bg-black text-white" : "bg-white"
              }`}
            >
              Marina
            </button>
          </div>

          <div className="text-sm text-gray-500">
            文面：{getPatternLabel(messagePattern)} / 署名：
            {getSignatureLabel(signatureType)}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {filteredRows.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">
            顧客がいません
          </div>
        ) : (
          filteredRows.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border bg-white p-4 shadow-sm"
            >
              <Link href={`/customers/${row.id}`} className="block">
                <div className="mb-3 text-2xl font-bold">{row.name}</div>

                <div className="mb-1 text-base text-gray-500">
                  電話番号：{row.phone}
                </div>
                <div className="mb-1 text-base text-gray-500">
                  アレルギー：{row.allergy}
                </div>
                <div className="mb-1 text-base text-gray-500">
                  来店回数：{row.visitCount}回
                </div>
                <div className="mb-1 text-base text-gray-500">
                  LTV：¥{Number(row.ltv || 0).toLocaleString()}
                </div>
                <div className="mb-1 text-base text-gray-500">
                  最終来店日：{formatDate(row.lastVisitDate)}
                </div>
                <div className="text-base text-gray-500">
                  次回来店日：{formatDate(row.nextVisitDate)}
                </div>
              </Link>

              {showFollowActions && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleCopy(row)}
                    className="rounded-xl border bg-white px-4 py-3 text-sm"
                  >
                    文面コピー
                  </button>

                  <button
                    onClick={() => handleOpenLine(row)}
                    className="rounded-xl bg-black px-4 py-3 text-sm text-white"
                  >
                    LINEで開く
                  </button>
                </div>
              )}

              {showFollowActions && (
                <div className="mt-3 break-all text-xs text-gray-500">
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