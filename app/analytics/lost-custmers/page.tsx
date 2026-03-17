"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

type Customer = {
  id: string
  name: string | null
  phone: string | null
  line: string | null
  created_at: string | null
}

type Visit = {
  id: string
  customer_id: string | null
  created_at: string | null
  price: number | null
}

type LostCustomerRow = {
  id: string
  name: string
  phone: string
  line: string
  customer_created_at: string | null
  last_visit_at: string | null
  days_since_last_visit: number | null
  visit_count: number
  total_spend: number
  status: "新規のみ" | "要フォロー" | "失客リスク高" | "安定"
}

function formatDate(date: string | null) {
  if (!date) return "-"
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return "-"
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function formatYen(value: number) {
  return `¥${value.toLocaleString()}`
}

function diffDaysFromToday(date: string | null) {
  if (!date) return null
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null

  const now = new Date()
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  )
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = startOfToday.getTime() - target.getTime()

  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function statusBadgeClass(status: LostCustomerRow["status"]) {
  if (status === "失客リスク高") {
    return "bg-red-100 text-red-700"
  }
  if (status === "要フォロー") {
    return "bg-yellow-100 text-yellow-700"
  }
  if (status === "新規のみ") {
    return "bg-blue-100 text-blue-700"
  }
  return "bg-green-100 text-green-700"
}

export default function LostCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    async function fetchData() {
      setLoading(true)

      const [customersResult, visitsResult] = await Promise.all([
        supabase
          .from("customers")
          .select("id,name,phone,line,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("visits")
          .select("id,customer_id,created_at,price")
          .order("created_at", { ascending: false }),
      ])

      setCustomers((customersResult.data as Customer[]) ?? [])
      setVisits((visitsResult.data as Visit[]) ?? [])
      setLoading(false)
    }

    fetchData()
  }, [])

  const rows = useMemo<LostCustomerRow[]>(() => {
    const visitMap = new Map<string, Visit[]>()

    visits.forEach((visit) => {
      if (!visit.customer_id) return
      if (!visitMap.has(visit.customer_id)) {
        visitMap.set(visit.customer_id, [])
      }
      visitMap.get(visit.customer_id)?.push(visit)
    })

    return customers.map((customer) => {
      const customerVisits = visitMap.get(customer.id) ?? []

      const sortedVisits = [...customerVisits].sort((a, b) => {
        return (
          new Date(b.created_at ?? "").getTime() -
          new Date(a.created_at ?? "").getTime()
        )
      })

      const lastVisitAt = sortedVisits[0]?.created_at ?? null
      const daysSinceLastVisit = diffDaysFromToday(lastVisitAt)
      const visitCount = customerVisits.length
      const totalSpend = customerVisits.reduce(
        (sum, visit) => sum + (visit.price ?? 0),
        0
      )

      let status: LostCustomerRow["status"] = "安定"

      if (visitCount === 0) {
        status = "新規のみ"
      } else if (daysSinceLastVisit !== null && daysSinceLastVisit >= 90) {
        status = "失客リスク高"
      } else if (daysSinceLastVisit !== null && daysSinceLastVisit >= 60) {
        status = "要フォロー"
      }

      return {
        id: customer.id,
        name: customer.name ?? "名前未登録",
        phone: customer.phone ?? "-",
        line: customer.line ?? "-",
        customer_created_at: customer.created_at,
        last_visit_at: lastVisitAt,
        days_since_last_visit: daysSinceLastVisit,
        visit_count: visitCount,
        total_spend: totalSpend,
        status,
      }
    })
  }, [customers, visits])

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rows

    return rows.filter((row) => {
      return (
        row.name.toLowerCase().includes(keyword) ||
        row.phone.toLowerCase().includes(keyword) ||
        row.line.toLowerCase().includes(keyword) ||
        row.status.toLowerCase().includes(keyword)
      )
    })
  }, [rows, search])

  const summary = useMemo(() => {
    const lostHigh = filteredRows.filter(
      (row) => row.status === "失客リスク高"
    ).length
    const follow = filteredRows.filter(
      (row) => row.status === "要フォロー"
    ).length
    const newOnly = filteredRows.filter(
      (row) => row.status === "新規のみ"
    ).length

    return {
      total: filteredRows.length,
      lostHigh,
      follow,
      newOnly,
    }
  }, [filteredRows])

  const prioritizedRows = useMemo(() => {
    const priority = {
      "失客リスク高": 0,
      "要フォロー": 1,
      "新規のみ": 2,
      "安定": 3,
    } as const

    return [...filteredRows].sort((a, b) => {
      const p = priority[a.status] - priority[b.status]
      if (p !== 0) return p

      const aDays = a.days_since_last_visit ?? -1
      const bDays = b.days_since_last_visit ?? -1
      return bDays - aDays
    })
  }, [filteredRows])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">失客アラート</h1>
          <p className="text-sm text-gray-500">
            60日以上来店がない顧客を優先的に確認する画面です
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/analytics"
            className="rounded-xl border px-4 py-2 text-sm"
          >
            サロン分析へ
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border px-4 py-2 text-sm"
          >
            ダッシュボードへ
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">対象顧客数</div>
          <div className="mt-2 text-3xl font-bold">
            {loading ? "..." : summary.total.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">失客リスク高</div>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {loading ? "..." : summary.lostHigh.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">要フォロー</div>
          <div className="mt-2 text-3xl font-bold text-yellow-600">
            {loading ? "..." : summary.follow.toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">来店履歴なし</div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {loading ? "..." : summary.newOnly.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <label className="mb-2 block text-sm font-medium">
              顧客を検索
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="顧客名 / 電話番号 / LINE / ステータス"
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-black"
            />
          </div>

          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            60日以上来店なし: 要フォロー / 90日以上: 失客リスク高
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {prioritizedRows.length === 0 ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
            対象の顧客がいません。
          </div>
        ) : (
          prioritizedRows.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold">{row.name}</div>
                    <div
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(
                        row.status
                      )}`}
                    >
                      {row.status}
                    </div>
                  </div>

                  <div className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                    <div>
                      <span className="font-medium">電話:</span> {row.phone}
                    </div>
                    <div>
                      <span className="font-medium">LINE:</span> {row.line}
                    </div>
                    <div>
                      <span className="font-medium">最終来店:</span>{" "}
                      {formatDate(row.last_visit_at)}
                    </div>
                    <div>
                      <span className="font-medium">経過日数:</span>{" "}
                      {row.days_since_last_visit === null
                        ? "-"
                        : `${row.days_since_last_visit}日`}
                    </div>
                    <div>
                      <span className="font-medium">来店回数:</span>{" "}
                      {row.visit_count}回
                    </div>
                    <div>
                      <span className="font-medium">累計売上:</span>{" "}
                      {formatYen(row.total_spend)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 lg:w-[360px]">
                  <Link
                    href={`/customers/${row.id}`}
                    className="rounded-xl border px-4 py-3 text-center text-sm"
                  >
                    顧客詳細
                  </Link>

                  <Link
                    href={`/customers/${row.id}/mypage`}
                    className="rounded-xl border px-4 py-3 text-center text-sm"
                  >
                    マイページ
                  </Link>

                  <Link
                    href={`/reservations/new?customer_id=${row.id}`}
                    className="rounded-xl bg-black px-4 py-3 text-center text-sm text-white"
                  >
                    予約登録
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}