'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type DashboardStats = {
  customerCount: number
  visitCount: number
  reservationCount: number
  totalSales: number
  monthlySales: number
  unpaidCount: number
}

type PaymentRow = {
  amount: number
  payment_date: string | null
}

function formatYen(value?: number | string | null) {
  const n = Number(value ?? 0)
  if (Number.isNaN(n)) return '¥0'
  return `¥${n.toLocaleString('ja-JP')}`
}

function getMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const startText = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
  const endText = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-01`

  return { startText, endText }
}

function normalizePaymentRows(rows: any[]): PaymentRow[] {
  return (rows || []).map((row) => ({
    amount: Number(row.amount ?? 0),
    payment_date: row.payment_date ?? null,
  }))
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [paymentSource, setPaymentSource] = useState<'sales_payments' | 'payments' | ''>('')
  const [stats, setStats] = useState<DashboardStats>({
    customerCount: 0,
    visitCount: 0,
    reservationCount: 0,
    totalSales: 0,
    monthlySales: 0,
    unpaidCount: 0,
  })

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true)
      setPageError('')

      const { startText, endText } = getMonthRange()

      const [
        customersResult,
        visitsResult,
        reservationsResult,
        salesPaymentsResult,
        paymentsResult,
      ] = await Promise.all([
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('visits').select('*', { count: 'exact', head: true }),
        supabase.from('reservations').select('*', { count: 'exact', head: true }),
        supabase
          .from('sales_payments')
          .select('amount, payment_date')
          .order('payment_date', { ascending: false }),
        supabase
          .from('payments')
          .select('amount, payment_date')
          .order('payment_date', { ascending: false }),
      ])

      const customerCount = customersResult.count ?? 0
      const visitCount = visitsResult.count ?? 0
      const reservationCount = reservationsResult.count ?? 0

      let paymentRows: PaymentRow[] = []
      let currentPaymentSource: 'sales_payments' | 'payments' | '' = ''

      if (!salesPaymentsResult.error) {
        paymentRows = normalizePaymentRows(salesPaymentsResult.data || [])
        currentPaymentSource = 'sales_payments'
      } else if (!paymentsResult.error) {
        paymentRows = normalizePaymentRows(paymentsResult.data || [])
        currentPaymentSource = 'payments'
      } else {
        setPageError(
          `売上データ取得エラー：sales_payments → ${salesPaymentsResult.error.message} / payments → ${paymentsResult.error.message}`
        )
      }

      const totalSales = paymentRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)

      const monthlySales = paymentRows.reduce((sum, row) => {
        if (!row.payment_date) return sum
        if (row.payment_date >= startText && row.payment_date < endText) {
          return sum + Number(row.amount ?? 0)
        }
        return sum
      }, 0)

      const unpaidCount = Math.max(visitCount - paymentRows.length, 0)

      setPaymentSource(currentPaymentSource)
      setStats({
        customerCount,
        visitCount,
        reservationCount,
        totalSales,
        monthlySales,
        unpaidCount,
      })
      setLoading(false)
    }

    fetchDashboard()
  }, [])

  const monthLabel = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}年${now.getMonth() + 1}月`
  }, [])

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">ダッシュボード</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Naily AiDOL の主要指標を確認できます
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/sales-payments/new"
              className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              売上登録
            </Link>
            <Link
              href="/sales-payments"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              売上一覧
            </Link>
            <Link
              href="/visits"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              来店一覧
            </Link>
            <Link
              href="/customers"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              顧客一覧
            </Link>
          </div>
        </div>

        {pageError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : null}

        {paymentSource ? (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            売上参照テーブル：{paymentSource}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-16 text-center text-sm text-neutral-500 shadow-sm">
            ダッシュボードを読み込み中...
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">顧客数</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {stats.customerCount.toLocaleString('ja-JP')}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">来店件数</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {stats.visitCount.toLocaleString('ja-JP')}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">予約件数</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {stats.reservationCount.toLocaleString('ja-JP')}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">総売上</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {formatYen(stats.totalSales)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">{monthLabel}売上</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {formatYen(stats.monthlySales)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">未入金想定件数</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {stats.unpaidCount.toLocaleString('ja-JP')}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900">売上管理</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  来店登録後に売上登録を行うことで、売上一覧とダッシュボードに即時反映できます。
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/sales-payments/new"
                    className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    売上を登録する
                  </Link>
                  <Link
                    href="/sales-payments"
                    className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    売上一覧を見る
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900">現場フロー</h2>
                <div className="mt-3 space-y-3 text-sm text-neutral-700">
                  <div className="rounded-xl bg-neutral-50 px-4 py-3">
                    ① 顧客登録 / 顧客確認
                  </div>
                  <div className="rounded-xl bg-neutral-50 px-4 py-3">
                    ② 来店登録
                  </div>
                  <div className="rounded-xl bg-neutral-50 px-4 py-3">
                    ③ 売上登録
                  </div>
                  <div className="rounded-xl bg-neutral-50 px-4 py-3">
                    ④ ダッシュボードで売上確認
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}