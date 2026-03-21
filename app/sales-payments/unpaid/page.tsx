'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type SaleRow = {
  id: number
  customer_id: number
  amount: number | null
  memo: string | null
}

type CustomerRow = {
  id: number
  name: string
}

type Sale = {
  id: number
  customer_id: number
  amount: number
  memo: string | null
  customer_name: string
}

type MemoData = {
  status?: string
  paid_amount?: number
  unpaid_amount?: number
  due_date?: string
}

export default function UnpaidPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSales()
  }, [])

  const fetchSales = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('sales')
      .select('id, customer_id, amount, memo')
      .order('id', { ascending: false })

    if (error) {
      console.error('未収一覧取得エラー:', error.message || error)
      setSales([])
      setLoading(false)
      return
    }

    const saleRows = ((data || []) as SaleRow[]).filter((sale) => {
      if (!sale.memo) return false

      try {
        const memoData: MemoData = JSON.parse(sale.memo)
        return memoData.status === '未収' || memoData.status === '一部'
      } catch {
        return sale.memo.includes('未収')
      }
    })

    if (saleRows.length === 0) {
      setSales([])
      setLoading(false)
      return
    }

    const customerIds = Array.from(
      new Set(saleRows.map((sale) => sale.customer_id).filter(Boolean))
    )

    const { data: customersData, error: customersError } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', customerIds)

    if (customersError) {
      console.error('顧客取得エラー:', customersError.message || customersError)
    }

    const customersMap = new Map<number, string>()
    ;((customersData || []) as CustomerRow[]).forEach((customer) => {
      customersMap.set(customer.id, customer.name)
    })

    const normalized: Sale[] = saleRows.map((sale) => ({
      id: sale.id,
      customer_id: sale.customer_id,
      amount: Number(sale.amount || 0),
      memo: sale.memo,
      customer_name: customersMap.get(sale.customer_id) || '不明な顧客',
    }))

    setSales(normalized)
    setLoading(false)
  }

  const parseMemo = (memo: string | null): MemoData => {
    if (!memo) return {}

    try {
      return JSON.parse(memo)
    } catch {
      return {}
    }
  }

  const totalUnpaid = sales.reduce((sum, sale) => {
    const memoData = parseMemo(sale.memo)
    return sum + Number(memoData.unpaid_amount || 0)
  }, 0)

  return (
    <main className="p-4 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">未収一覧</h1>
        <p className="text-sm text-gray-500 mt-1">
          未収・一部入金の売上一覧です
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">読み込み中...</div>
      ) : sales.length === 0 ? (
        <div className="rounded-lg border bg-white p-4">
          未収データはありません
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-lg border bg-red-50 p-4">
            <div className="text-sm text-gray-600">未収合計</div>
            <div className="text-2xl font-bold text-red-600">
              ¥{totalUnpaid.toLocaleString()}
            </div>
          </div>

          <div className="space-y-3">
            {sales.map((sale) => {
              const memoData = parseMemo(sale.memo)
              const unpaidAmount = Number(memoData.unpaid_amount || 0)
              const dueDate = memoData.due_date || '-'
              const status = memoData.status || '-'

              return (
                <div
                  key={sale.id}
                  className="rounded-lg border bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-lg">
                        {sale.customer_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        売上ID: {sale.id}
                      </div>
                    </div>

                    <div className="text-sm px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                      {status}
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-sm">
                    <div>売上金額：¥{sale.amount.toLocaleString()}</div>
                    <div>未収額：¥{unpaidAmount.toLocaleString()}</div>
                    <div>入金予定日：{dueDate}</div>
                  </div>

                  <div className="mt-4">
                    <Link
                      href={`/customers/${sale.customer_id}`}
                      className="text-blue-600 text-sm underline"
                    >
                      顧客詳細を見る
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}