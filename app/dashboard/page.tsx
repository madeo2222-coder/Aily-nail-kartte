import { Suspense } from "react";
import DashboardPageClient from "./DashboardPageClient";

export const dynamic = "force-dynamic";

function DashboardPageFallback() {
  return <div className="p-4 pb-24">読み込み中...</div>;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardPageClient />
    </Suspense>
  );
}