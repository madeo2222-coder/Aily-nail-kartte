"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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

type ReservationDetail = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  memo: string | null;
};

const STATUS_OPTIONS = ["予約", "来店", "完了", "キャンセル"] as const;

function extractDate(value: string | null) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const [, y, m, d] = match;
  return `${y}-${m}-${d}`;
}

function extractTime(value: string | null) {
  if (!value) return "";
  const match = value.match(/T(\d{2}):(\d{2})/);
  if (!match) return "";
  const [, h, m] = match;
  return `${h}:${m}`;
}

function buildDateTime(targetDate: string, targetTime: string) {
  if (!targetDate || !targetTime) return null;
  return `${targetDate}T${targetTime}:00`;
}

function normalizeStatus(value: string | null) {
  if (!value) return "予約";

  if (value === "pending") return "予約";
  if (value === "confirmed") return "予約";
  if (value === "completed") return "完了";
  if (value === "cancelled") return "キャンセル";

  if (value === "予約受付") return "予約";
  if (value === "来店予定") return "来店";
  if (value === "完了待ち") return "来店";

  if (
    value === "予約" ||
    value === "来店" ||
    value === "完了" ||
    value === "キャンセル"
  ) {
    return value;
  }

  return "予約";
}

export default function EditReservationPage() {
  const router = useRouter();
  const params = useParams();

  const reservationId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [salons, setSalons] = useState<Salon[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allStaffs, setAllStaffs] = useState<Staff[]>([]);

  const [salonId, setSalonId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [menu, setMenu] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] =
    useState<"予約" | "来店" | "完了" | "キャンセル">("予約");
  const [memo, setMemo] = useState("");

  async function loadPageData() {
    if (!reservationId) {
      setErrorMessage("予約IDが取得できませんでした");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const [reservationRes, salonsRes, customersRes, staffsRes] =
      await Promise.all([
        supabase
          .from("reservations")
          .select(
            "id, salon_id, customer_id, staff_id, menu, start_at, end_at, status, memo"
          )
          .eq("id", reservationId)
          .single(),
        supabase
          .from("salons")
          .select("id, name")
          .order("created_at", { ascending: true }),
        supabase
          .from("customers")
          .select("id, name, salon_id")
          .order("name", { ascending: true }),
        supabase
          .from("staffs")
          .select("id, name, salon_id")
          .order("created_at", { ascending: true }),
      ]);

    if (
      reservationRes.error ||
      !reservationRes.data ||
      salonsRes.error ||
      customersRes.error ||
      staffsRes.error
    ) {
      setErrorMessage("予約情報の取得に失敗しました");
      setLoading(false);
      return;
    }

    const reservation = reservationRes.data as ReservationDetail;

    setSalons((salonsRes.data ?? []) as Salon[]);
    setAllCustomers((customersRes.data ?? []) as Customer[]);
    setAllStaffs((staffsRes.data ?? []) as Staff[]);

    setSalonId(reservation.salon_id ?? "");
    setCustomerId(reservation.customer_id ?? "");
    setStaffId(reservation.staff_id ?? "");
    setMenu(reservation.menu ?? "");
    setDate(extractDate(reservation.start_at));
    setStartTime(extractTime(reservation.start_at));
    setEndTime(extractTime(reservation.end_at));
    setStatus(
      normalizeStatus(reservation.status) as
        | "予約"
        | "来店"
        | "完了"
        | "キャンセル"
    );
    setMemo(reservation.memo ?? "");

    setLoading(false);
  }

  useEffect(() => {
    loadPageData();
  }, [reservationId]);

  const filteredCustomers = useMemo(() => {
    return allCustomers.filter((item) =>
      salonId ? item.salon_id === salonId : true
    );
  }, [allCustomers, salonId]);

  const filteredStaffs = useMemo(() => {
    return allStaffs.filter((item) =>
      salonId ? item.salon_id === salonId : true
    );
  }, [allStaffs, salonId]);

  function handleSalonChange(nextSalonId: string) {
    setSalonId(nextSalonId);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!reservationId) return;

    if (!salonId || !customerId || !staffId || !date || !startTime || !endTime) {
      setErrorMessage("必要項目を入力してください");
      return;
    }

    const startAt = buildDateTime(date, startTime);
    const endAt = buildDateTime(date, endTime);

    if (!startAt || !endAt || startAt >= endAt) {
      setErrorMessage("日時を正しく入力してください");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("reservations")
      .update({
        salon_id: salonId,
        customer_id: customerId,
        staff_id: staffId,
        menu: menu || null,
        start_at: startAt,
        end_at: endAt,
        status,
        memo: memo || null,
      })
      .eq("id", reservationId);

    setSaving(false);

    if (error) {
      setErrorMessage("予約の更新に失敗しました");
      return;
    }

    router.push(customerId ? `/customers/${customerId}` : "/reservations");
  }

  async function handleDelete() {
    if (!reservationId) return;

    const confirmed = window.confirm("この予約を削除しますか？");
    if (!confirmed) return;

    setDeleting(true);

    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("id", reservationId);

    setDeleting(false);

    if (error) {
      setErrorMessage("予約の削除に失敗しました");
      return;
    }

    router.push(customerId ? `/customers/${customerId}` : "/reservations");
  }

  const backHref = customerId ? `/customers/${customerId}` : "/reservations";

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 sm:p-6">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">予約編集ページ</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                ご予約内容の変更・削除ができるページです。
              </p>
            </div>

            <Link
              href={backHref}
              className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600"
            >
              戻る
            </Link>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
            読み込み中...
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm sm:p-6"
          >
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
                >
                  <option value="">選択してください</option>
                  {salons.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || "名称未設定"}
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
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                >
                  <option value="">選択してください</option>
                  {filteredCustomers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || "名前未登録"}
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
                >
                  <option value="">選択してください</option>
                  {filteredStaffs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || "名前未登録"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  メニュー
                </label>
                <input
                  value={menu}
                  onChange={(e) => setMenu(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  状態
                </label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(
                      e.target.value as
                        | "予約"
                        | "来店"
                        | "完了"
                        | "キャンセル"
                    )
                  }
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                >
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  メモ
                </label>
                <textarea
                  rows={4}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? "更新中..." : "更新する"}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-2xl border border-rose-200 bg-white py-4 text-sm font-bold text-rose-600 disabled:opacity-60"
              >
                {deleting ? "削除中..." : "削除する"}
              </button>

              <Link
                href={backHref}
                className="rounded-2xl border border-rose-200 bg-white py-4 text-center text-sm font-bold text-slate-700"
              >
                キャンセル
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}