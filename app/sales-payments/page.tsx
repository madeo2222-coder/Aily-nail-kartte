import { Suspense } from "react";
import SalesPaymentsClient from "./SalesPaymentsClient";

export const dynamic = "force-dynamic";

export default function SalesPaymentsPage() {
  return (
    <Suspense fallback={<div className="p-4">読み込み中...</div>}>
      <SalesPaymentsClient />
    </Suspense>
  );
}