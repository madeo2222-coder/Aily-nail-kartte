import { Suspense } from "react";
import ReservationsPageClient from "./ReservationsPageClient";

export const dynamic = "force-dynamic";

function ReservationsPageFallback() {
  return <div className="p-4 pb-24">読み込み中...</div>;
}

export default function ReservationsPage() {
  return (
    <Suspense fallback={<ReservationsPageFallback />}>
      <ReservationsPageClient />
    </Suspense>
  );
}