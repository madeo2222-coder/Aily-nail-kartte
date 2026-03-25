"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Visit = {
  id: string;
  visit_date: string | null;
  price: number | null;
  next_visit_date: string | null;
  next_proposal: string | null;
  next_suggestion: string | null;
};

type Customer = {
  id: string;
  name?: string | null;
  phone?: string | null;
  created_at?: string | null;
  visits?: Visit[];
};

type FilterType = "all" | "upcoming" | "lost" | "follow";
type MessagePattern = "simple" | "slot" | "coupon";
type SignatureType = "shop" | "akane" | "marina";

function isIgnorableDeleteError(error: any) {
  const message = error?.message || "";
  const code = error?.code || "";

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("Could not find the table") ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("invalid input syntax for type bigint")
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return value;
}

function formatYen(value: number) {
  return `¥${value.toLocaleString()}`;
}

function daysSince(dateStr: string | null) {
  if (!dateStr) return null;

  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return null;

  const today = new Date();
  const base = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();

  return Math.floor((base - target) / (1000 * 60 * 60 * 24));
}

function calcStats(customer: Customer) {
  const visits = [...(customer.visits || [])];

  const sortedByVisitDateDesc = visits.sort((a, b) =>
    (b.visit_date || "").localeCompare(a.visit_date || "")
  );

  const visitCount = visits.length;
  const lastVisit = sortedByVisitDateDesc[0]?.visit_date || null;

  const nextVisitCandidates = visits
    .map((v) => v.next_visit_date)
    .filter((v): v is string => !!v)
    .sort((a, b) => a.localeCompare(b));

  const nextVisit = nextVisitCandidates[0] || null;

  const ltv = visits.reduce((sum, visit) => sum + (visit.price || 0), 0);

  const nextProposalVisit = sortedByVisitDateDesc.find(
    (v) =>
      (v.next_proposal && v.next_proposal.trim()) ||
      (v.next_suggestion && v.next_suggestion.trim())
  );

  const nextProposal =
    nextProposalVisit?.next_proposal ||
    nextProposalVisit?.next_suggestion ||
    null;

  return {
    visitCount,
    lastVisit,
    nextVisit,
    ltv,
    nextProposal,
  };
}

function isLostCustomer(stats: ReturnType<typeof calcStats>) {
  if (!stats.lastVisit) return false;
  if (stats.nextVisit) return false;

  const passedDays = daysSince(stats.lastVisit);
  if (passedDays === null) return false;

  return passedDays >= 30;
}

function isFollowCustomer(stats: ReturnType<typeof calcStats>) {
  if (!stats.lastVisit) return false;
  if (stats.nextVisit) return false;

  const passedDays = daysSince(stats.lastVisit);
  if (passedDays === null) return false;

  return passedDays >= 0 && passedDays < 30;
}

function isUpcomingCustomer(stats: ReturnType<typeof calcStats>) {
  return !!stats.nextVisit;
}

function getSignature(signatureType: SignatureType) {
  if (signatureType === "akane") {
    return `

担当：Akane
Aily Nail Studio
ご予約・ご相談はこのLINEにそのままご返信ください。`;
  }

  if (signatureType === "marina") {
    return `

担当：Marina
Aily Nail Studio
ご予約・ご相談はこのLINEにそのままご返信ください。`;
  }

  return `

Aily Nail Studio
ご予約・ご相談はこのLINEにそのままご返信ください。`;
}

function buildFollowSimpleMessage(
  customer: Customer,
  stats: ReturnType<typeof calcStats>,
  signatureType: SignatureType
) {
  const name = customer.name || "お客様";
  const lastVisit = stats.lastVisit || "不明";
  const proposal = stats.nextProposal || "ご都合に合わせてご提案します";

  return `${name}さま

こんにちは、Aily Nail Studioです。
前回のご来店ありがとうございました。

最終来店日：${lastVisit}
次回ご提案：${proposal}

その後お爪の状態はいかがでしょうか？
そろそろ次回メンテナンスのタイミングでしたら、
ご希望日時に合わせてご案内できます。

ご都合の良い日があれば、お気軽にLINEください。${getSignature(signatureType)}`;
}

function buildFollowSlotMessage(
  customer: Customer,
  stats: ReturnType<typeof calcStats>,
  signatureType: SignatureType
) {
  const name = customer.name || "お客様";
  const proposal = stats.nextProposal || "次回デザインもご提案できます";

  return `${name}さま

こんにちは、Aily Nail Studioです。

近日の空き枠でご案内しやすい日時があります。
もし次回ネイルをご検討中でしたら、スムーズにご予約をお取りできます。

次回ご提案：${proposal}

ご希望の曜日や時間帯があれば、
このLINEにそのまま返信ください。${getSignature(signatureType)}`;
}

function buildFollowCouponMessage(
  customer: Customer,
  stats: ReturnType<typeof calcStats>,
  signatureType: SignatureType
) {
  const name = customer.name || "お客様";
  const proposal = stats.nextProposal || "次回メニューをご提案できます";

  return `${name}さま

こんにちは、Aily Nail Studioです。

次回ご来店をご検討いただける方向けに、
このタイミングでご案内しやすいメニューがあります。

次回ご提案：${proposal}

詳細はご希望内容に合わせてご案内しますので、
気になる方はこのLINEへお気軽にご返信ください。${getSignature(signatureType)}`;
}

function buildLostSimpleMessage(
  customer: Customer,
  stats: ReturnType<typeof calcStats>,
  signatureType: SignatureType
) {
  const name = customer.name || "お客様";
  const lastVisit = stats.lastVisit || "不明";
  const proposal = stats.nextProposal || "お好みに合わせてご提案します";

  return `${name}さま

こんにちは、Aily Nail Studioです。
以前はご来店いただきありがとうございました。

最終来店日：${lastVisit}
次回おすすめ：${proposal}

最近お会いできていなかったので、ご様子が気になりご連絡しました。
またタイミングが合う際はぜひお任せください。${getSignature(signatureType)}`;
}

function buildLostSlotMessage(
  customer: Customer,
  stats: ReturnType<typeof calcStats>,
  signatureType: SignatureType
) {
  const name = customer.name || "お客様";
  const proposal =
    stats.nextProposal || "季節に合わせたデザインもご提案できます";

  return `${name}さま

こんにちは、Aily Nail Studioです。

最近ご来店が空いていたので、ご連絡しました。
直近でご案内しやすい空き枠もあります。

次回おすすめ：${proposal}

もしまたネイルをされるタイミングでしたら、
ご希望日時をこのLINEに送っていただければ調整いたします。${getSignature(signatureType)}`;
}

function buildLostCouponMessage(
  customer: Customer,
  stats: ReturnType<typeof calcStats>,
  signatureType: SignatureType
) {
  const name = customer.name || "お客様";
  const proposal =
    stats.nextProposal || "お好みに合わせたメニューをご提案できます";

  return `${name}さま

こんにちは、Aily Nail Studioです。

少しお久しぶりでしたので、ご連絡しました。
またご来店いただきやすいよう、内容に合わせてご案内できるメニューもあります。

次回おすすめ：${proposal}

気になるデザインやご希望があれば、
このLINEからお気軽にご相談ください。${getSignature(signatureType)}`;
}

function buildLineMessage(
  customer: Customer,
  stats: ReturnType<typeof calcStats>,
  pattern: MessagePattern,
  signatureType: SignatureType
) {
  const lost = isLostCustomer(stats);

  if (lost) {
    if (pattern === "slot") {
      return buildLostSlotMessage(customer, stats, signatureType);
    }
    if (pattern === "coupon") {
      return buildLostCouponMessage(customer, stats, signatureType);
    }
    return buildLostSimpleMessage(customer, stats, signatureType);
  }

  if (pattern === "slot") {
    return buildFollowSlotMessage(customer, stats, signatureType);
  }
  if (pattern === "coupon") {
    return buildFollowCouponMessage(customer, stats, signatureType);
  }
  return buildFollowSimpleMessage(customer, stats, signatureType);
}

export default function CustomersPage() {
  const searchParams = useSearchParams();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [messagePattern, setMessagePattern] =
    useState<MessagePattern>("simple");
  const [signatureType, setSignatureType] = useState<SignatureType>("shop");

  useEffect(() => {
    const raw = searchParams.get("filter");
    if (
      raw === "lost" ||
      raw === "upcoming" ||
      raw === "all" ||
      raw === "follow"
    ) {
      setFilter(raw);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    setLoading(true);

    const { data, error } = await supabase
      .from("customers")
      .select(
        `
        id,
        name,
        phone,
        created_at,
        visits (
          id,
          visit_date,
          price,
          next_visit_date,
          next_proposal,
          next_suggestion
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("customers fetch error:", error);
      setCustomers([]);
      setLoading(false);
      return;
    }

    setCustomers((data as Customer[]) || []);
    setLoading(false);
  }

  async function safeDeleteByCustomerId(tableName: string, customerId: string) {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("customer_id", customerId);

    if (error && !isIgnorableDeleteError(error)) {
      throw error;
    }
  }

  async function safeDeleteByPhone(tableName: string, phone: string) {
    const { error } = await supabase.from(tableName).delete().eq("phone", phone);

    if (error && !isIgnorableDeleteError(error)) {
      throw error;
    }
  }

  async function saveLineFollowLog(
    customer: Customer,
    logType: "copy" | "open_line",
    messageBody: string
  ) {
    const { error } = await supabase.from("line_follow_logs").insert({
      customer_id: customer.id,
      log_type: logType,
      filter_type: filter,
      message_pattern: messagePattern,
      signature_type: signatureType,
      message_body: messageBody,
    });

    if (error) {
      console.error("line_follow_logs insert error:", error);
    }
  }

  async function handleDelete(customer: Customer) {
    const confirmed = window.confirm(
      `「${customer.name || "名称未設定"}」を削除しますか？\nこの操作は元に戻せません。`
    );

    if (!confirmed) return;

    try {
      setDeletingId(customer.id);

      if (customer.phone) {
        await safeDeleteByPhone("customer_intakes", customer.phone);
        await safeDeleteByPhone("customer_intake", customer.phone);
      }

      await safeDeleteByCustomerId("visits", customer.id);
      await safeDeleteByCustomerId("reservations", customer.id);
      await safeDeleteByCustomerId("customer_intakes", customer.id);
      await safeDeleteByCustomerId("customer_intake", customer.id);

      const { error: customerDeleteError } = await supabase
        .from("customers")
        .delete()
        .eq("id", customer.id);

      if (customerDeleteError) {
        console.error("customer delete error:", customerDeleteError);
        alert(`削除に失敗しました。\n${customerDeleteError.message}`);
        return;
      }

      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      alert("削除しました。");
    } catch (error: any) {
      console.error("delete failed:", error);
      alert(`削除に失敗しました。\n${error?.message || "不明なエラー"}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCopyLineMessage(customer: Customer) {
    const stats = calcStats(customer);
    const message = buildLineMessage(
      customer,
      stats,
      messagePattern,
      signatureType
    );

    try {
      await navigator.clipboard.writeText(message);
      await saveLineFollowLog(customer, "copy", message);
      alert("LINE文面をコピーしました");
    } catch (error) {
      console.error(error);
      alert("コピーに失敗しました");
    }
  }

  async function handleOpenLineShare(customer: Customer) {
    const stats = calcStats(customer);
    const message = buildLineMessage(
      customer,
      stats,
      messagePattern,
      signatureType
    );

    await saveLineFollowLog(customer, "open_line", message);

    const url = `https://line.me/R/share?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const stats = calcStats(customer);

      if (filter === "upcoming") return isUpcomingCustomer(stats);
      if (filter === "lost") return isLostCustomer(stats);
      if (filter === "follow") return isFollowCustomer(stats);
      return true;
    });
  }, [customers, filter]);

  function getPatternLabel() {
    if (messagePattern === "slot") return "空き枠案内";
    if (messagePattern === "coupon") return "クーポン訴求";
    return "シンプル";
  }

  function getSignatureLabel() {
    if (signatureType === "akane") return "Akane";
    if (signatureType === "marina") return "Marina";
    return "Aily Nail Studio";
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-6 text-3xl font-bold">顧客一覧</h1>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Link
          href="/customers/new"
          className="block rounded-xl bg-black px-4 py-4 text-center text-xl font-bold text-white"
        >
          ＋ 顧客登録
        </Link>

        <button
          type="button"
          onClick={() => setFilter("follow")}
          className={`block rounded-xl px-4 py-4 text-center text-lg font-bold ${
            filter === "follow"
              ? "bg-black text-white"
              : "border border-gray-300 bg-white text-gray-800"
          }`}
        >
          フォロー必要
        </button>

        <button
          type="button"
          onClick={() => setFilter("lost")}
          className={`block rounded-xl px-4 py-4 text-center text-lg font-bold ${
            filter === "lost"
              ? "bg-black text-white"
              : "border border-gray-300 bg-white text-gray-800"
          }`}
        >
          失客注意
        </button>

        <button
          type="button"
          onClick={() => setFilter("upcoming")}
          className={`block rounded-xl px-4 py-4 text-center text-lg font-bold ${
            filter === "upcoming"
              ? "bg-black text-white"
              : "border border-gray-300 bg-white text-gray-800"
          }`}
        >
          次回来店予定
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-lg px-3 py-2 text-sm font-bold ${
            filter === "all"
              ? "bg-black text-white"
              : "border border-gray-300 bg-white"
          }`}
        >
          すべて
        </button>

        <button
          type="button"
          onClick={() => setFilter("follow")}
          className={`rounded-lg px-3 py-2 text-sm font-bold ${
            filter === "follow"
              ? "bg-black text-white"
              : "border border-gray-300 bg-white"
          }`}
        >
          フォロー必要
        </button>

        <button
          type="button"
          onClick={() => setFilter("upcoming")}
          className={`rounded-lg px-3 py-2 text-sm font-bold ${
            filter === "upcoming"
              ? "bg-black text-white"
              : "border border-gray-300 bg-white"
          }`}
        >
          来店予定あり
        </button>

        <button
          type="button"
          onClick={() => setFilter("lost")}
          className={`rounded-lg px-3 py-2 text-sm font-bold ${
            filter === "lost"
              ? "bg-black text-white"
              : "border border-gray-300 bg-white"
          }`}
        >
          失客注意
        </button>
      </div>

      {(filter === "follow" || filter === "lost") && (
        <div className="mb-4 space-y-4 rounded-2xl border bg-white p-4">
          <div>
            <p className="mb-3 text-sm font-bold text-gray-700">
              LINE文面パターン：{getPatternLabel()}
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMessagePattern("simple")}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  messagePattern === "simple"
                    ? "bg-black text-white"
                    : "border border-gray-300 bg-white"
                }`}
              >
                シンプル
              </button>

              <button
                type="button"
                onClick={() => setMessagePattern("slot")}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  messagePattern === "slot"
                    ? "bg-black text-white"
                    : "border border-gray-300 bg-white"
                }`}
              >
                空き枠案内
              </button>

              <button
                type="button"
                onClick={() => setMessagePattern("coupon")}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  messagePattern === "coupon"
                    ? "bg-black text-white"
                    : "border border-gray-300 bg-white"
                }`}
              >
                クーポン訴求
              </button>
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-bold text-gray-700">
              署名：{getSignatureLabel()}
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSignatureType("shop")}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  signatureType === "shop"
                    ? "bg-black text-white"
                    : "border border-gray-300 bg-white"
                }`}
              >
                店舗名
              </button>

              <button
                type="button"
                onClick={() => setSignatureType("akane")}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  signatureType === "akane"
                    ? "bg-black text-white"
                    : "border border-gray-300 bg-white"
                }`}
              >
                Akane
              </button>

              <button
                type="button"
                onClick={() => setSignatureType("marina")}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  signatureType === "marina"
                    ? "bg-black text-white"
                    : "border border-gray-300 bg-white"
                }`}
              >
                Marina
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p>読み込み中...</p>
      ) : filteredCustomers.length === 0 ? (
        <div className="rounded-xl border bg-white p-4">
          <p>該当する顧客データがありません。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCustomers.map((customer) => {
            const stats = calcStats(customer);
            const lost = isLostCustomer(stats);
            const upcoming = isUpcomingCustomer(stats);
            const follow = isFollowCustomer(stats);

            return (
              <div key={customer.id} className="rounded-2xl border bg-white p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="mb-2 text-sm text-gray-500">名前</p>
                    <p className="break-words text-2xl font-bold">
                      {customer.name || "未入力"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 text-right">
                    {upcoming && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                        来店予定あり
                      </span>
                    )}
                    {follow && (
                      <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-bold text-amber-700">
                        フォロー必要
                      </span>
                    )}
                    {lost && (
                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                        失客注意
                      </span>
                    )}
                  </div>
                </div>

                <p className="mb-2 text-sm text-gray-500">電話番号</p>
                <p className="mb-6 break-all text-2xl font-bold">
                  {customer.phone || "未入力"}
                </p>

                <div className="mb-6 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4 text-sm">
                  <div>
                    <p className="text-gray-500">来店回数</p>
                    <p className="mt-1 text-lg font-bold">{stats.visitCount}回</p>
                  </div>

                  <div>
                    <p className="text-gray-500">LTV</p>
                    <p className="mt-1 text-lg font-bold">
                      {formatYen(stats.ltv)}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-500">最終来店日</p>
                    <p className="mt-1 text-base font-bold">
                      {formatDate(stats.lastVisit)}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-500">次回来店日</p>
                    <p className="mt-1 text-base font-bold">
                      {formatDate(stats.nextVisit)}
                    </p>
                  </div>
                </div>

                {(lost || follow) && (
                  <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="mb-2 text-sm font-bold text-emerald-700">
                      {lost ? "LINE掘り起こしフォロー" : "LINE再来店フォロー"}
                    </p>
                    <p className="mb-1 text-sm text-gray-700">
                      {lost
                        ? "失客注意向けの文面でLINE共有画面を開けます"
                        : "フォロー必要向けの文面でLINE共有画面を開けます"}
                    </p>
                    <p className="mb-1 text-xs text-gray-500">
                      現在の文面パターン：{getPatternLabel()}
                    </p>
                    <p className="mb-3 text-xs text-gray-500">
                      現在の署名：{getSignatureLabel()}
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleCopyLineMessage(customer)}
                        className="rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-bold text-emerald-700"
                      >
                        文面コピー
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenLineShare(customer)}
                        className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white"
                      >
                        LINEで開く
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="rounded-xl border px-4 py-4 text-center text-xl font-bold"
                  >
                    詳細を見る
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleDelete(customer)}
                    disabled={deletingId === customer.id}
                    className="rounded-xl border border-red-300 px-4 py-4 text-center text-xl font-bold text-red-600 disabled:opacity-50"
                  >
                    {deletingId === customer.id ? "削除中..." : "削除"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}