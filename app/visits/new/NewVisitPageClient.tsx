"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
};

type PaymentLine = {
  id: string;
  payment_method: string;
  amount: string;
};

const PAYMENT_METHOD_OPTIONS = [
  "現金",
  "クレジットカード",
  "PayPay",
  "交通系IC",
  "iD",
  "QUICPay",
  "楽天Edy",
  "WAON",
  "nanaco",
  "UnionPay（銀聯）",
  "Discover",
  "ホットペッパーポイント",
  "割引",
  "その他",
];

function createLineId() {
  return `payment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createPaymentLine(method = "現金", amount = ""): PaymentLine {
  return {
    id: createLineId(),
    payment_method: method,
    amount,
  };
}

function toSafeNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isDiscountMethod(method: string) {
  return method.trim() === "割引";
}

function formatAmountPreview(value: string) {
  const amount = toSafeNumber(value);
  if (!Number.isFinite(amount)) return "未入力";
  return `${amount.toLocaleString("ja-JP")}`;
}

export default function NewVisitPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const preselectedCustomerId = searchParams.get("customer_id") || "";
  const prefilledReservationId = searchParams.get("reservation_id") || "";
  const prefilledVisitDate = searchParams.get("visit_date") || "";
  const prefilledMenuName = searchParams.get("menu_name") || "";
  const prefilledStaffName = searchParams.get("staff_name") || "";
  const prefilledMemo = searchParams.get("memo") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  const [customerId, setCustomerId] = useState(preselectedCustomerId);
  const [visitDate, setVisitDate] = useState(
    prefilledVisitDate || new Date().toISOString().split("T")[0]
  );
  const [menuName, setMenuName] = useState(prefilledMenuName);
  const [price, setPrice] = useState("");
  const [memo, setMemo] = useState(prefilledMemo);
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextProposal, setNextProposal] = useState("");
  const [staffName, setStaffName] = useState(prefilledStaffName);

  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    createPaymentLine("現金", ""),
  ]);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (preselectedCustomerId) {
      setCustomerId(preselectedCustomerId);
    }
    if (prefilledVisitDate) {
      setVisitDate(prefilledVisitDate);
    }
    if (prefilledMenuName) {
      setMenuName(prefilledMenuName);
    }
    if (prefilledStaffName) {
      setStaffName(prefilledStaffName);
    }
    if (prefilledMemo) {
      setMemo(prefilledMemo);
    }
  }, [
    preselectedCustomerId,
    prefilledVisitDate,
    prefilledMenuName,
    prefilledStaffName,
    prefilledMemo,
  ]);

  async function fetchCustomers() {
    setLoadingCustomers(true);

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone")
      .order("name", { ascending: true });

    if (error) {
      console.error("customers取得エラー:", error);
      setMessage("顧客一覧の取得に失敗しました");
      setLoadingCustomers(false);
      return;
    }

    setCustomers(data || []);
    setLoadingCustomers(false);
  }

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === customerId) || null;
  }, [customers, customerId]);

  const totalPrice = useMemo(() => {
    return toSafeNumber(price);
  }, [price]);

  const paymentTotal = useMemo(() => {
    return paymentLines.reduce((sum, line) => {
      const amount = toSafeNumber(line.amount);
      if (!Number.isFinite(amount)) return sum;
      return sum + amount;
    }, 0);
  }, [paymentLines]);

  const paymentDiff = useMemo(() => {
    if (!Number.isFinite(totalPrice)) return NaN;
    return totalPrice - paymentTotal;
  }, [totalPrice, paymentTotal]);

  function updatePaymentLine(
    lineId: string,
    key: "payment_method" | "amount",
    value: string
  ) {
    setPaymentLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
              ...line,
              [key]: value,
            }
          : line
      )
    );
  }

  function addPaymentLine() {
    setPaymentLines((prev) => [...prev, createPaymentLine("現金", "")]);
  }

  function removePaymentLine(lineId: string) {
    setPaymentLines((prev) => {
      if (prev.length === 1) {
        return [createPaymentLine("現金", "")];
      }
      return prev.filter((line) => line.id !== lineId);
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!customerId) {
      setMessage("顧客を選択してください");
      return;
    }

    if (!visitDate) {
      setMessage("来店日を入力してください");
      return;
    }

    if (!price || Number(price) < 0) {
      setMessage("売上金額を正しく入力してください");
      return;
    }

    if (!Number.isFinite(totalPrice)) {
      setMessage("売上金額を正しく入力してください");
      return;
    }

    const cleanedPaymentLines = paymentLines
      .map((line, index) => ({
        payment_method: line.payment_method.trim(),
        amount: toSafeNumber(line.amount),
        sort_order: index + 1,
      }))
      .filter((line) => line.payment_method && line.amount !== 0);

    if (cleanedPaymentLines.length === 0) {
      setMessage("支払い内訳を1件以上入力してください");
      return;
    }

    const hasInvalidPaymentAmount = cleanedPaymentLines.some(
      (line) => !Number.isFinite(line.amount)
    );

    if (hasInvalidPaymentAmount) {
      setMessage("支払い内訳の金額を正しく入力してください");
      return;
    }

    const hasDiscountPositive = cleanedPaymentLines.some(
      (line) => isDiscountMethod(line.payment_method) && line.amount > 0
    );

    if (hasDiscountPositive) {
      setMessage("割引はマイナス金額で入力してください");
      return;
    }

    const hasNonDiscountNegative = cleanedPaymentLines.some(
      (line) => !isDiscountMethod(line.payment_method) && line.amount < 0
    );

    if (hasNonDiscountNegative) {
      setMessage("割引以外の支払い方法はマイナスにできません");
      return;
    }

    if (paymentTotal !== totalPrice) {
      setMessage("売上金額と支払い内訳合計を一致させてください");
      return;
    }

    setSaving(true);

    try {
      const mainPaymentMethod =
        cleanedPaymentLines.length === 1
          ? cleanedPaymentLines[0].payment_method
          : "複数";

      const visitPayload = {
        customer_id: customerId,
        visit_date: visitDate,
        menu_name: menuName.trim() || null,
        price: totalPrice,
        payment_method: mainPaymentMethod,
        memo: memo.trim() || null,
        next_visit_date: nextVisitDate || null,
        next_proposal: nextProposal.trim() || null,
        staff_name: staffName.trim() || null,
      };

      const { data: insertedVisit, error: visitError } = await supabase
        .from("visits")
        .insert([visitPayload])
        .select("id")
        .single();

      if (visitError || !insertedVisit) {
        console.error("visits insert error:", visitError);
        setMessage(
          `来店履歴の登録に失敗しました: ${
            visitError?.message || "insert failed"
          }`
        );
        setSaving(false);
        return;
      }

      const visitPaymentsPayload = cleanedPaymentLines.map((line) => ({
        visit_id: insertedVisit.id,
        payment_method: line.payment_method,
        amount: line.amount,
        sort_order: line.sort_order,
      }));

      const { error: paymentError } = await supabase
        .from("visit_payments")
        .insert(visitPaymentsPayload);

      if (paymentError) {
        console.error("visit_payments insert error:", paymentError);
        setMessage(`支払い内訳の登録に失敗しました: ${paymentError.message}`);
        setSaving(false);
        return;
      }

      if (prefilledReservationId) {
        const { error: reservationUpdateError } = await supabase
          .from("reservations")
          .update({ status: "完了" })
          .eq("id", prefilledReservationId);

        if (reservationUpdateError) {
          console.error("reservations update error:", reservationUpdateError);
          setMessage(
            `来店履歴は登録できましたが、予約ステータス更新に失敗しました: ${reservationUpdateError.message}`
          );
          setSaving(false);
          return;
        }
      }

      alert("来店履歴を登録しました");
      router.push(`/customers/${customerId}`);
    } catch (error) {
      console.error("来店登録エラー:", error);
      setMessage("来店履歴の登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-xl space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">来店登録ページ</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                来店内容、お会計、次回提案をまとめて入力できるページです。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/visits"
                className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
              >
                来店ページへ
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">ご案内</h2>
          <p className="mt-2 text-sm text-slate-600">
            顧客を選択して、来店内容とお会計、次回提案を登録します。
          </p>

          {prefilledReservationId ? (
            <div className="mt-3 rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm text-pink-700">
              予約から引き継いでいます。顧客・来店日・メニュー・担当者・メモを初期表示しています。
            </div>
          ) : null}
        </section>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">顧客情報</h2>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                顧客 <span className="text-rose-500">*</span>
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
              >
                <option value="">
                  {loadingCustomers ? "読み込み中..." : "顧客を選択してください"}
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.phone ? ` / ${customer.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomer ? (
              <div className="mt-3 rounded-3xl bg-rose-50 p-4 text-sm text-slate-700">
                <p>
                  <span className="font-medium">顧客名:</span> {selectedCustomer.name}
                </p>
                <p className="mt-1">
                  <span className="font-medium">電話番号:</span>{" "}
                  {selectedCustomer.phone || "-"}
                </p>
              </div>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">来店情報</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  来店日 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  メニュー
                </label>
                <input
                  type="text"
                  value={menuName}
                  onChange={(e) => setMenuName(e.target.value)}
                  placeholder="例: ワンカラー / 定額デザイン"
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  売上金額 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="例: 5000"
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
                <p className="mt-2 text-xs text-slate-500">
                  割引後の最終売上金額を入力してください。
                </p>
              </div>

              <div className="rounded-[28px] border border-rose-100 bg-rose-50/50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      支払い内訳
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      例: 現金 6000 / 割引 -1000 → 売上金額 5000
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addPaymentLine}
                    className="rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-600"
                  >
                    ＋行追加
                  </button>
                </div>

                <div className="space-y-3">
                  {paymentLines.map((line, index) => {
                    const isDiscount = isDiscountMethod(line.payment_method);

                    return (
                      <div
                        key={line.id}
                        className="rounded-[28px] border border-rose-100 bg-white p-3"
                      >
                        <div className="mb-3 text-xs font-bold text-slate-500">
                          内訳 {index + 1}
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_auto]">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700">
                              支払い方法
                            </label>
                            <select
                              value={line.payment_method}
                              onChange={(e) =>
                                updatePaymentLine(
                                  line.id,
                                  "payment_method",
                                  e.target.value
                                )
                              }
                              className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                            >
                              {PAYMENT_METHOD_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700">
                              金額
                            </label>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={line.amount}
                              onChange={(e) =>
                                updatePaymentLine(line.id, "amount", e.target.value)
                              }
                              placeholder={isDiscount ? "例: -1000" : "例: 5000"}
                              className={`w-full rounded-2xl border px-3 py-3 text-sm ${
                                isDiscount
                                  ? "border-rose-300 bg-rose-50"
                                  : "border-rose-200 bg-rose-50/40"
                              }`}
                            />
                            {isDiscount ? (
                              <p className="mt-1 text-[11px] text-rose-600">
                                割引はマイナスで入力
                              </p>
                            ) : null}
                          </div>

                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => removePaymentLine(line.id)}
                              className="w-full rounded-2xl border border-rose-200 bg-white px-3 py-3 text-sm font-bold text-rose-600"
                            >
                              削除
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-slate-500">
                          入力値: {formatAmountPreview(line.amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl bg-white p-3 text-sm shadow-sm">
                    <div className="text-slate-500">売上金額</div>
                    <div className="mt-1 font-bold text-slate-900">
                      {Number.isFinite(totalPrice)
                        ? totalPrice.toLocaleString("ja-JP")
                        : "-"}
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white p-3 text-sm shadow-sm">
                    <div className="text-slate-500">内訳合計</div>
                    <div className="mt-1 font-bold text-slate-900">
                      {paymentTotal.toLocaleString("ja-JP")}
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white p-3 text-sm shadow-sm">
                    <div className="text-slate-500">差額</div>
                    <div
                      className={`mt-1 font-bold ${
                        paymentDiff === 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {Number.isFinite(paymentDiff)
                        ? paymentDiff.toLocaleString("ja-JP")
                        : "-"}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  担当者
                </label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="例: 山田"
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  メモ
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="施術内容や補足メモ"
                  rows={4}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">次回提案</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  次回来店予定日
                </label>
                <input
                  type="date"
                  value={nextVisitDate}
                  onChange={(e) => setNextVisitDate(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  次回提案
                </label>
                <textarea
                  value={nextProposal}
                  onChange={(e) => setNextProposal(e.target.value)}
                  placeholder="例: 次回はフィルイン＋初夏カラー提案"
                  rows={3}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
              </div>
            </div>
          </section>

          {message ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "登録中..." : "登録する"}
          </button>
        </form>
      </div>
    </main>
  );
}