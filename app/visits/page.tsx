import { Suspense } from "react";
import VisitsPageClient from "./VisitsPageClient";

export const dynamic = "force-dynamic";

function VisitsPageFallback() {
  return <div className="p-4 pb-24">読み込み中...</div>;
}

export default function VisitsPage() {
  return (
    <Suspense fallback={<VisitsPageFallback />}>
      <VisitsPageClient />
    </Suspense>
  );
}