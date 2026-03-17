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
  const [status, setStatus] = useState("confirmed");
  const [memo, setMemo] = useState("");

  async function loadPageData() {
    if (!reservationId) {
      setErrorMessage("予約IDが取得できませんでした");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const [reservationRes, salonsRes, customersRes, staffsRes] = await Promise.all([
      supabase
        .from("reservations")
        .select("id, salon_id, customer_id, staff_id, menu, start_at, end_at, status, memo")
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

    if (reservationRes.error || !reservationRes.data) {
      setErrorMessage("予約情報の取得に失敗しました");
      setLoading(false);
      return;
    }

    if (salonsRes.error) {
      setErrorMessage("サロン情報の取得に失敗しました");
      setLoading(false);
      return;
    }

    if (customersRes.error) {
      setErrorMessage("顧客情報の取得に失敗しました");
      setLoading(false);
      return;
    }

    if (staffsRes.error) {
      setErrorMessage("スタッフ情報の取得に失敗しました");
      setLoading(false);
      return;
    }

    const reservation = reservationRes.data as ReservationDetail;
    const salonList = (salonsRes.data ?? []) as Salon[];
    const customerList = (customersRes.data ?? []) as Customer[];
    const staffList = (staffsRes.data ?? []) as Staff[];

    setSalons(salonList);
    setAllCustomers(customerList);
    setAllStaffs(staffList);

    setSalonId(reservation.salon_id ?? "");
    setCustomerId(reservation.customer_id ?? "");
    setStaffId(reservation.staff_id ?? "");
    setMenu(reservation.menu ?? "");
    setDate(extractDate(reservation.start_at));
    setStartTime(extractTime(reservation.start_at));
    setEndTime(extractTime(reservation.end_at));
    setStatus(reservation.status ?? "confirmed");
    setMemo(reservation.memo ?? "");

    setLoading(false);
  }

  useEffect(() => {
    loadPageData();
  }, [reservationId]);

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

    if (selectedCustomer.salon_id !== salonId) {
      const nextSalonId = selectedCustomer.salon_id;
      setSalonId(nextSalonId);

      const nextStaffs = allStaffs.filter((item) => item.salon_id === nextSalonId);
      const staffExists = nextStaffs.some((item) => item.id === staffId);
      setStaffId(staffExists ? staffId : nextStaffs[0]?.id ?? "");
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!reservationId) {
      setErrorMessage("予約IDが取得できませんでした");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    if (!salonId) {
      setErrorMessage("サロンを選択してください");
      setSaving(false);
      return;
    }

    if (!customerId) {
      setErrorMessage("顧客を選択してください");
      setSaving(false);
      return;
    }

    if (!staffId) {
      setErrorMessage("スタッフを選択してください");
      setSaving(false);
      return;
    }

    if (!date || !startTime || !endTime) {
      setErrorMessage("日時を入力してください");
      setSaving(false);
      return;
    }

    const startAt = buildDateTime(date, startTime);
    const endAt = buildDateTime(date, endTime);

    if (!startAt || !endAt) {
      setErrorMessage("日時の形式が正しくありません");
      setSaving(false);
      return;
    }

    if (startAt >= endAt) {
      setErrorMessage("終了時間は開始時間より後にしてください");
      setSaving(false);
      return;
    }

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

    if (error) {
      setErrorMessage("予約の更新に失敗しました");
      setSaving(false);
      return;
    }

    setSaving(false);

    if (customerId) {
      router.push(`/customers/${customerId}`);
      return;
    }

    router.push("/reservations");
  }

  async function handleDelete() {
    if (!reservationId) {
      setErrorMessage("予約IDが取得できませんでした");
      return;
    }

    const confirmed = window.confirm("この予約を削除しますか？");
    if (!confirmed) return;

    setDeleting(true);
    setErrorMessage("");

    const currentCustomerId = customerId;

    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("id", reservationId);

    if (error) {
      setErrorMessage("予約の削除に失敗しました");
      setDeleting(false);
      return;
    }

    setDeleting(false);

    if (currentCustomerId) {
      router.push(`/customers/${currentCustomerId}`);
      return;
    }

    router.push("/reservations");
  }

  const backHref = customerId ? `/customers/${customerId}` : "/reservations";

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">予約編集</h1>
          <p className="mt-1 text-sm text-gray-500">
            更新後は顧客詳細へ戻れるようにしています
          </p>
        </div>

        <Link
          href={backHref}
          className="rounded border px-4 py-2 text-sm hover:bg-gray-50"
        >
          戻る
        </Link>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-white p-6">
          <p>読み込み中...</p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-lg border bg-white p-4 sm:p-6"
        >
          {errorMessage ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium">サロン</label>
            <select
              value={salonId}
              onChange={(e) => handleSalonChange(e.target.value)}
              className="w-full rounded border px-3 py-2"
            >
              <option value="">選択してください</option>
              {salons.map((salon) => (
                <option key={salon.id} value={salon.id}>
                  {salon.name ?? "名称未設定"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">顧客</label>
            <select
              value={customerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="w-full rounded border px-3 py-2"
            >
              <option value="">選択してください</option>
              {filteredCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name ?? "名前未登録"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">担当スタッフ</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full rounded border px-3 py-2"
            >
              <option value="">選択してください</option>
              {filteredStaffs.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name ?? "名前未登録"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">メニュー</label>
            <input
              type="text"
              value={menu}
              onChange={(e) => setMenu(e.target.value)}
              placeholder="ワンカラー / 定額デザイン など"
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium">日付</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">開始時間</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">終了時間</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">状態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded border px-3 py-2"
            >
              <option value="pending">pending</option>
              <option value="confirmed">confirmed</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">メモ</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              className="w-full rounded border px-3 py-2"
              placeholder="要望や補足があれば入力"
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-black px-5 py-2 text-white disabled:opacity-60"
            >
              {saving ? "更新中..." : "更新する"}
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded border border-red-300 px-5 py-2 text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              {deleting ? "削除中..." : "削除する"}
            </button>

            <Link
              href={backHref}
              className="rounded border px-5 py-2 hover:bg-gray-50"
            >
              キャンセル
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}