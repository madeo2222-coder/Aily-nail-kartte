import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { getVeriTransTokenApiKey } from "@/lib/veritrans/config";
import PaymentPageClient from "./PaymentPageClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string | string[] }>;
};

type NailTipOrderRow = {
  id: string;
  customer_id: string | null;
  product_name_snapshot: string | null;
  product_price: number | null;
  payment_status: string | null;
  payment_due_at: string | null;
  payment_link_token_hash: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase configuration is missing");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function hashPaymentLinkKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function tokenHashesMatch(receivedHash: string, storedHash: string) {
  if (!/^[0-9a-f]{64}$/.test(storedHash)) return false;

  const received = Buffer.from(receivedHash, "hex");
  const stored = Buffer.from(storedHash, "hex");

  return received.length === stored.length && timingSafeEqual(received, stored);
}

function PaymentUnavailable({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-3xl border bg-white p-6 shadow-sm">
        <p className="text-sm font-bold tracking-[0.16em] text-stone-500">
          AILY NAIL STUDIO
        </p>
        <h1 className="mt-3 text-2xl font-bold text-stone-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">{message}</p>
      </div>
    </main>
  );
}

export default async function NailTipOrderPaymentPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const paymentLinkKey =
    typeof query.key === "string" ? query.key.trim() : "";

  if (!id || !/^[A-Za-z0-9_-]{43}$/.test(paymentLinkKey)) {
    notFound();
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("nail_tip_orders")
    .select(
      "id, customer_id, product_name_snapshot, product_price, payment_status, payment_due_at, payment_link_token_hash"
    )
    .eq("id", id)
    .maybeSingle<NailTipOrderRow>();

  if (error || !data || !data.payment_link_token_hash) {
    notFound();
  }

  const receivedHash = hashPaymentLinkKey(paymentLinkKey);

  if (!tokenHashesMatch(receivedHash, data.payment_link_token_hash)) {
    notFound();
  }

  const amount = Number(data.product_price);

  if (data.payment_status === "paid") {
    return (
      <PaymentUnavailable
        title="お支払い済みです"
        message="ご入金を確認しています。ネイルチップの制作準備を進めます。"
      />
    );
  }

  if (!Number.isInteger(amount) || amount <= 0 || !data.product_name_snapshot) {
    return (
      <PaymentUnavailable
        title="お支払い情報を確認できません"
        message="Aily Nail Studioへお問い合わせください。"
      />
    );
  }

  const paymentDueAt = data.payment_due_at;

  if (!paymentDueAt) {
    return (
      <PaymentUnavailable
        title="お支払い期限を確認できません"
        message="Aily Nail Studioへお問い合わせください。"
      />
    );
  }

  const dueDate = new Date(paymentDueAt);

  if (Number.isNaN(dueDate.getTime()) || dueDate <= new Date()) {
    return (
      <PaymentUnavailable
        title="お支払い期限を過ぎています"
        message="新しい決済URLについてAily Nail Studioへお問い合わせください。"
      />
    );
  }

  if (process.env.VERITRANS_DUMMY?.trim() !== "1") {
    return (
      <PaymentUnavailable
        title="本番カード決済は現在準備中です"
        message="Aily Nail Studioへお問い合わせください。"
      />
    );
  }

  let customerName = "お客様";

  if (data.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("id", data.customer_id)
      .maybeSingle<{ name: string | null }>();

    if (customer?.name?.trim()) {
      customerName = customer.name.trim();
    }
  }

  return (
    <PaymentPageClient
      orderId={data.id}
      paymentLinkKey={paymentLinkKey}
      customerName={customerName}
      productName={data.product_name_snapshot}
      amount={amount}
      paymentDueAt={paymentDueAt}
      tokenApiKey={getVeriTransTokenApiKey()}
    />
  );
}
