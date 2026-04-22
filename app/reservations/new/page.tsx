"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Salon = {
  id: string;
  name: string | null;
};

type Customer = {
  id: string;
  name: string | null;
  salon_id: string | null;
};

type Staff = {
  id: string;
  name: string | null;
  salon_id: string | null;
};

const STATUS_OPTIONS = ["予約", "来店", "完了", "キャンセル"] as const;
const DURATION_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180];

function buildDateTime(targetDate: string, targetTime: string) {
  if (!targetDate || !targetTime) return null;
  return `${targetDate}T${targetTime}:00`;
}

function addMinutes(date: string, time: string, minutes: number) {
  const base = new Date(`${date}T${time}:00`);
  if (Number.isNaN(base.getTime())) return null;

  base.setMinutes(base.getMinutes() + minutes);

  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  const hour = String(base.getHours()).padStart(2, "0");
  const minute = String(base.getMinutes()).padStart(2, "0");
  const second = String(base.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

export default function ReservationNewPage() {
  const router = useRouter();

  const [salons, setSalons] = useState<Salon[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allStaffs, setAllStaffs] = useState<Staff[]>([]);

  const [salonId, setSalonId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [menu, setMenu] = useState("");
  const [memo, setMemo] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("予約");

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function fetchMasterData() {
      setPageLoading(true);
      setErrorMessage("");

      const [salonsRes, customersRes, staffsRes] = await Promise.all([
        supabase
          .from("salons")
          .select("id, name")
          .order("created_at", { ascending: true }),
        supabase
          .from("customers")
          .select("id, name, salon_id")
          .order("created_at", { ascending: false }),
        supabase
          .from("staffs")
          .select("id, name, salon_id")
          .order("created_at", { ascending: true }),
      ]);

      if (salonsRes.error) {
        setErrorMessage("サロン一覧の取得に失敗しました");
        setSalons([]);
      } else {
        setSalons((salonsRes.data as Salon[]) || []);
      }

      if (customersRes.error) {
        setErrorMessage("顧客一覧の取得に失敗しました");
        setAllCustomers([]);
      } else {
        setAllCustomers((customersRes.data as Customer[]) || []);
      }

      if (staffsRes.error) {
        setErrorMessage("スタッフ一覧の取得に失敗しました");
        setAllStaffs([]);
      } else {
        setAllStaffs((staffsRes.data as Staff[]) || []);
      }

      setPageLoading(false);
    }

    fetchMasterData();
  }, []);

  const filteredCustomers = useMemo(() => {
    return allCustomers.filter((item) => (salonId ? item.salon_id === salonId : true));
  }, [allCustomers, salonId]);

  const filteredStaffs = useMemo(() => {
    return allStaffs.filter((item) => (salonId ? item.salon_id === salonId : true));
  }, [allStaffs, salonId]);

  function handleSalonChange(nextSalonId: string) {
    setSalonId(nextSalonId);

    const nextCustomers = allCustomers.filter((item) =>
      nextSalonId ? item.salon_id === nextSalonId : true
    );
    const nextStaffs = allStaffs.filter((item) =>
      nextSalonId ? item.salon_id === nextSalonId : true
    );

    const customerExists = nextCustomers.some((item) => item.id === customerId);
    const staffExists = nextStaffs.some((item) => item.id === staffId);

    setCustomerId(customerExists ? customerId : nextCustomers[0]?.id ?? "");
    setStaffId(staffExists ? staffId : nextStaffs[0]?.id ?? "");
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);

    const selectedCustomer =
      allCustomers.find((item) => item.id === nextCustomerId) ?? null;

    if (!selectedCustomer?.salon_id) return;

    if (!salonId) {
      const nextSalonId = selectedCustomer.salon_id;
      setSalonId(nextSalonId);

      const nextStaffs = allStaffs.filter((item) => item.salon_id === nextSalonId);
      const staffExists = nextStaffs.some((item) => item.id === staffId);
      setStaffId(staffExists ? staffId : nextStaffs[0]?.id ?? "");
      return;
    }

    if (selectedCustomer.salon_id !== salonId) {
      const nextSalonId = selectedCustomer.salon_id;
      setSalonId(nextSalonId);

      const nextStaffs = allStaffs.filter((item) => item.salon_id === nextSalonId);
      const staffExists = nextStaffs.some((item) => item.id === staffId);
      setStaffId(staffExists ? staffId : nextStaffs[0]?.id ?? "");
    }
  }

  async function handleSubmit() {
    setErrorMessage("");

    if (!salonId) {
      setErrorMessage("サロンを選択してください");
      return;
    }

    if (!customerId) {
      setErrorMessage("顧客を選択してください");
      return;
    }

    if (!staffId) {
      setErrorMessage("担当スタッフを選択してください");
      return;
    }

    if (!date || !startTime) {
      setErrorMessage("日付と開始時間を入力してください");
      return;
    }

    const startAt = buildDateTime(date, startTime);
    const endAt = addMinutes(date, startTime, durationMinutes);

    if (!startAt || !endAt) {
      setErrorMessage("日時の作成に失敗しました");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("reservations").insert([
      {
        salon_id: salonId,
        customer_id: customerId,
        staff_id: staffId,
        menu: menu.trim() || null,
        start_at: startAt,
        end_at: endAt,
        status,
        memo: memo.trim() || null,
      },
    ]);

    setLoading(false);

    if (error) {
      setErrorMessage(`登録失敗: ${error.message}`);
      return;
    }

    router.push("/reservations");
  }

  return (
    <main
      className="min-h-screen bg-rose-50/40"
      suppressHydrationWarning
    >
      <div className="mx-auto max-w-[720px] space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">予約登録ページ</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                ご予約情報をやさしく見やすく入力できる店舗用ページです。
              </p>
            </div>

            <Link
              href="/reservations"
              className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
            >
              予約ページへ
            </Link>
          </div>
        </section>

        {pageLoading ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">読み込み中...</p>
          </section>
        ) : (
          <section className="space-y-4 rounded-[28px] border border-rose-100 bg-white p-4 sm:p-6 shadow-sm">
            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  サロン
                </label>
                <select
                  value={salonId}
                  onChange={(e) => handleSalonChange(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  suppressHydrationWarning
                >
                  <option value="">選択してください</option>
                  {salons.map((salon) => (
                    <option key={salon.id} value={salon.id}>
                      {salon.name || "名称未設定"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  顧客
                </label>
                <select
                  value={customerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  suppressHydrationWarning
                >
                  <option value="">選択してください</option>
                  {filteredCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name || "名称未設定"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  担当スタッフ
                </label>
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  suppressHydrationWarning
                >
                  <option value="">選択してください</option>
                  {filteredStaffs.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name || "名称未設定"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  メニュー
                </label>
                <input
                  type="text"
                  value={menu}
                  onChange={(e) => setMenu(e.target.value)}
                  placeholder="例: ワンカラー"
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  suppressHydrationWarning
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    日付
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                    suppressHydrationWarning
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    開始時間
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                    suppressHydrationWarning
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    所要時間
                  </label>
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                    suppressHydrationWarning
                  >
                    {DURATION_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes}分
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  メモ
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  placeholder="補足メモ"
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  suppressHydrationWarning
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  ステータス
                </label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as (typeof STATUS_OPTIONS)[number])
                  }
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  suppressHydrationWarning
                >
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white disabled:opacity-60"
              suppressHydrationWarning
            >
              {loading ? "登録中..." : "登録する"}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}