"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
};

export default function ReservationNewPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("予約");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCustomers = async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("customers fetch error:", error.message);
        setCustomers([]);
        return;
      }

      setCustomers((data as Customer[]) || []);
    };

    fetchCustomers();
  }, []);

  const handleSubmit = async () => {
    if (!customerId || !date) {
      alert("顧客と日付を入力してください");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("reservations").insert([
      {
        customer_id: customerId,
        reservation_date: date,
        status,
      },
    ]);

    setLoading(false);

    if (error) {
      alert("登録失敗: " + error.message);
      return;
    }

    router.push("/reservations");
  };

  return (
    <div
      className="mx-auto max-w-[720px] p-4"
      style={{ paddingBottom: "100px" }}
      suppressHydrationWarning
    >
      <h1 className="mb-4 text-xl font-bold">予約登録</h1>

      <div className="mb-4">
        <label className="mb-1 block text-sm">顧客</label>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full rounded border p-2"
          suppressHydrationWarning
        >
          <option value="">選択してください</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name || "名称未設定"}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm">日付</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded border p-2"
          suppressHydrationWarning
        />
      </div>

      <div className="mb-6">
        <label className="mb-1 block text-sm">ステータス</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full rounded border p-2"
          suppressHydrationWarning
        >
          <option value="予約">予約</option>
          <option value="来店">来店</option>
          <option value="完了">完了</option>
        </select>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="w-full rounded bg-black py-3 text-white"
        suppressHydrationWarning
      >
        {loading ? "登録中..." : "登録する"}
      </button>
    </div>
  );
}