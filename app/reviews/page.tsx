"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Customer = {
  id: string
  name: string | null
  phone: string | null
  line: string | null
  memo: string | null
  created_at: string | null
}

export default function ReviewsPage() {
  const router = useRouter()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    void loadCustomers()
  }, [])

  async function loadCustomers() {
    setLoading(true)
    setErrorMessage("")

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, line, memo, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      setErrorMessage("顧客情報の取得に失敗しました。")
      setCustomers([])
      setLoading(false)
      return
    }

    setCustomers(data ?? [])
    setLoading(false)
  }

  function formatDate(date: string | null) {
    if (!date) return "未登録"
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return "未登録"
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  }

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return customers

    return customers.filter((customer) => {
      const name = (customer.name ?? "").toLowerCase()
      const phone = (customer.phone ?? "").toLowerCase()
      const line = (customer.line ?? "").toLowerCase()
      const memo = (customer.memo ?? "").toLowerCase()

      return (
        name.includes(keyword) ||
        phone.includes(keyword) ||
        line.includes(keyword) ||
        memo.includes(keyword)
      )
    })
  }, [customers, search])

  if (loading) {
    return <div className="p-6">読み込み中...</div>
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">口コミ導線管理</h1>
          <p className="mt-1 text-sm text-gray-600">
            顧客ごとの口コミ依頼ページへすぐ移動できます
          </p>
        </div>

        <button
          onClick={() => router.push("/dashboard")}
          className="rounded-xl border px-4 py-2 text-sm font-medium"
        >
          ダッシュボードへ
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-4 md:p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl bg-purple-50 p-4">
            <div className="text-xs text-gray-500">対象顧客数</div>
            <div className="mt-1 text-2xl font-bold">
              {filteredCustomers.length}名
            </div>
          </div>

          <div className="rounded-xl bg-blue-50 p-4">
            <div className="text-xs text-gray-500">使い方</div>
            <div className="mt-1 text-sm font-medium text-gray-700">
              顧客を選んで「口コミ依頼ページ」を開く
            </div>
          </div>

          <div className="rounded-xl bg-green-50 p-4">
            <div className="text-xs text-gray-500">運用目的</div>
            <div className="mt-1 text-sm font-medium text-gray-700">
              GBP口コミ獲得と再来店導線の強化
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          スタッフは施術後にこのページから対象顧客を選び、
          顧客マイページを案内してください。
        </div>

        <div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="名前・電話・LINE・メモで検索"
            className="w-full rounded-xl border px-4 py-3 outline-none"
          />
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 md:p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">顧客一覧</h2>
          <div className="text-sm text-gray-500">{filteredCustomers.length}件</div>
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
            該当する顧客がいません
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="rounded-2xl border p-4 space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <div className="text-gray-500">名前</div>
                    <div className="mt-1 font-medium">{customer.name ?? "-"}</div>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-3">
                    <div className="text-gray-500">電話</div>
                    <div className="mt-1 font-medium">{customer.phone ?? "-"}</div>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-3">
                    <div className="text-gray-500">LINE</div>
                    <div className="mt-1 font-medium">{customer.line ?? "-"}</div>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-3">
                    <div className="text-gray-500">登録日</div>
                    <div className="mt-1 font-medium">
                      {formatDate(customer.created_at)}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 p-3 text-sm">
                  <div className="text-gray-500">メモ</div>
                  <div className="mt-1 whitespace-pre-wrap">
                    {customer.memo ?? "-"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => router.push(`/customers/${customer.id}`)}
                    className="rounded-xl border px-4 py-2 text-sm font-medium"
                  >
                    顧客詳細
                  </button>

                  <button
                    onClick={() => router.push(`/customers/${customer.id}/mypage`)}
                    className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    口コミ依頼ページ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}