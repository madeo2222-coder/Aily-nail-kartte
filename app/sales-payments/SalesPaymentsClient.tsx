"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

export default function SalesPaymentsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [saleDate, setSaleDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [menuName, setMenuName] = useState<string>("");
  const [staffName, setStaffName] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("現金");
  const [paymentStatus, setPaymentStatus] = useState<string>("paid");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [unpaidAmount, setUnpaidAmount] = useState<string>("0");
  const [memo, setMemo] = useState<string>("");
  const [visitId, setVisitId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    const id = searchParams.get("visit_id");
    if (id) {
      setVisitId(id);
      fetchVisitData(id);
    }
  }, [searchParams]);

  useEffect(() => {
    const total = Number(amount || 0);
    const paid = Number(paidAmount || 0);
    const unpaid = total - paid;

    if (paymentStatus === "paid") {
      setPaidAmount(String(total));
      setUnpaidAmount("0");
    } else {
      setUnpaidAmount(String(unpaid > 0 ? unpaid : 0));
    }
  }, [amount, paymentStatus]);

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) {
      console.error("顧客取得エラー:", error);
      return;
    }

    setCustomers(data || []);
  }

  async function fetchVisitData(id: string) {
    const { data: visitData, error } = await supabase
      .from("visits")
      .select("id,customer_id,visit_date,menu_name,staff_name,memo,price")
      .eq("id", id)
      .single();

    if (error) {
      console.error("来店データ取得エラー:", error);
      return;
    }

    if (visitData) {
      const total = Number((visitData as any).price ?? 0);

      setCustomerId(String((visitData as any).customer_id ?? ""));
      setSaleDate(
        (visitData as any).visit_date
          ? String((visitData as any).visit_date).split("T")[0]
          : ""
      );
      setMenuName((visitData as any).menu_name ?? "");
      setStaffName((visitData as any).staff_name ?? "");
      setMemo((visitData as any).memo ?? "");
      setAmount(String(total));
      setPaymentStatus("paid");
      setPaidAmount(String(total));
      setUnpaidAmount("0");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);

    const total = Number(amount || 0);
    const paid = paymentStatus === "paid" ? total : Number(paidAmount || 0);
    const unpaid = paymentStatus === "paid" ? 0 : Math.max(total - paid, 0);

    const { error } = await supabase.from("sales").insert([
      {
        customer_id: customerId || null,
        visit_id: visitId,
        sale_date: saleDate,
        menu_name: menuName,
        staff_name: staffName,
        amount: total,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        paid_amount: paid,
        unpaid_amount: unpaid,
        memo,
      },
    ]);

    setLoading(false);

    if (error) {
      console.error("売上登録エラー:", error);
      alert("売上登録に失敗しました");
      return;
    }

    alert("売上登録が完了しました");
    router.push("/receivables");
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">会計登録</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 font-medium">顧客</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">選択してください</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-1 font-medium">売上日</label>
          <input
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">メニュー名</label>
          <input
            type="text"
            value={menuName}
            onChange={(e) => setMenuName(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="メニュー名を入力"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">担当スタッフ</label>
          <input
            type="text"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="担当スタッフ名を入力"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">売上金額</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="金額を入力"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">支払方法</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="現金">現金</option>
            <option value="クレジット">クレジット</option>
            <option value="QR決済">QR決済</option>
            <option value="振込">振込</option>
          </select>
        </div>

        <div>
          <label className="block mb-1 font-medium">支払い状況</label>
          <select
            value={paymentStatus}
            onChange={(e) => {
              const value = e.target.value;
              setPaymentStatus(value);
              if (value === "paid") {
                setPaidAmount(String(Number(amount || 0)));
                setUnpaidAmount("0");
              } else {
                setPaidAmount("0");
                setUnpaidAmount(String(Number(amount || 0)));
              }
            }}
            className="w-full border rounded px-3 py-2"
          >
            <option value="paid">支払い済み</option>
            <option value="unpaid">未収</option>
          </select>
        </div>

        {paymentStatus === "unpaid" && (
          <div>
            <label className="block mb-1 font-medium">入金額</label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => {
                const paid = Number(e.target.value || 0);
                const total = Number(amount || 0);
                const unpaid = total - paid;

                setPaidAmount(String(paid));
                setUnpaidAmount(String(unpaid > 0 ? unpaid : 0));
              }}
              className="w-full border rounded px-3 py-2"
              placeholder="今回入金額を入力"
            />
          </div>
        )}

        <div>
          <label className="block mb-1 font-medium">未収額</label>
          <input
            type="number"
            value={unpaidAmount}
            readOnly
            className="w-full border rounded px-3 py-2 bg-gray-100"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">メモ</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full border rounded px-3 py-2"
            rows={4}
            placeholder="メモを入力"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white rounded px-4 py-3 disabled:opacity-50"
        >
          {loading ? "登録中..." : "登録する"}
        </button>
      </form>
    </div>
  );
}