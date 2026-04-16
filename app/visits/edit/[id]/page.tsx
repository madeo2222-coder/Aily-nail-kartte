"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";

type VisitRow = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  menu_name: string | null;
  price: number | null;
  payment_method: string | null;
  memo: string | null;
  next_visit_date: string | null;
  next_proposal: string | null;
  next_suggestion: string | null;
  staff_name: string | null;
  customers:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

type VisitPaymentRow = {
  id: string;
  visit_id: string;
  payment_method: string;
  amount: number;
  sort_order: number | null;
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
  "その他",
];

function getCustomerName(
  customers:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null
) {
  if (!customers) return "顧客名なし";
  if (Array.isArray(customers)) {
    return customers[0]?.name || "顧客名なし";
  }
  return customers.name || "顧客名なし";
}

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

export default function EditVisitPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [menuName, setMenuName] = useState("");
  const [price, setPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("現金");
  const [memo, setMemo] = useState("");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextProposal, setNextProposal] = useState("");
  const [staffName, setStaffName] = useState("");
  const [message, setMessage] = useState("");

  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    createPaymentLine("現金", ""),
  ]);

  useEffect(() => {
    if (!visitId) return;
    fetchVisit();
  }, [visitId]);

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

  async function fetchVisit() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("visits")
      .select(
        `
        id,
        customer_id,
        visit_date,
        menu_name,
        price,
        payment_method,
        memo,
        next_visit_date,
        next_proposal,
        next_suggestion,
        staff_name,
        customers (
          name
        )
      `
      )
      .eq("id", visitId)
      .single();

    if (error || !data) {
      console.error("来店履歴の取得エラー:", error);
      alert("来店履歴の取得に失敗しました");
      setLoading(false);
      return;
    }

    const visit = data as VisitRow;

    setCustomerName(getCustomerName(visit.customers));
    setVisitDate(visit.visit_date || "");
    setMenuName(visit.menu_name || "");
    setPrice(
      visit.price === null || visit.price === undefined ? "" : String(visit.price)
    );
    setPaymentMethod(visit.payment_method || "現金");
    setMemo(visit.memo || "");
    setNextVisitDate(visit.next_visit_date || "");
    setNextProposal(visit.next_proposal || visit.next_suggestion || "");
    setStaffName(visit.staff_name || "");

    const { data: paymentData, error: paymentError } = await supabase
      .from("visit_payments")
      .select("id, visit_id, payment_method, amount, sort_order")
      .eq("visit_id", visitId)
      .order("sort_order", { ascending: true });

    if (paymentError) {
      console.error("visit_payments取得エラー:", paymentError);
    }

    const payments = (paymentData ?? []) as VisitPaymentRow[];

    if (payments.length > 0) {
      setPaymentLines(
        payments.map((row) => ({
          id: row.id || createLineId(),
          payment_method: row.payment_method || "現金",
          amount: String(row.amount ?? ""),
        }))
      );
    } else {
      setPaymentLines([
        createPaymentLine(
          visit.payment_method || "現金",
          visit.price === null || visit.price === undefined
            ? ""
            : String(visit.price)
        ),
      ]);
    }

    setLoading(false);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (!visitDate) {
      setMessage("来店日を入力してください");
      return;
    }

    if (!Number.isFinite(totalPrice) || totalPrice < 0) {
      setMessage("売上は正しい金額を入力してください");
      return;
    }

    const cleanedPaymentLines = paymentLines
      .map((line, index) => ({
        payment_method: line.payment_method.trim(),
        amount: toSafeNumber(line.amount),
        sort_order: index + 1,
      }))
      .filter((line) => line.payment_method && line.amount > 0);

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

    if (paymentTotal !== totalPrice) {
      setMessage("売上金額と支払い内訳合計を一致させてください");
      return;
    }

    setSaving(true);

    try {
      const mainPaymentMethod =
        cleanedPaymentLines.length === 1
          ? cleanedPaymentLines[0].payment_method
          : "分割払い";

      const updateData = {
        visit_date: visitDate || null,
        menu_name: menuName.trim() || null,
        price: totalPrice,
        payment_method: mainPaymentMethod,
        memo: memo.trim() || null,
        next_visit_date: nextVisitDate || null,
        next_proposal: nextProposal.trim() || null,
        next_suggestion: nextProposal.trim() || null,
        staff_name: staffName.trim() || null,
      };

      const { error: visitError } = await supabase
        .from("visits")
        .update(updateData)
        .eq("id", visitId);

      if (visitError) {
        console.error("来店履歴の更新エラー:", visitError);
        setMessage("来店履歴の更新に失敗しました");
        setSaving(false);
        return;
      }

      const { error: deleteError } = await supabase
        .from("visit_payments")
        .delete()
        .eq("visit_id", visitId);

      if (deleteError) {
        console.error("visit_payments削除エラー:", deleteError);
        setMessage("支払い内訳の更新に失敗しました");
        setSaving(false);
        return;
      }

      const paymentPayload = cleanedPaymentLines.map((line) => ({
        visit_id: visitId,
        payment_method: line.payment_method,
        amount: line.amount,
        sort_order: line.sort_order,
      }));

      const { error: insertError } = await supabase
        .from("visit_payments")
        .insert(paymentPayload);

      if (insertError) {
        console.error("visit_payments登録エラー:", insertError);
        setMessage("支払い内訳の更新に失敗しました");
        setSaving(false);
        return;
      }

      alert("来店履歴を更新しました");
      router.push("/visits");
      router.refresh();
    } catch (error) {
      console.error("来店履歴更新エラー:", error);
      setMessage("更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm("この来店履歴を削除しますか？");
    if (!confirmed) return;

    setDeleting(true);
    setMessage("");

    try {
      const { error: paymentDeleteError } = await supabase
        .from("visit_payments")
        .delete()
        .eq("visit_id", visitId);

      if (paymentDeleteError) {
        console.error("visit_payments削除エラー:", paymentDeleteError);
        setMessage("支払い内訳の削除に失敗しました");
        setDeleting(false);
        return;
      }

      const { error: visitDeleteError } = await supabase
        .from("visits")
        .delete()
        .eq("id", visitId);

      if (visitDeleteError) {
        console.error("visits削除エラー:", visitDeleteError);
        setMessage("来店履歴の削除に失敗しました");
        setDeleting(false);
        return;
      }

      alert("来店履歴を削除しました");
      router.push("/visits");
      router.refresh();
    } catch (error) {
      console.error("来店履歴削除エラー:", error);
      setMessage("来店履歴の削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="p-4 pb-24">読み込み中...</div>;
  }

  return (
    <div className="p-4 pb-24">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">来店履歴を編集</h1>
          <Link href="/visits" className="text-sm text-blue-600 underline">
            来店一覧へ戻る
          </Link>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-4 text-sm text-gray-500">顧客名: {customerName}</div>

          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">来店日</label>
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">メニュー</label>
              <input
                type="text"
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
                placeholder="例: ワンカラー / 定額デザイン"
                className="w-full rounded-xl border px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">売上</label>
              <input
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="例: 8800"
                className="w-full rounded-xl border px-3 py-3"
              />
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    支払い内訳
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    例: PayPay 5000 / ホットペッパーポイント 1000
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addPaymentLine}
                  className="rounded-xl border bg-white px-3 py-2 text-sm font-bold text-slate-700"
                >
                  ＋行追加
                </button>
              </div>

              <div className="space-y-3">
                {paymentLines.map((line, index) => (
                  <div
                    key={line.id}
                    className="rounded-2xl border bg-white p-3"
                  >
                    <div className="mb-3 text-xs font-bold text-slate-500">
                      内訳 {index + 1}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_auto]">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
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
                          className="w-full rounded-xl border px-3 py-3 text-sm"
                        >
                          {PAYMENT_METHOD_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          金額
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={line.amount}
                          onChange={(e) =>
                            updatePaymentLine(line.id, "amount", e.target.value)
                          }
                          placeholder="例: 5000"
                          className="w-full rounded-xl border px-3 py-3 text-sm"
                        />
                      </div>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removePaymentLine(line.id)}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-bold text-red-600"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-slate-500">売上金額</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">
                    {Number.isFinite(totalPrice)
                      ? `¥${totalPrice.toLocaleString("ja-JP")}`
                      : "-"}
                  </div>
                </div>

                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-slate-500">内訳合計</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">
                    ¥{paymentTotal.toLocaleString("ja-JP")}
                  </div>
                </div>

                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-slate-500">差額</div>
                  <div
                    className={`mt-1 text-lg font-bold ${
                      paymentDiff === 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {Number.isFinite(paymentDiff)
                      ? `¥${paymentDiff.toLocaleString("ja-JP")}`
                      : "-"}
                  </div>
                </div>
              </div>

              {Number.isFinite(paymentDiff) && paymentDiff !== 0 ? (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                  売上金額と支払い内訳合計を一致させてください。
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">メモ</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={4}
                className="w-full rounded-xl border px-3 py-3"
                placeholder="施術内容や注意点など"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                次回来店予定
              </label>
              <input
                type="date"
                value={nextVisitDate}
                onChange={(e) => setNextVisitDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">次回提案</label>
              <textarea
                value={nextProposal}
                onChange={(e) => setNextProposal(e.target.value)}
                rows={3}
                className="w-full rounded-xl border px-3 py-3"
                placeholder="次回おすすめデザイン、提案メニューなど"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">担当スタッフ</label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="例: あかね"
                className="w-full rounded-xl border px-3 py-3"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="submit"
                disabled={saving || deleting}
                className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
              >
                {saving ? "更新中..." : "更新する"}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-white disabled:opacity-60"
              >
                {deleting ? "削除中..." : "この来店履歴を削除"}
              </button>
            </div>

            {message ? (
              <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                {message}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}