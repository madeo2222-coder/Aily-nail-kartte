"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
};

type Visit = {
  id: string;
  customer_id: string;
  visit_date?: string | null;
  price?: number | null;
};

function daysBetween(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getNextMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function toDateOnlyString(date: Date) {
  return date.toISOString().split("T")[0];
}

export default function HomePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data: customersData } = await supabase
      .from("customers")
      .select("id");

    const { data: visitsData } = await supabase
      .from("visits")
      .select("id, customer_id, visit_date, price");

    setCustomers(customersData || []);
    setVisits(visitsData || []);
    setLoading(false);
  }

  const today = toDateOnlyString(new Date());

  const todaySales = visits.reduce((sum, v) => {
    if (v.visit_date === today) return sum + (v.price || 0);
    return sum;
  }, 0);

  const todayCount = visits.filter(v => v.visit_date === today).length;

  const monthlySales = useMemo(() => {
    const now = new Date();
    const start = getMonthStart(now);
    const end = getNextMonthStart(now);

    return visits.reduce((sum, v) => {
      if (!v.visit_date) return sum;
      const d = new Date(v.visit_date);
      if (d >= start && d < end) return sum + (v.price || 0);
      return sum;
    }, 0);
  }, [visits]);

  const totalSales = visits.reduce((sum, v) => sum + (v.price || 0), 0);

  return (
    <div className="p-4 space-y-4">

      {/* header */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">ダッシュボード</h1>
        <Link href="/visits/new" className="bg-black text-white px-4 py-2 rounded-lg">
          来店登録
        </Link>
      </div>

      {/* today */}
      <div className="bg-white p-4 rounded-xl shadow">
        <p>今日の売上</p>
        <p className="text-3xl font-bold">¥{todaySales}</p>
        <p>来店数: {todayCount}</p>
      </div>

      {/* month */}
      <div className="bg-white p-4 rounded-xl shadow">
        <p>今月の売上</p>
        <p className="text-3xl font-bold">¥{monthlySales}</p>
      </div>

      {/* total */}
      <div className="bg-white p-4 rounded-xl shadow">
        <p>累計売上</p>
        <p className="text-3xl font-bold">¥{totalSales}</p>
      </div>

      {/* menu */}
     <div className="grid grid-cols-3 gap-3 mt-4">
  <Link href="/customers" className="bg-white p-4 rounded-xl shadow text-center font-semibold">
    👤 顧客
  </Link>
  <Link href="/visits" className="bg-white p-4 rounded-xl shadow text-center font-semibold">
    💅 来店
  </Link>
  <Link href="/reports/daily" className="bg-white p-4 rounded-xl shadow text-center font-semibold">
    📊 日別売上
  </Link>
</div>

    </div>
  );
}