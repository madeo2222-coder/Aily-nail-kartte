'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type UnpaidRow = {
  visit_id: string
  customer_name: string | null
  visit_date: string | null
  menu: string | null
  price: number
  days_passed: number
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function formatYen(value?: number | string | null) {
  const n = Number(value ?? 0)
  if (Number.isNaN(n)) return '¥0'
  return `¥${n.toLocaleString('ja-JP')}`
}

function calcDaysPassed(dateStr?: string | null) {
  if (!dateStr) return 0
  const visit = new Date(dateStr)
  const today = new Date()
  const diff = today.getTime() - visit.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export default function UnpaidPage() {
  const [rows, setRows] = useState<UnpaidRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchUnpaid = async () => {
      setLoading(true)
      setError('')

      // ① visits取得
      const visitsRes = await supabase
        .from('visits')
        .select(
          `
          id,
          visit_date,
          menu,
          price,
          customer_id,
          customers (
            name
          )
        `
        )
        .order('visit_date', { ascending: false })

      if (visitsRes.error) {
        setError('来店データ取得エラー: ' + visitsRes.error.message)
        setLoading(false)
        return
      }

      const visits = visitsRes.data || []

      // ② payments取得（sales_payments優先）
      let payments: any[] = []

      const salesPaymentsRes = await supabase
        .from('sales_payments')
        .select('visit_id')

      if (!salesPaymentsRes.error) {
        payments = salesPaymentsRes.data || []
      } else {
        const paymentsRes = await supabase.from('payments').select('visit_id')
        if (!paymentsRes.error) {
          payments = paymentsRes.data || []
        }
      }

      const paidVisitIds = new Set(
        payments.map((p) => String(p.visit_id))
      )

      // ③ 未入金抽出
      const unpaid: UnpaidRow[] = visits
        .filter((v: any) => !paidVisitIds.has(String(v.id)))
        .map((v: any) => {
          const visit = Array.isArray(v) ? v[0] : v
          const customer = Array.isArray(visit.customers)
            ? visit.customers[0]
            : visit.customers

          return {
            visit_id: String(visit.id),
            customer_name: customer?.name || null,
            visit_date: visit.visit_date,
            menu: visit.menu || null,
            price: Number(visit.price ?? 0),
            days_passed: calcDaysPassed(visit.visit_date),
          }
        })

      setRows(unpaid)
      setLoading(false)
    }

    fetchUnpaid()
  }, [])

  const totalUnpaid = useMemo(() => {
    return rows.reduce((sum, r) => sum + r.price, 0)
  }, [rows])

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">未入金一覧</h1>
            <p className="text-sm text-neutral-600">
              売上登録されていない来店を表示します
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/sales-payments" className="btn">
              売上一覧
            </Link>
            <Link href="/dashboard" className="btn">
              ダッシュボード
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded bg-red-100 p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded border">
            <div className="text-sm text-gray-500">未入金件数</div>
            <div className="text-xl font-bold">{rows.length}件</div>
          </div>

          <div className="bg-white p-4 rounded border">
            <div className="text-sm text-gray-500">未入金合計</div>
            <div className="text-xl font-bold">{formatYen(totalUnpaid)}</div>
          </div>
        </div>

        <div className="bg-white rounded border overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-sm">読み込み中...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm">
              未入金はありません
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left">来店日</th>
                  <th className="p-3 text-left">顧客</th>
                  <th className="p-3 text-left">メニュー</th>
                  <th className="p-3 text-left">経過日数</th>
                  <th className="p-3 text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.visit_id} className="border-t">
                    <td className="p-3">{formatDate(r.visit_date)}</td>
                    <td className="p-3">{r.customer_name || '-'}</td>
                    <td className="p-3">{r.menu || '-'}</td>
                    <td className="p-3">{r.days_passed}日</td>
                    <td className="p-3 text-right font-semibold">
                      {formatYen(r.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}