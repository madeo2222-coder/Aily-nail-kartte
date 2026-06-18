import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NailTipOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-purple-50/40">
      <div className="mx-auto w-full max-w-[920px] space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-5 text-white shadow-sm">
          <div>
            <p className="text-xs font-bold tracking-[0.25em] text-white/80">
              NAILY AIDOL
            </p>

            <h1 className="mt-2 text-2xl font-bold">
              ネイルチップ注文詳細
            </h1>

            <p className="mt-2 text-sm text-white/90">
              注文ID：{id}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="text-lg font-bold text-slate-900">
            詳細画面準備完了
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            次段階でSupabaseから注文データを取得し、
            顧客情報・診断結果・商品情報・配送情報を表示します。
          </p>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">
              注文ID
            </div>

            <div className="mt-1 font-mono text-sm font-bold text-slate-900">
              {id}
            </div>
          </div>
        </section>

        <Link
          href="/nail-tip-orders"
          className="block rounded-2xl bg-purple-600 px-4 py-3 text-center text-sm font-bold text-white"
        >
          注文一覧へ戻る
        </Link>
      </div>
    </main>
  );
}