import Link from "next/link";
import { redirect } from "next/navigation";

import { authenticateStaff } from "@/lib/server/staffAuthentication";
import { loadVisitRegistrationFormData } from "@/lib/server/visitRegistrationFormData";
import SecureNewVisitPageClient from "./SecureNewVisitPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function getTodayInJapan() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export default async function SecureNewVisitPage({ searchParams }: PageProps) {
  const authentication = await authenticateStaff();

  if (!authentication.ok) {
    redirect("/login");
  }

  const params = await searchParams;
  const formData = await loadVisitRegistrationFormData({
    salonId: authentication.staff.salonId,
    reservationId: firstValue(params.reservation_id),
    requestedCustomerId: firstValue(params.customer_id),
  });

  if (!formData.ok) {
    return (
      <main className="min-h-screen bg-rose-50/40 p-4">
        <section className="mx-auto max-w-xl rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">
            来店登録を開始できませんでした
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {formData.message}
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
    <SecureNewVisitPageClient
      customers={formData.data.customers}
      staffs={formData.data.staffs}
      reservation={formData.data.reservation}
      initialCustomerId={formData.data.initialCustomerId}
      defaultVisitDate={getTodayInJapan()}
    />
  );
}
