"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string | null;
  phone?: string | null;
};

type IntakeData = {
  allergy: string | null;
  consent: string | null;
  ng_items: string | null;
  signature: string | null;
  created_at: string | null;
};

type IntakeRow = Record<string, unknown>;

function pickString(row: IntakeRow | null | undefined, keys: string[]): string | null {
  if (!row) return null;

  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "あり" : "なし";
  }

  return null;
}

function pickConsent(row: IntakeRow | null | undefined): string | null {
  if (!row) return null;

  const booleanKeys = [
    "consent",
    "agreement",
    "agreed",
    "is_agreed",
    "is_consented",
    "consent_checked",
  ];

  for (const key of booleanKeys) {
    const value = row[key];
    if (typeof value === "boolean") return value ? "あり" : "なし";
    if (typeof value === "string" && value.trim() !== "") return value;
  }

  return null;
}

function normalizeIntake(row: IntakeRow | null): IntakeData | null {
  if (!row) return null;

  return {
    allergy: pickString(row, ["allergy", "allergies", "allergy_note", "allergy_notes"]),
    consent: pickConsent(row),
    ng_items: pickString(row, ["ng_items", "ng_item", "ng_note", "ng_notes", "avoid_items"]),
    signature: pickString(row, ["signature", "signature_data", "signature_url", "sign_data"]),
    created_at: pickString(row, ["created_at"]),
  };
}

function isLikelyImage(value: string | null): boolean {
  if (!value) return false;
  return (
    value.startsWith("data:image/") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("/")
  );
}

async function fetchLatestIntake(customerId: string): Promise<IntakeData | null> {
  const tableCandidates = ["customer_intakes", "customer_intake"];

  for (const table of tableCandidates) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return normalizeIntake(data as IntakeRow);
    }

    // テーブルが違う/存在しない場合は次候補へ
    if (error) continue;
  }

  return null;
}

export default function NewVisitPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);

  const [customerId, setCustomerId] = useState("");
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [menuName, setMenuName] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeData, setIntakeData] = useState<IntakeData | null>(null);
  const [intakeError, setIntakeError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadCustomers = async () => {
      setCustomersLoading(true);

      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error("customers load error:", error);
        setCustomers([]);
      } else {
        setCustomers((data as Customer[]) ?? []);
      }

      setCustomersLoading(false);
    };

    loadCustomers();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadIntake = async () => {
      if (!customerId) {
        setIntakeData(null);
        setIntakeError("");
        return;
      }

      setIntakeLoading(true);
      setIntakeError("");

      try {
        const latest = await fetchLatestIntake(customerId);
        if (!mounted) return;
        setIntakeData(latest);
      } catch (error) {
        console.error("intake load error:", error);
        if (!mounted) return;
        setIntakeData(null);
        setIntakeError("初回データの取得に失敗しました");
      } finally {
        if (mounted) setIntakeLoading(false);
      }
    };

    loadIntake();

    return () => {
      mounted = false;
    };
  }, [customerId]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) ?? null,
    [customers, customerId]
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!customerId) {
      setSaveError("顧客を選択してください");
      return;
    }

    setSaving(true);
    setSaveError("");

    const payload = {
      customer_id: customerId,
      visit_date: visitDate,
      menu_name: menuName || null,
      amount: amount ? Number(amount) : null,
      memo: memo || null,
    };

    const { error } = await supabase.from("visits").insert(payload);

    if (error) {
      console.error("visit save error:", error);
      setSaveError("来店登録に失敗しました。カラム名が異なる場合は visits テーブルを確認してください。");
      setSaving(false);
      return;
    }

    router.push("/visits");
    router.refresh();
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">来店登録</h1>
        <p className="mt-1 text-sm text-gray-600">
          顧客を選ぶと、最新の初回カウンセリング情報が自動表示されます。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">基本情報</h2>

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium">顧客</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 outline-none"
                disabled={customersLoading}
              >
                <option value="">
                  {customersLoading ? "顧客を読み込み中..." : "顧客を選択してください"}
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name || "名称未設定"}
                    {customer.phone ? ` / ${customer.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">来店日</label>
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 outline-none"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">初回カウンセリング情報</h2>

          {!customerId && (
            <p className="text-sm text-gray-500">顧客を選択すると初回データを表示します。</p>
          )}

          {customerId && intakeLoading && (
            <p className="text-sm text-gray-500">初回データを読み込み中...</p>
          )}

          {customerId && !intakeLoading && intakeError && (
            <p className="text-sm text-red-600">{intakeError}</p>
          )}

          {customerId && !intakeLoading && !intakeError && !intakeData && (
            <p className="text-sm text-gray-500">この顧客の初回入力データはまだありません。</p>
          )}

          {customerId && !intakeLoading && intakeData && (
            <div className="space-y-4">
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="mb-1 text-xs font-semibold text-gray-500">顧客名</div>
                <div className="text-sm">{selectedCustomer?.name || "名称未設定"}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <div className="mb-1 text-xs font-semibold text-gray-500">アレルギー</div>
                  <div className="whitespace-pre-wrap text-sm text-gray-900">
                    {intakeData.allergy || "記載なし"}
                  </div>
                </div>

                <div className="rounded-xl border p-3">
                  <div className="mb-1 text-xs font-semibold text-gray-500">同意</div>
                  <div className="whitespace-pre-wrap text-sm text-gray-900">
                    {intakeData.consent || "記載なし"}
                  </div>
                </div>

                <div className="rounded-xl border p-3 md:col-span-2">
                  <div className="mb-1 text-xs font-semibold text-gray-500">NG事項</div>
                  <div className="whitespace-pre-wrap text-sm text-gray-900">
                    {intakeData.ng_items || "記載なし"}
                  </div>
                </div>

                <div className="rounded-xl border p-3 md:col-span-2">
                  <div className="mb-2 text-xs font-semibold text-gray-500">署名</div>

                  {intakeData.signature ? (
                    isLikelyImage(intakeData.signature) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={intakeData.signature}
                        alt="署名"
                        className="max-h-48 rounded-lg border bg-white"
                      />
                    ) : (
                      <div className="text-sm text-gray-900">署名あり</div>
                    )
                  ) : (
                    <div className="text-sm text-gray-500">署名なし</div>
                  )}
                </div>
              </div>

              {intakeData.created_at && (
                <p className="text-xs text-gray-400">取得データ日時: {intakeData.created_at}</p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">来店内容</h2>

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium">メニュー名</label>
              <input
                type="text"
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
                placeholder="例）ワンカラー / 定額デザイン"
                className="w-full rounded-xl border px-3 py-2 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">金額</label>
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例）6500"
                className="w-full rounded-xl border px-3 py-2 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">メモ</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={5}
                placeholder="施術内容、注意点、次回提案など"
                className="w-full rounded-xl border px-3 py-2 outline-none"
              />
            </div>
          </div>
        </section>

        {saveError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "登録中..." : "来店登録する"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/visits")}
            className="rounded-xl border px-5 py-3 text-sm font-semibold"
          >
            戻る
          </button>
        </div>
      </form>
    </main>
  );
}