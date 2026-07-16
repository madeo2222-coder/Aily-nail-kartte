import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { getVeriTransTokenApiKey } from "@/lib/veritrans/config";
import PaymentPageClient from "./PaymentPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type NailTipRequest = {
  id: string;
  customer_name: string | null;
  quote_amount: number | string | null;
  payment_status: string | null;
  status: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase環境変数不足");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default async function InboundNailTipPaymentPage({
  params,
}: PageProps) {
  const { id } = await params;

  if (!id) {
    notFound();
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("inbound_nail_tip_requests")
    .select(
      `
        id,
        customer_name,
        quote_amount,
        payment_status,
        status
      `
    )
    .eq("id", id)
    .single<NailTipRequest>();

  if (error || !data) {
    notFound();
  }

  const amount = Number(data.quote_amount || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return (
      <main className="min-h-screen bg-stone-50 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-red-600">
            お支払い情報を確認できません
          </p>

          <h1 className="mt-2 text-xl font-bold text-stone-900">
            見積金額が設定されていません
          </h1>

          <p className="mt-3 text-sm leading-6 text-stone-600">
            Aily Nail Studioへお問い合わせください。
          </p>
        </div>
      </main>
    );
  }

  if (data.payment_status === "paid") {
    return (
      <main className="min-h-screen bg-stone-50 px-4 py-10">
        <div className="mx-auto max-w-lg rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-emerald-600">
            Payment completed
          </p>

          <h1 className="mt-2 text-2xl font-bold text-stone-900">
            お支払い済みです
          </h1>

          <p className="mt-3 text-sm leading-6 text-stone-600">
            ご入金を確認しています。ネイルチップの制作準備を進めます。
          </p>

          <div className="mt-6 rounded-2xl bg-emerald-50 p-4">
            <div className="text-sm text-emerald-700">お支払い金額</div>

            <div className="mt-1 text-3xl font-bold text-emerald-900">
              ¥{amount.toLocaleString("ja-JP")}
            </div>
          </div>

          <p className="mt-6 text-sm text-stone-500">
            Aily Nail Studio
          </p>
        </div>
      </main>
    );
  }

  const tokenApiKey = getVeriTransTokenApiKey();

  return (
    <PaymentPageClient
      requestId={data.id}
      customerName={data.customer_name || "Customer"}
      amount={amount}
      tokenApiKey={tokenApiKey}
    />
  );
}