import { Suspense } from "react";
import CustomersPageClient from "./CustomersPageClient";

export const dynamic = "force-dynamic";

function CustomersFallback() {
  return <div className="p-4 pb-24">読み込み中...</div>;
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<CustomersFallback />}>
      <CustomersPageClient />
    </Suspense>
  );
}