"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ReservationRow = {
  id: string;
  customer_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

type CustomerRow = {
  id: string;
  name: string | null;
};

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const customerMap = useMemo(() => {
    const map: Record<string, string> = {};
    customers.forEach((customer) => {
      map[customer.id] = customer.name || "顧客名未設定";
    });
    return map;
  }, [customers]);

  const fetchReservations = async () => {
    setLoading(true);

    const [reservationsRes, customersRes] = await Promise.all([
      supabase.from("reservations").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name"),
    ]);

    if (reservationsRes.error) {
      console.error("reservations fetch error:", reservationsRes.error.message);
      setReservations([]);
    } else {
      setReservations((reservationsRes.data as ReservationRow[]) || []);
    }

    if (customersRes.error) {
      console.error("customers fetch error:", customersRes.error.message);
      setCustomers([]);
    } else {
      setCustomers((customersRes.data as CustomerRow[]) || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchReservations();
  }, []);

  const handleMarkVisited = async (id: string) => {
    const ok = window.confirm("この予約を『来店』に変更しますか？");
    if (!ok) return;

    setUpdatingId(id);

    const { error } = await supabase
      .from("reservations")
      .update({ status: "来店" })
      .eq("id", id);

    setUpdatingId(null);

    if (error) {
      alert("更新に失敗しました: " + error.message);
      return;
    }

    await fetchReservations();
  };

  const handleMarkCompleted = async (id: string) => {
    const ok = window.confirm("この予約を『完了』に変更しますか？");
    if (!ok) return;

    setUpdatingId(id);

    const { error } = await supabase
      .from("reservations")
      .update({ status: "完了" })
      .eq("id", id);

    setUpdatingId(null);

    if (error) {
      alert("更新に失敗しました: " + error.message);
      return;
    }

    await fetchReservations();
  };

  const getReservationDate = (reservation: ReservationRow) => {
    return (
      (typeof reservation.reservation_date === "string" && reservation.reservation_date) ||
      (typeof reservation.date === "string" && reservation.date) ||
      (typeof reservation.reserved_at === "string" && reservation.reserved_at) ||
      (typeof reservation.visit_date === "string" && reservation.visit_date) ||
      (typeof reservation.created_at === "string" && reservation.created_at) ||
      null
    );
  };

  const getStatus = (reservation: ReservationRow) => {
    return (
      (typeof reservation.status === "string" && reservation.status) ||
      "予約"
    );
  };

  const getStatusBadgeClass = (status: string) => {
    if (status === "来店") return "bg-blue-100 text-blue-700";
    if (status === "完了") return "bg-green-100 text-green-700";
    return "bg-gray-100 text-gray-700";
  };

  const formatDate = (value: string | null) => {
    if (!value) return "未設定";
    return value.slice(0, 10);
  };

  return (
    <div
      className="mx-auto w-full max-w-[720px] p-4"
      style={{ paddingBottom: "100px" }}
      suppressHydrationWarning
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">予約一覧</h1>
          <p className="mt-1 text-sm text-gray-500">予約の確認・更新ができます</p>
        </div>

        <Link
          href="/reservations/new"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          新規予約
        </Link>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">
          読み込み中...
        </div>
      ) : reservations.length === 0 ? (
        <div className="rounded-xl border bg-white p-5 text-center text-sm text-gray-500">
          予約はまだありません
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map((reservation) => {
            const status = getStatus(reservation);
            const customerId =
              typeof reservation.customer_id === "string"
                ? reservation.customer_id
                : null;

            const customerName = customerId
              ? customerMap[customerId] || "顧客名未設定"
              : "顧客未設定";

            return (
              <div
                key={reservation.id}
                className="rounded-2xl border bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">{customerName}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      予約日：{formatDate(getReservationDate(reservation))}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
                      status
                    )}`}
                  >
                    {status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {status === "予約" && (
                    <button
                      type="button"
                      onClick={() => handleMarkVisited(reservation.id)}
                      disabled={updatingId === reservation.id}
                      className="rounded-lg border px-3 py-2 text-sm font-medium"
                      suppressHydrationWarning
                    >
                      {updatingId === reservation.id ? "更新中..." : "来店にする"}
                    </button>
                  )}

                  {status === "来店" && (
                    <button
                      type="button"
                      onClick={() => handleMarkCompleted(reservation.id)}
                      disabled={updatingId === reservation.id}
                      className="rounded-lg border px-3 py-2 text-sm font-medium"
                      suppressHydrationWarning
                    >
                      {updatingId === reservation.id ? "更新中..." : "完了にする"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}