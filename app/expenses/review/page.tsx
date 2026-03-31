"use client";

import { useEffect, useMemo, useState } from "react";

type ReviewStatus = "unreviewed" | "confirmed";
type ReceiptStatus = "with_receipt" | "without_receipt" | "unchecked";

type ReviewRow = {
  id: string;
  import_id: string | null;
  expense_date: string | null;
  amount: number | null;
  vendor_raw: string | null;
  description_raw: string | null;
  payment_method: string | null;
  receipt_status: ReceiptStatus | null;
  review_status: ReviewStatus | null;
  duplicate_flag: boolean | null;
  matched_expense_id: string | null;
  excluded_flag: boolean | null;
};

const CATEGORY_OPTIONS = [
  "材料費",
  "消耗品費",
  "旅費交通費",
  "通信費",
  "広告宣伝費",
  "医療費",
  "外注費",
  "福利厚生費",
  "雑費",
] as const;

type ExpenseCategory = (typeof CATEGORY_OPTIONS)[number];

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toUpperCase().replace(/\s+/g, "");
}

function guessCategory(row: ReviewRow): ExpenseCategory {
  const text = normalizeText(
    `${row.vendor_raw ?? ""} ${row.description_raw ?? ""}`
  );

  const includesAny = (keywords: string[]) =>
    keywords.some((keyword) => text.includes(keyword));

  if (
    includesAny([
      "ネイルタウン",
      "ネイル工房",
      "ネイルワールド",
      "グルービーネイル",
      "SHEIN",
      "TEMU",
      "ALIBABA",
    ])
  ) {
    return "材料費";
  }

  if (includesAny(["ツルハ", "セブン", "ローソン", "業務スーパー"])) {
    return "消耗品費";
  }

  if (
    includesAny([
      "ETC",
      "地下鉄",
      "GO",
      "Dパーキング",
      "Ｄパーキング",
      "AIRBNB",
      "KIWI",
      "TRIP",
      "航空",
    ])
  ) {
    return "旅費交通費";
  }

  if (includesAny(["ソフトバンク", "APPLECOMBILL", "APPLE COM BILL"])) {
    return "通信費";
  }

  if (includesAny(["病院", "予防医学", "センター"])) {
    return "医療費";
  }

  return "雑費";
}

function formatAmount(value: number | null) {
  return new Intl.NumberFormat("ja-JP").format(value ?? 0);
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export default function ExpensesReviewPage() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showExcluded, setShowExcluded] = useState(true);
  const [categoryMap, setCategoryMap] = useState<Record<string, ExpenseCategory>>(
    {}
  );

  async function fetchRows() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/expenses/review", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "reviewデータの取得に失敗しました。");
      }

      const nextRows: ReviewRow[] = Array.isArray(data?.rows)
        ? data.rows.filter(
            (row: unknown): row is ReviewRow =>
              !!row &&
              typeof row === "object" &&
              "id" in row &&
              typeof (row as { id: unknown }).id === "string"
          )
        : [];

      setRows(nextRows);

      setCategoryMap((prev) => {
        const next = { ...prev };

        for (const row of nextRows) {
          if (!next[row.id]) {
            next[row.id] = guessCategory(row);
          }
        }

        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "reviewデータの取得に失敗しました。"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchRows();
  }, []);

  const unreviewedRows = useMemo(
    () => rows.filter((row) => row.review_status === "unreviewed"),
    [rows]
  );

  const activeRows = useMemo(
    () => unreviewedRows.filter((row) => row.excluded_flag !== true),
    [unreviewedRows]
  );

  const excludedRows = useMemo(
    () => unreviewedRows.filter((row) => row.excluded_flag === true),
    [unreviewedRows]
  );

  const filteredRows = useMemo(() => {
    if (showExcluded) return unreviewedRows;
    return activeRows;
  }, [showExcluded, unreviewedRows, activeRows]);

  async function updateStatus(
    rowId: string,
    updates: {
      receipt_status?: ReceiptStatus;
      duplicate_flag?: boolean;
      excluded_flag?: boolean;
      review_status?: ReviewStatus;
    }
  ) {
    if (!isValidUuid(rowId)) {
      alert("rowId形式が不正です。");
      return;
    }

    try {
      setSavingId(rowId);

      const res = await fetch("/api/expenses/review/update-status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rowId,
          ...updates,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "ステータス更新に失敗しました。");
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id === rowId
            ? {
                ...row,
                ...updates,
              }
            : row
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "ステータス更新に失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  async function confirmRow(rowId: string) {
    if (!isValidUuid(rowId)) {
      alert("rowId形式が不正です。");
      return;
    }

    try {
      setSavingId(rowId);

      const selectedCategory = categoryMap[rowId] ?? "雑費";

      const res = await fetch("/api/expenses/review/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rowId,
          category: selectedCategory,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "正式経費への確定に失敗しました。");
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id === rowId
            ? {
                ...row,
                review_status: "confirmed",
                matched_expense_id:
                  data?.expense?.id ?? row.matched_expense_id ?? null,
              }
            : row
        )
      );
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "正式経費への確定に失敗しました。"
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">経費 review</h1>
        <p className="mt-2 text-sm text-gray-600">
          CSVで取り込んだ候補を確認し、カテゴリを調整してから正式経費に確定します。
        </p>
      </div>

      <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-sm text-gray-500">未確定件数（有効）</div>
            <div className="mt-1 text-2xl font-bold">{activeRows.length}件</div>
          </div>

          <div>
            <div className="text-sm text-gray-500">除外中</div>
            <div className="mt-1 text-2xl font-bold">{excludedRows.length}件</div>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showExcluded}
                onChange={(e) => setShowExcluded(e.target.checked)}
              />
              除外中も表示する
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white p-6 text-sm shadow-sm">
          読み込み中...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
          review対象の未確定データはありません。
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRows.map((row) => {
            const isSaving = savingId === row.id;
            const currentCategory = categoryMap[row.id] ?? guessCategory(row);
            const isExcluded = row.excluded_flag === true;

            return (
              <div
                key={row.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  isExcluded ? "border-red-200 bg-red-50/40" : ""
                }`}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {isExcluded ? (
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                      除外中
                    </span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                      review対象
                    </span>
                  )}

                  {row.duplicate_flag ? (
                    <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                      重複候補
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-gray-500">利用日</div>
                    <div className="font-medium">{row.expense_date || "-"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">金額</div>
                    <div className="font-medium">¥{formatAmount(row.amount)}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-500">利用店名・支払先</div>
                    <div className="font-medium break-words">
                      {row.vendor_raw || "-"}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-500">明細</div>
                    <div className="break-words">{row.description_raw || "-"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">決済方法</div>
                    <div>{row.payment_method || "-"}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500">カテゴリ</div>
                    <select
                      value={currentCategory}
                      onChange={(e) =>
                        setCategoryMap((prev) => ({
                          ...prev,
                          [row.id]: e.target.value as ExpenseCategory,
                        }))
                      }
                      disabled={isSaving || isExcluded}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm disabled:bg-gray-100"
                    >
                      {CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isSaving || isExcluded}
                    onClick={() =>
                      updateStatus(row.id, { receipt_status: "with_receipt" })
                    }
                    className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    領収書あり
                  </button>

                  <button
                    type="button"
                    disabled={isSaving || isExcluded}
                    onClick={() =>
                      updateStatus(row.id, { receipt_status: "without_receipt" })
                    }
                    className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    領収書なし
                  </button>

                  <button
                    type="button"
                    disabled={isSaving || isExcluded}
                    onClick={() =>
                      updateStatus(row.id, { receipt_status: "unchecked" })
                    }
                    className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    未確認に戻す
                  </button>

                  <button
                    type="button"
                    disabled={isSaving || isExcluded}
                    onClick={() =>
                      updateStatus(row.id, {
                        duplicate_flag: !(row.duplicate_flag ?? false),
                      })
                    }
                    className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    {row.duplicate_flag ? "重複解除" : "重複にする"}
                  </button>

                  {isExcluded ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        updateStatus(row.id, { excluded_flag: false })
                      }
                      className="rounded-xl border px-3 py-2 text-sm text-blue-600 disabled:opacity-50"
                    >
                      除外を戻す
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => updateStatus(row.id, { excluded_flag: true })}
                      className="rounded-xl border px-3 py-2 text-sm text-red-600 disabled:opacity-50"
                    >
                      除外
                    </button>
                  )}
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    disabled={isSaving || isExcluded}
                    onClick={() => confirmRow(row.id)}
                    className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {isSaving
                      ? "処理中..."
                      : isExcluded
                      ? "除外中のため確定できません"
                      : "このカテゴリで正式経費に確定"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}