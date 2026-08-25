"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";

import type {
  VisitRegistrationCustomer,
  VisitRegistrationReservation,
  VisitRegistrationStaff,
} from "@/lib/server/visitRegistrationFormData";

type PaymentLine = {
  id: number;
  method: string;
  amount: string;
};

type Props = {
  customers: VisitRegistrationCustomer[];
  staffs: VisitRegistrationStaff[];
  reservation: VisitRegistrationReservation | null;
  initialCustomerId: string;
  defaultVisitDate: string;
};

const PAYMENT_METHODS = [
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
] as const;

const KNOWN_API_ERRORS = new Set([
  "スタッフ認証が必要です。",
  "この操作を行う権限がありません。",
  "入力内容を確認してください。",
  "顧客情報を確認できません。",
  "担当スタッフを確認できません。",
  "予約情報を確認できません。",
  "この予約は既に完了しています。",
  "この予約には既に来店履歴があります。",
  "支払い内容を確認してください。",
  "売上金額と支払い内訳合計を一致させてください。",
  "利用できるクーポン残高を確認してください。",
  "予約状態が変更されたため登録できませんでした。",
  "来店登録を開始できませんでした。",
  "来店登録に失敗しました。",
  "来店登録結果を確認できませんでした。",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDate(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseInteger(value: string) {
  if (!/^-?(0|[1-9]\d*)$/.test(value.trim())) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function formatYen(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function apiErrorMessage(status: number, value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    KNOWN_API_ERRORS.has(value.error)
  ) {
    return value.error;
  }

  if (status === 401 || status === 403) {
    return "ログイン状態を確認して、もう一度お試しください。";
  }

  if (status === 409) {
    return "登録済みの内容やクーポン残高を確認してください。";
  }

  return "来店登録に失敗しました。入力内容を確認してください。";
}

export default function SecureNewVisitPageClient({
  customers,
  staffs,
  reservation,
  initialCustomerId,
  defaultVisitDate,
}: Props) {
  const [customerId, setCustomerId] = useState(
    reservation?.customerId ?? initialCustomerId
  );
  const [staffId, setStaffId] = useState("");
  const [visitDate, setVisitDate] = useState(
    reservation?.visitDate ?? defaultVisitDate
  );
  const [menuName, setMenuName] = useState(reservation?.menuName ?? "");
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [memo, setMemo] = useState(reservation?.memo ?? "");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextProposal, setNextProposal] = useState("");
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    { id: 1, method: "現金", amount: "" },
  ]);
  const [nextPaymentId, setNextPaymentId] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdVisitId, setCreatedVisitId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const submitLockRef = useRef(false);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) ?? null,
    [customerId, customers]
  );
  const selectedStaff = reservation
    ? staffs.find((staff) => staff.id === reservation.staffId) ?? null
    : staffs.find((staff) => staff.id === staffId) ?? null;
  const paymentTotal = paymentLines.reduce((total, line) => {
    const amount = parseInteger(line.amount);
    return amount === null ? total : total + amount;
  }, 0);
  const parsedPrice = parseInteger(price);

  function updatePaymentLine(
    id: number,
    key: "method" | "amount",
    value: string
  ) {
    setPaymentLines((lines) =>
      lines.map((line) => (line.id === id ? { ...line, [key]: value } : line))
    );
  }

  function addPaymentLine() {
    setPaymentLines((lines) => [
      ...lines,
      { id: nextPaymentId, method: "現金", amount: "" },
    ]);
    setNextPaymentId((value) => value + 1);
  }

  function removePaymentLine(id: number) {
    setPaymentLines((lines) =>
      lines.length === 1 ? lines : lines.filter((line) => line.id !== id)
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitLockRef.current || submitting || submitted) return;

    setMessage("");

    const customer = reservation
      ? customers.find((item) => item.id === reservation.customerId)
      : selectedCustomer;
    const staff = reservation
      ? staffs.find((item) => item.id === reservation.staffId)
      : selectedStaff;

    if (!customer || !staff) {
      setMessage("顧客と担当スタッフを確認してください。");
      return;
    }

    if (!isValidDate(visitDate)) {
      setMessage("来店日を確認してください。");
      return;
    }

    if (
      parsedPrice === null ||
      parsedPrice < 1 ||
      parsedPrice > 2_147_483_647
    ) {
      setMessage("売上金額を確認してください。");
      return;
    }

    const payments = [];

    for (const line of paymentLines) {
      const amount = parseInteger(line.amount);

      if (
        !PAYMENT_METHODS.includes(line.method as (typeof PAYMENT_METHODS)[number]) ||
        amount === null ||
        amount === 0 ||
        (line.method === "割引" ? amount >= 0 : amount <= 0)
      ) {
        setMessage("支払い内訳をすべて正しく入力してください。");
        return;
      }

      payments.push({ method: line.method, amount });
    }

    const signedTotal = payments.reduce(
      (total, payment) => total + payment.amount,
      0
    );

    if (!Number.isSafeInteger(signedTotal) || signedTotal !== parsedPrice) {
      setMessage("売上金額と支払い内訳合計を一致させてください。");
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    let keepSubmissionLocked = false;

    try {
      const response = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: reservation?.id ?? null,
          customerId: customer.id,
          staffId: reservation ? null : staff.id,
          visitDate,
          menuName: menuName.trim() || null,
          color: color.trim() || null,
          price: parsedPrice,
          memo: memo.trim() || null,
          nextVisitDate: nextVisitDate || null,
          nextProposal: nextProposal.trim() || null,
          payments,
        }),
      });
      const responseBody: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(apiErrorMessage(response.status, responseBody));

        if (response.status >= 500) {
          keepSubmissionLocked = true;
          setSubmitted(true);
        }

        return;
      }

      if (
        typeof responseBody !== "object" ||
        responseBody === null ||
        !("ok" in responseBody) ||
        responseBody.ok !== true ||
        !("visit" in responseBody) ||
        typeof responseBody.visit !== "object" ||
        responseBody.visit === null ||
        !("id" in responseBody.visit) ||
        typeof responseBody.visit.id !== "string" ||
        !UUID_PATTERN.test(responseBody.visit.id)
      ) {
        keepSubmissionLocked = true;
        setSubmitted(true);
        setMessage(
          "登録結果を確認できませんでした。再送信せず、管理者へ確認してください。"
        );
        return;
      }

      keepSubmissionLocked = true;
      setCreatedVisitId(responseBody.visit.id);
      setSubmitted(true);
      setMessage("");
    } catch {
      keepSubmissionLocked = true;
      setSubmitted(true);
      setMessage(
        "通信結果を確認できませんでした。再送信せず、管理者へ確認してください。"
      );
    } finally {
      if (!keepSubmissionLocked) {
        submitLockRef.current = false;
      }
      setSubmitting(false);
    }
  }

  if (submitted) {
    const registrationConfirmed = createdVisitId !== null;

    return (
      <main className="min-h-screen bg-rose-50/40 p-4">
        <section className="mx-auto max-w-xl rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
          <p
            className={`text-sm font-bold ${
              registrationConfirmed ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {registrationConfirmed ? "登録済み" : "結果確認が必要です"}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {registrationConfirmed
              ? "来店登録が完了しました"
              : "来店登録を再送信しないでください"}
          </h1>
          {registrationConfirmed ? (
            <dl className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">顧客</dt>
                <dd className="font-bold text-slate-900">
                  {selectedCustomer?.name}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">担当</dt>
                <dd className="font-bold text-slate-900">
                  {selectedStaff?.name}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">売上</dt>
                <dd className="font-bold text-slate-900">
                  {formatYen(parsedPrice ?? 0)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">来店日</dt>
                <dd className="font-bold text-slate-900">{visitDate}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              {message}
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-slate-500">
            この画面から同じ内容を再送信することはできません。
          </p>
          <Link
            href="/dashboard"
            className="mt-6 block rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
          >
            ダッシュボードへ戻る
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-xl space-y-4 p-4 pb-24">
        <section className="rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            NAILY AIDOL
          </p>
          <h1 className="mt-2 text-2xl font-bold">個別ログイン用 来店登録</h1>
          <p className="mt-2 text-sm leading-6 text-white/90">
            顧客、担当スタッフ、お会計内容を確認して登録してください。
          </p>
        </section>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={submitting || submitted} className="space-y-4">
            <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-900">顧客情報</h2>
              {reservation ? (
                <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900">
                  {reservation.customerName}
                </p>
              ) : (
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                >
                  <option value="">顧客を選択してください</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              )}
            </section>

            <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-900">来店情報</h2>
              <div className="space-y-3">
                {reservation ? (
                  <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm">
                    <span className="text-slate-500">担当スタッフ</span>
                    <p className="mt-1 font-bold text-slate-900">
                      {reservation.staffName}
                    </p>
                  </div>
                ) : (
                  <select
                    value={staffId}
                    onChange={(event) => setStaffId(event.target.value)}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                  >
                    <option value="">担当スタッフを選択してください</option>
                    {staffs.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="date"
                  value={visitDate}
                  onChange={(event) => setVisitDate(event.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
                <input
                  type="text"
                  value={menuName}
                  onChange={(event) => setMenuName(event.target.value)}
                  placeholder="メニュー"
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  placeholder="カラー"
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="売上金額"
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
                <textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="メモ"
                  rows={4}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                />
              </div>
            </section>

            <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-900">支払い内訳</h2>
              <div className="space-y-3">
                {paymentLines.map((line) => (
                  <div key={line.id} className="rounded-2xl border border-rose-100 p-3">
                    <select
                      value={line.method}
                      onChange={(event) =>
                        updatePaymentLine(line.id, "method", event.target.value)
                      }
                      className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={line.amount}
                      onChange={(event) =>
                        updatePaymentLine(line.id, "amount", event.target.value)
                      }
                      placeholder={line.method === "割引" ? "例: -500" : "例: 5000"}
                      className="mt-3 w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removePaymentLine(line.id)}
                      disabled={paymentLines.length === 1}
                      className="mt-2 text-xs font-bold text-rose-600 disabled:opacity-40"
                    >
                      この行を削除
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addPaymentLine}
                className="mt-3 rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-600"
              >
                ＋行追加
              </button>
              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">売上金額</span>
                  <span className="font-bold text-slate-900">
                    {formatYen(parsedPrice ?? 0)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-slate-500">支払い内訳合計</span>
                  <span className="font-bold text-slate-900">
                    {formatYen(paymentTotal)}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-900">次回提案</h2>
              <input
                type="date"
                value={nextVisitDate}
                onChange={(event) => setNextVisitDate(event.target.value)}
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
              />
              <textarea
                value={nextProposal}
                onChange={(event) => setNextProposal(event.target.value)}
                placeholder="次回提案"
                rows={3}
                className="mt-3 w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
              />
            </section>
          </fieldset>

          {message ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || submitted}
            className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? "登録中..." : submitted ? "登録済み" : "登録する"}
          </button>
        </form>

        <Link
          href="/dashboard"
          className="block rounded-2xl border border-rose-200 bg-white px-4 py-3 text-center text-sm font-bold text-rose-600"
        >
          ダッシュボードへ戻る
        </Link>
      </div>
    </main>
  );
}
