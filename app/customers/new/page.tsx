"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function NewCustomerPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setErrorMessage("お名前を入力してください。");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    const payload = {
      name: trimmedName,
      phone: trimmedPhone ? trimmedPhone : null,
    };

    const { data, error } = await supabase
      .from("customers")
      .insert([payload])
      .select("id")
      .single();

    if (error) {
      setErrorMessage(error.message || "顧客登録に失敗しました。");
      setSubmitting(false);
      return;
    }

    const newId =
      data && typeof data.id === "string" && data.id.trim() ? data.id : "";

    if (newId) {
      router.push(`/customers/${newId}`);
      return;
    }

    router.push("/customers");
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-sm text-neutral-500">顧客登録</p>
          <h1 className="text-2xl font-bold text-neutral-900">新規顧客登録</h1>
          <p className="mt-1 text-sm text-neutral-600">
            今は安全運用のため、名前と電話番号のみ登録します。
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-neutral-700"
              >
                お名前 <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：山田 花子"
                className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-500"
                autoComplete="name"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="mb-2 block text-sm font-medium text-neutral-700"
              >
                電話番号
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="例：09012345678"
                className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-500"
                autoComplete="tel"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={() => router.push("/customers")}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                キャンセル
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "登録中..." : "顧客を登録する"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}