import { Suspense } from "react";
import NewVisitPageClient from "./NewVisitPageClient";

export const dynamic = "force-dynamic";

function LoadingFallback() {
  return <div className="p-4 pb-24">読み込み中...</div>;
}

export default function NewVisitPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <NewVisitPageClient />
    </Suspense>
  );
}