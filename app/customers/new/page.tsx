"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCustomerPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const submissionInFlight = useRef(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (submissionInFlight.current || submitting) return;

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setErrorMessage("お名前を入力してください。");
      return;
    }

    submissionInFlight.current = true;
    setSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/customers/staff-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          phone: trimmedPhone,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        id?: string;
        existing?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok || !result.id) {
        throw new Error(result.error || "顧客登録に失敗しました。");
      }

      if (result.existing) {
        alert("同じ顧客が見つかったため、既存カルテを開きます。");
      }

      router.push(`/customers/${result.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "顧客登録に失敗しました。";
      setErrorMessage(message);
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-sm text-neutral-500">顧客登録</p>
          <h1 className="text-2xl font-bold text-neutral-900">新規顧客登録</h1>
          <p className="mt-1 text-sm text-neutral-600">
            同じ電話番号・同じ名前の顧客がいる場合は、既存カルテを開きます。
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
                {submitting ? "確認中..." : "顧客を登録する"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
