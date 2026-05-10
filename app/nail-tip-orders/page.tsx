import { Suspense } from "react";
import NailTipOrdersPageClient from "./NailTipOrdersPageClient";

export const dynamic = "force-dynamic";

function NailTipOrdersPageFallback() {
  return <div className="p-4 pb-24">読み込み中...</div>;
}

export default function NailTipOrdersPage() {
  return (
    <Suspense fallback={<NailTipOrdersPageFallback />}>
      <NailTipOrdersPageClient />
    </Suspense>
  );
}