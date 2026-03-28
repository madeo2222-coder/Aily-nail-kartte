import { Suspense } from "react";
import SalesDashboardPageClient from "./SalesDashboardPageClient";

export const dynamic = "force-dynamic";

function Fallback() {
  return <div className="p-4 pb-24">読み込み中...</div>;
}

export default function Page() {
  return (
    <Suspense fallback={<Fallback />}>
      <SalesDashboardPageClient />
    </Suspense>
  );
}