"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
  created_at?: string | null;
};

type Visit = {
  id: string;
  visit_date: string | null;
  menu: string | null;
  note: string | null;
  created_at?: string | null;
};

type Reservation = {
  id: string;
  reserved_at: string | null;
  status: string | null;
  menu: string | null;
  created_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();

  const customerId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchCustomerDetail = useCallback(async () => {
    if (!customerId) {
      setErrorMessage("顧客IDが取得できませんでした。");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const customerRes = await supabase
      .from("customers")
      .select("id, name, phone, created_at")
      .eq("id", customerId)
      .single();

    if (customerRes.error) {
      setCustomer(null);
      setVisits([]);
      setReservations([]);
      setErrorMessage(customerRes.error.message || "顧客情報の取得に失敗しました。");
      setLoading(false);
      return;
    }

    setCustomer(customerRes.data as Customer);

    const visitsRes = await supabase
      .from("visits")
      .select("id, visit_date, menu, note, created_at")
      .eq("customer_id", customerId)
      .order("visit_date", { ascending: false });

    if (visitsRes.error) {
      setVisits([]);
    } else {
      setVisits((visitsRes.data ?? []) as Visit[]);
    }

    const reservationsRes = await supabase
      .from("reservations")
      .select("id, reserved_at, status, menu, created_at")
      .eq("customer_id", customerId)
      .order("reserved_at", { ascending: false });

    if (reservationsRes.error) {
      setReservations([]);
    } else {
      setReservations((reservationsRes.data ?? []) as Reservation[]);
    }

    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    fetchCustomerDetail();
  }, [fetchCustomerDetail]);

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            読み込み中です...
          </div>
        </div>
      </main>
    );
  }

  if (errorMessage || !customer) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage || "顧客情報が見つかりませんでした。"}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/customers")}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              顧客一覧へ戻る
            </button>

            <button
              type="button"
              onClick={() => fetchCustomerDetail()}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              再読み込み
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-neutral-500">顧客詳細</p>
            <h1 className="text-2xl font-bold text-neutral-900">
              {customer.name?.trim() ? customer.name : "名前未登録"}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/customers")}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              顧客一覧
            </button>

            <button
              type="button"
              onClick={() => router.push(`/visits/new?customer_id=${customer.id}`)}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              来店登録
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(`/reservations/new?customer_id=${customer.id}`)
              }
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              予約登録
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-neutral-900">
              基本情報
            </h2>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-neutral-500">名前</p>
                <p className="text-sm font-medium text-neutral-900">
                  {customer.name?.trim() ? customer.name : "名前未登録"}
                </p>
              </div>

              <div>
                <p className="text-xs text-neutral-500">電話番号</p>
                <p className="text-sm text-neutral-700">
                  {customer.phone?.trim() ? customer.phone : "-"}
                </p>
              </div>

              <div>
                <p className="text-xs text-neutral-500">登録日</p>
                <p className="text-sm text-neutral-700">
                  {formatDate(customer.created_at)}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 text-base font-semibold text-neutral-900">
              クイック操作
            </h2>

            <div className="grid gap-3">
              <Link
                href={`/visits/new?customer_id=${customer.id}`}
                className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                この顧客で来店履歴を追加
              </Link>

              <Link
                href={`/reservations/new?customer_id=${customer.id}`}
                className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                この顧客で予約を追加
              </Link>

              <Link
                href={`/customers/${customer.id}/mypage`}
                className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-3 text-sm font-medium text-white hover:opacity-90"
              >
                顧客マイページを見る
              </Link>
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <h2 className="text-base font-semibold text-neutral-900">
                来店履歴
              </h2>
              <span className="text-xs text-neutral-500">{visits.length}件</span>
            </div>

            {visits.length === 0 ? (
              <div className="p-5 text-sm text-neutral-600">
                来店履歴はまだありません。
              </div>
            ) : (
              <div className="divide-y divide-neutral-200">
                {visits.map((visit) => (
                  <div key={visit.id} className="px-5 py-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-neutral-900">
                        {visit.menu?.trim() ? visit.menu : "メニュー未登録"}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {formatDate(visit.visit_date)}
                      </p>
                    </div>

                    <p className="text-sm text-neutral-600">
                      {visit.note?.trim() ? visit.note : "メモなし"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <h2 className="text-base font-semibold text-neutral-900">予約</h2>
              <span className="text-xs text-neutral-500">
                {reservations.length}件
              </span>
            </div>

            {reservations.length === 0 ? (
              <div className="p-5 text-sm text-neutral-600">
                予約はまだありません。
              </div>
            ) : (
              <div className="divide-y divide-neutral-200">
                {reservations.map((reservation) => (
                  <div key={reservation.id} className="px-5 py-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-neutral-900">
                        {reservation.menu?.trim()
                          ? reservation.menu
                          : "メニュー未登録"}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {formatDateTime(reservation.reserved_at)}
                      </p>
                    </div>

                    <p className="text-sm text-neutral-600">
                      状態: {reservation.status?.trim() ? reservation.status : "-"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}