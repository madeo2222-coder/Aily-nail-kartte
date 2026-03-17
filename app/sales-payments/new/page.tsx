"use client"

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Visit = {
  id: string
  customer_id: string | null
  menu: string | null
  price: number | null
  created_at: string | null
}

type Customer = {
  id: string
  name: string | null
}

type VisitOption = {
  id: string
  customer_id: string | null
  customer_name: string
  menu: string
  price: number | null
  created_at: string | null
}

function formatDate(date: string | null) {
  if (!date) return "-"
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return "-"
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function formatYen(value: number | null) {
  return `¥${(value ?? 0).toLocaleString()}`
}

function todayString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function NewSalesPaymentPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const queryVisitId = searchParams.get("visit_id") ?? ""

  const [visits, setVisits] = useState<VisitOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [visitId, setVisitId] = useState(queryVisitId)
  const [paymentMethod, setPaymentMethod] = useState("現金")
  const [amount, setAmount] = useState("")
  const [paymentDate, setPaymentDate] = useState(todayString())
  const [search, setSearch] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    setVisitId(queryVisitId)
  }, [queryVisitId])

  useEffect(() => {
    async function fetchVisits() {
      setLoading(true)
      setErrorMessage("")

      const { data: visitsData, error: visitsError } = await supabase
        .from("visits")
        .select("id,customer_id,menu,price,created_at")
        .order("created_at", { ascending: false })

      if (visitsError) {
        setVisits([])
        setLoading(false)
        setErrorMessage("来店履歴の取得に失敗しました。")
        return
      }

      const visitList = (visitsData as Visit[]) ?? []

      const customerIds = Array.from(
        new Set(
          visitList
            .map((item) => item.customer_id)
            .filter((id): id is string => Boolean(id))
        )
      )

      const customerMap: Record<string, Customer> = {}

      if (customerIds.length > 0) {
        const { data: customersData } = await supabase
          .from("customers")
          .select("id,name")
          .in("id", customerIds)

        ;((customersData as Customer[]) ?? []).forEach((customer) => {
          customerMap[customer.id] = customer
        })
      }

      const nextVisits: VisitOption[] = visitList.map((visit) => ({
        id: visit.id,
        customer_id: visit.customer_id,
        customer_name: visit.customer_id
          ? customerMap[visit.customer_id]?.name ?? "顧客未登録"
          : "顧客未登録",
        menu: visit.menu ?? "-",
        price: visit.price ?? null,
        created_at: visit.created_at,
      }))

      setVisits(nextVisits)

      if (queryVisitId) {
        const target = nextVisits.find((item) => item.id === queryVisitId)
        if (target && target.price !== null && target.price !== undefined) {
          setAmount(String(target.price))
        }
      }

      setLoading(false)
    }

    fetchVisits()
  }, [queryVisitId])

  const filteredVisits = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return visits

    return visits.filter((visit) => {
      return (
        visit.customer_name.toLowerCase().includes(keyword) ||
        visit.menu.toLowerCase().includes(keyword) ||
        (visit.created_at ?? "").toLowerCase().includes(keyword)
      )
    })
  }, [visits, search])

  const selectedVisit = useMemo(() => {
    return visits.find((item) => item.id === visitId) ?? null
  }, [visits, visitId])

  useEffect(() => {
    if (!selectedVisit) return
    if (amount.trim()) return

    if (selectedVisit.price !== null && selectedVisit.price !== undefined) {
      setAmount(String(selectedVisit.price))
    }
  }, [selectedVisit, amount])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (saving) return

    setErrorMessage("")

    if (!visitId) {
      setErrorMessage("来店履歴を選択してください。")
      return
    }

    if (!paymentMethod.trim()) {
      setErrorMessage("支払方法を入力してください。")
      return
    }

    if (!amount.trim()) {
      setErrorMessage("入金額を入力してください。")
      return
    }

    const parsedAmount = Number(amount.replace(/,/g, ""))
    if (Number.isNaN(parsedAmount)) {
      setErrorMessage("入金額は数字で入力してください。")
      return
    }

    if (parsedAmount < 0) {
      setErrorMessage("入金額は0以上で入力してください。")
      return
    }

    if (!paymentDate) {
      setErrorMessage("入金日を入力してください。")
      return
    }

    setSaving(true)

    const { error } = await supabase.from("sales_payments").insert([
      {
        visit_id: visitId,
        payment_method: paymentMethod.trim() || null,
        amount: parsedAmount,
        payment_date: paymentDate,
      },
    ])

    setSaving(false)

    if (error) {
      setErrorMessage("入金登録に失敗しました。")
      return
    }

    router.push("/sales-payments")
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">入金登録</h1>
          <p className="text-sm text-gray-500">
            来店履歴に紐づけて入金を登録します
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/sales-payments"
            className="rounded-xl border px-4 py-2 text-sm"
          >
            入金一覧へ
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border px-4 py-2 text-sm"
          >
            ダッシュボードへ
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 shadow-sm space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium">
              来店履歴を検索
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="顧客名 / メニュー / 日付"
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              来店履歴を選択
            </label>

            {loading ? (
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                読み込み中...
              </div>
            ) : filteredVisits.length === 0 ? (
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                該当する来店履歴がありません。
              </div>
            ) : (
              <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border p-3">
                {filteredVisits.map((visit) => {
                  const selected = visit.id === visitId

                  return (
                    <button
                      key={visit.id}
                      type="button"
                      onClick={() => {
                        setVisitId(visit.id)
                        if (visit.price !== null && visit.price !== undefined) {
                          setAmount(String(visit.price))
                        }
                      }}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selected
                          ? "border-black bg-black text-white"
                          : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <div className="space-y-1 text-sm">
                        <div className="text-base font-semibold">
                          {visit.customer_name}
                        </div>
                        <div>メニュー: {visit.menu}</div>
                        <div>来店日: {formatDate(visit.created_at)}</div>
                        <div>売上: {formatYen(visit.price)}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="rounded-2xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">選択中の来店履歴</div>
              {selectedVisit ? (
                <div className="mt-2 space-y-1 text-sm">
                  <div className="font-semibold text-base">
                    {selectedVisit.customer_name}
                  </div>
                  <div>メニュー: {selectedVisit.menu}</div>
                  <div>来店日: {formatDate(selectedVisit.created_at)}</div>
                  <div>売上: {formatYen(selectedVisit.price)}</div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-500">
                  まだ選択されていません
                </div>
              )}
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
                <option value="現金">現金</option>
                <option value="クレジットカード">クレジットカード</option>
                <option value="QR決済">QR決済</option>
                <option value="振込">振込</option>
                <option value="その他">その他</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                入金額
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="6500"
                className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                入金日
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
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
              {saving ? "登録中..." : "入金を登録する"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function NewSalesPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-6">
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
            読み込み中...
          </div>
        </div>
      }
    >
      <NewSalesPaymentPageContent />
    </Suspense>
  )
}