"use client"

import { FormEvent, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const CATEGORY_OPTIONS = [
  "材料費",
  "広告宣伝費",
  "消耗品費",
  "外注費",
  "通信費",
  "地代家賃",
  "水道光熱費",
  "旅費交通費",
  "雑費",
  "その他",
]

const TAX_TYPE_OPTIONS = ["課税", "非課税", "不課税", "内税", "外税"]

const PAYMENT_METHOD_OPTIONS = [
  "現金",
  "クレジットカード",
  "口座振替",
  "振込",
  "QR決済",
  "その他",
]

function todayString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function formatYen(value: string) {
  const numeric = Number(value.replace(/,/g, ""))
  if (Number.isNaN(numeric)) return "-"
  return `¥${numeric.toLocaleString()}`
}

export default function NewExpensePage() {
  const router = useRouter()

  const [expenseDate, setExpenseDate] = useState(todayString())
  const [vendorName, setVendorName] = useState("")
  const [category, setCategory] = useState("材料費")
  const [amount, setAmount] = useState("")
  const [taxType, setTaxType] = useState("課税")
  const [paymentMethod, setPaymentMethod] = useState("現金")
  const [memo, setMemo] = useState("")
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const amountPreview = useMemo(() => {
    if (!amount.trim()) return "-"
    return formatYen(amount)
  }, [amount])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (saving) return

    setErrorMessage("")

    if (!expenseDate) {
      setErrorMessage("経費日を入力してください。")
      return
    }

    if (!category.trim()) {
      setErrorMessage("カテゴリを選択してください。")
      return
    }

    if (!amount.trim()) {
      setErrorMessage("金額を入力してください。")
      return
    }

    const parsedAmount = Number(amount.replace(/,/g, ""))
    if (Number.isNaN(parsedAmount)) {
      setErrorMessage("金額は数字で入力してください。")
      return
    }

    if (parsedAmount < 0) {
      setErrorMessage("金額は0以上で入力してください。")
      return
    }

    setSaving(true)

    const { error } = await supabase.from("expenses").insert([
      {
        expense_date: expenseDate,
        vendor_name: vendorName.trim() || null,
        category: category.trim() || null,
        amount: parsedAmount,
        tax_type: taxType.trim() || null,
        payment_method: paymentMethod.trim() || null,
        memo: memo.trim() || null,
      },
    ])

    setSaving(false)

    if (error) {
      setErrorMessage("経費登録に失敗しました。")
      return
    }

    router.push("/expenses")
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">経費登録</h1>
          <p className="text-sm text-gray-500">
            月次締めと税務レポートに反映される経費を登録します
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/expenses"
            className="rounded-xl border px-4 py-2 text-sm"
          >
            経費一覧へ
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border px-4 py-2 text-sm"
          >
            ダッシュボードへ
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium">
                経費日
              </label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                取引先 / 支払先
              </label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="楽天 / Amazon / ネイル問屋 / 家賃 など"
                className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  カテゴリ
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
                >
                  {CATEGORY_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  金額
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="5000"
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  税区分
                </label>
                <select
                  value={taxType}
                  onChange={(e) => setTaxType(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
                >
                  {TAX_TYPE_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  支払方法
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
                >
                  {PAYMENT_METHOD_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                メモ
              </label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={5}
                placeholder="用途や補足を入力"
                className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
              />
            </div>

            {errorMessage && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
            >
              {saving ? "登録中..." : "経費を登録する"}
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">入力中の確認</h2>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div>
                <span className="font-medium">経費日:</span> {expenseDate || "-"}
              </div>
              <div>
                <span className="font-medium">取引先:</span>{" "}
                {vendorName.trim() || "-"}
              </div>
              <div>
                <span className="font-medium">カテゴリ:</span> {category || "-"}
              </div>
              <div>
                <span className="font-medium">金額:</span> {amountPreview}
              </div>
              <div>
                <span className="font-medium">税区分:</span> {taxType || "-"}
              </div>
              <div>
                <span className="font-medium">支払方法:</span>{" "}
                {paymentMethod || "-"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-5">
            <h2 className="text-lg font-semibold">現場メモ</h2>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <p>・材料購入や広告費は忘れずその場で登録</p>
              <p>・月末にまとめて入れるより、その都度入力が安全</p>
              <p>・月次締めと月次レポートにそのまま反映されます</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}