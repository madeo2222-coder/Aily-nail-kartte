"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";

export default function CustomerEditPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [name, setName] = useState("");
  const [nameKana, setNameKana] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState<"not-found" | "failed" | null>(null);

  const fetchCustomer = useCallback(async () => {
    setFetching(true);
    setLoadError(null);

    if (!customerId) {
      setLoadError("not-found");
      setFetching(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, name_kana, phone")
        .eq("id", customerId)
        .single();

      if (error || !data) {
        console.error("顧客取得エラー:", error);
        setLoadError(error ? (error.code === "PGRST116" ? "not-found" : "failed") : "not-found");
        return;
      }

      setName(data.name || "");
      setNameKana(data.name_kana || "");
      setPhone(data.phone || "");
    } catch (error) {
      console.error("顧客取得エラー:", error);
      setLoadError("failed");
    } finally {
      setFetching(false);
    }
  }, [customerId]);

  useEffect(() => {
    void Promise.resolve().then(fetchCustomer);
  }, [fetchCustomer]);

  function normalizePhone(value: string) {
    const raw = value.replace(/[^\d+]/g, "");

    if (raw.startsWith("+81")) {
      return raw;
    }

    if (raw.startsWith("0")) {
      return "+81" + raw.slice(1);
    }

    return raw;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      alert("名前を入力してください");
      return;
    }

    setLoading(true);

    const normalizedPhone = phone ? normalizePhone(phone) : null;

    const { error } = await supabase
      .from("customers")
      .update({
        name: name.trim(),
        name_kana: nameKana.trim() || null,
        phone: normalizedPhone,
      })
      .eq("id", customerId);

    setLoading(false);

    if (error) {
      console.error("顧客更新エラー:", error);
      alert("顧客情報の更新に失敗しました");
      return;
    }

    alert("顧客情報を更新しました");
    router.push(`/customers/${customerId}`);
  }

  if (fetching) {
    return (
      <main className="min-h-screen bg-rose-50/40">
        <div className="mx-auto max-w-2xl p-4 pb-24">
          <div className="rounded-[28px] border border-rose-100 bg-white p-4 text-sm text-gray-500 shadow-sm">
            読み込み中...
          </div>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-rose-50/40">
        <div className="mx-auto max-w-2xl p-4 pb-24">
          <section
            className="rounded-[28px] border border-red-200 bg-white p-5 shadow-sm"
            role="alert"
          >
            <h1 className="text-lg font-bold text-red-900">
              {loadError === "not-found"
                ? "顧客情報が見つかりません"
                : "顧客情報を取得できませんでした"}
            </h1>
            <p className="mt-2 text-sm text-red-800">
              {loadError === "not-found"
                ? "削除済み、または参照できない顧客の可能性があります。"
                : "通信状況を確認して、もう一度お試しください。"}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void fetchCustomer()}
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
              >
                再試行
              </button>
              <button
                type="button"
                onClick={() => router.push("/customers")}
                className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600"
              >
                顧客一覧に戻る
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">顧客編集ページ</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                お客様の基本情報を、見やすく整えて更新できるページです。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push(`/customers/${customerId}`)}
                className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
              >
                顧客詳細へ
              </button>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">基本情報</h2>
              <p className="mt-1 text-sm text-slate-500">
                名前、フリガナ、電話番号を更新できます。
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  名前
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  placeholder="顧客名"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  フリガナ
                </label>
                <input
                  type="text"
                  value={nameKana}
                  onChange={(e) => setNameKana(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  placeholder="ヤマダ ハナコ"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  電話番号
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  placeholder="09012345678 または +819012345678"
                />
                <p className="mt-2 text-xs text-slate-500">
                  保存時に 090 形式は自動で +81 形式へ変換します
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "更新中..." : "更新する"}
            </button>

            <button
              type="button"
              onClick={() => router.push(`/customers/${customerId}`)}
              className="w-full rounded-2xl border border-rose-200 bg-white py-4 text-sm font-bold text-rose-600"
            >
              戻る
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
