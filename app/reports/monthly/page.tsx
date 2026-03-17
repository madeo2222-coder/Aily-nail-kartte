'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type PaymentReportRow = {
  id: string
  amount: number
  payment_method: string | null
  payment_date: string | null
}

type VisitReportRow = {
  id: string
  visit_date: string | null
  price: number
}

type MonthlyDayRow = {
  day: string
  sales: number
  count: number
}

function formatYen(value?: number | string | null) {
  const n = Number(value ?? 0)
  if (Number.isNaN(n)) return '¥0'
  return `¥${n.toLocaleString('ja-JP')}`
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function getMonthInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getMonthRange(monthText: string) {
  const [yearText, monthValueText] = monthText.split('-')
  const year = Number(yearText)
  const month = Number(monthValueText)

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)

  const startText = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
  const endText = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-01`

  return { startText, endText, year, month }
}

function getPaymentMethodLabel(value?: string | null) {
  if (!value) return '未設定'
  if (value === 'cash') return '現金'
  if (value === 'card') return 'クレカ'
  if (value === 'other') return 'その他'
  return value
}

function normalizePaymentRows(rows: any[]): PaymentReportRow[] {
  return (rows || []).map((row) => ({
    id: String(row.id),
    amount: Number(row.amount ?? 0),
    payment_method: row.payment_method ?? null,
    payment_date: row.payment_date ?? null,
  }))
}

function normalizeVisitRows(rows: any[]): VisitReportRow[] {
  return (rows || []).map((row) => ({
    id: String(row.id),
    visit_date: row.visit_date ?? null,
    price: Number(row.price ?? 0),
  }))
}

export default function MonthlyReportPage() {
  const [targetMonth, setTargetMonth] = useState(getMonthInputValue())
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [paymentSource, setPaymentSource] = useState<'sales_payments' | 'payments' | ''>('')

  const [payments, setPayments] = useState<PaymentReportRow[]>([])
  const [visits, setVisits] = useState<VisitReportRow[]>([])

  useEffect(() => {
    const fetchMonthlyData = async () => {
      setLoading(true)
      setPageError('')

      const { startText, endText } = getMonthRange(targetMonth)

      const visitsRes = await supabase
        .from('visits')
        .select('id, visit_date, price')
        .gte('visit_date', startText)
        .lt('visit_date', endText)
        .order('visit_date', { ascending: true })

      if (visitsRes.error) {
        setPageError(`来店データ取得エラー: ${visitsRes.error.message}`)
        setVisits([])
      } else {
        setVisits(normalizeVisitRows(visitsRes.data || []))
      }

      const salesPaymentsRes = await supabase
        .from('sales_payments')
        .select('id, amount, payment_method, payment_date')
        .gte('payment_date', startText)
        .lt('payment_date', endText)
        .order('payment_date', { ascending: true })

      if (!salesPaymentsRes.error) {
        setPayments(normalizePaymentRows(salesPaymentsRes.data || []))
        setPaymentSource('sales_payments')
        setLoading(false)
        return
      }

      const paymentsRes = await supabase
        .from('payments')
        .select('id, amount, payment_method, payment_date')
        .gte('payment_date', startText)
        .lt('payment_date', endText)
        .order('payment_date', { ascending: true })

      if (!paymentsRes.error) {
        setPayments(normalizePaymentRows(paymentsRes.data || []))
        setPaymentSource('payments')
        setLoading(false)
        return
      }

      setPayments([])
      setPaymentSource('')
      setPageError((prev) => {
        const paymentErrorText = `売上データ取得エラー: sales_payments → ${salesPaymentsRes.error?.message} / payments → ${paymentsRes.error?.message}`
        return prev ? `${prev} / ${paymentErrorText}` : paymentErrorText
      })
      setLoading(false)
    }

    fetchMonthlyData()
  }, [targetMonth])

  const summary = useMemo(() => {
    const monthlySales = payments.reduce((sum, row) => sum + row.amount, 0)
    const visitCount = visits.length
    const paidCount = payments.length
    const unpaidCount = Math.max(visitCount - paidCount, 0)
    const avgUnitPrice = visitCount > 0 ? Math.round(monthlySales / visitCount) : 0

    const cashSales = payments
      .filter((row) => row.payment_method === 'cash')
      .reduce((sum, row) => sum + row.amount, 0)

    const cardSales = payments
      .filter((row) => row.payment_method === 'card')
      .reduce((sum, row) => sum + row.amount, 0)

    const otherSales = payments
      .filter((row) => row.payment_method === 'other')
      .reduce((sum, row) => sum + row.amount, 0)

    const unknownSales = payments
      .filter(
        (row) =>
          row.payment_method !== 'cash' &&
          row.payment_method !== 'card' &&
          row.payment_method !== 'other'
      )
      .reduce((sum, row) => sum + row.amount, 0)

    return {
      monthlySales,
      visitCount,
      paidCount,
      unpaidCount,
      avgUnitPrice,
      cashSales,
      cardSales,
      otherSales,
      unknownSales,
    }
  }, [payments, visits])

  const dailyRows = useMemo<MonthlyDayRow[]>(() => {
    const map = new Map<string, { sales: number; count: number }>()

    payments.forEach((row) => {
      const key = row.payment_date || ''
      if (!key) return
      const current = map.get(key) || { sales: 0, count: 0 }
      map.set(key, {
        sales: current.sales + row.amount,
        count: current.count + 1,
      })
    })

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({
        day,
        sales: value.sales,
        count: value.count,
      }))
  }, [payments])

  const monthLabel = useMemo(() => {
    const { year, month } = getMonthRange(targetMonth)
    return `${year}年${month}月`
  }, [targetMonth])

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">月次レポート</h1>
            <p className="mt-1 text-sm text-neutral-600">
              売上・支払い方法別・日別売上・来店数・客単価・未入金を確認できます
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ダッシュボード
            </Link>
            <Link
              href="/sales-payments"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              売上一覧
            </Link>
            <Link
              href="/sales-payments/unpaid"
              className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              未入金一覧
            </Link>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <label htmlFor="targetMonth" className="mb-2 block text-sm font-medium text-neutral-800">
                対象月
              </label>
              <input
                id="targetMonth"
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-black"
              />
            </div>

            <div className="text-sm text-neutral-600">
              集計対象：<span className="font-semibold text-neutral-900">{monthLabel}</span>
            </div>
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
            月次レポートを読み込み中...
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">{monthLabel}売上</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {formatYen(summary.monthlySales)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">来店数</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {summary.visitCount.toLocaleString('ja-JP')}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">客単価</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {formatYen(summary.avgUnitPrice)}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">入金済件数</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {summary.paidCount.toLocaleString('ja-JP')}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">未入金件数</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {summary.unpaidCount.toLocaleString('ja-JP')}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-sm text-neutral-500">日別売上日数</div>
                <div className="mt-2 text-3xl font-bold text-neutral-900">
                  {dailyRows.length.toLocaleString('ja-JP')}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900">支払い方法別売上</h2>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span className="text-sm text-neutral-700">現金</span>
                    <span className="text-sm font-semibold text-neutral-900">
                      {formatYen(summary.cashSales)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span className="text-sm text-neutral-700">クレカ</span>
                    <span className="text-sm font-semibold text-neutral-900">
                      {formatYen(summary.cardSales)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span className="text-sm text-neutral-700">その他</span>
                    <span className="text-sm font-semibold text-neutral-900">
                      {formatYen(summary.otherSales)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span className="text-sm text-neutral-700">未設定・その他表記</span>
                    <span className="text-sm font-semibold text-neutral-900">
                      {formatYen(summary.unknownSales)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-neutral-900">月次サマリー</h2>

                <div className="mt-4 space-y-3 text-sm text-neutral-700">
                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>対象月</span>
                    <span className="font-semibold text-neutral-900">{monthLabel}</span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>合計売上</span>
                    <span className="font-semibold text-neutral-900">
                      {formatYen(summary.monthlySales)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>来店数</span>
                    <span className="font-semibold text-neutral-900">
                      {summary.visitCount.toLocaleString('ja-JP')}件
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>入金済件数</span>
                    <span className="font-semibold text-neutral-900">
                      {summary.paidCount.toLocaleString('ja-JP')}件
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>未入金件数</span>
                    <span className="font-semibold text-neutral-900">
                      {summary.unpaidCount.toLocaleString('ja-JP')}件
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                    <span>客単価</span>
                    <span className="font-semibold text-neutral-900">
                      {formatYen(summary.avgUnitPrice)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-neutral-900">日別売上</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  入金日ベースで日別の売上と件数を表示します
                </p>
              </div>

              {dailyRows.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-neutral-500">
                  この月の売上データはありません
                </div>
              ) : (
                <>
                  <div className="hidden md:block">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600">
                            日付
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600">
                            件数
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600">
                            売上
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyRows.map((row) => (
                          <tr key={row.day} className="border-b border-neutral-100 last:border-b-0">
                            <td className="px-4 py-4 text-sm text-neutral-700">
                              {formatDate(row.day)}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-neutral-700">
                              {row.count.toLocaleString('ja-JP')}件
                            </td>
                            <td className="px-4 py-4 text-right text-sm font-semibold text-neutral-900">
                              {formatYen(row.sales)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 p-4 md:hidden">
                    {dailyRows.map((row) => (
                      <div key={row.day} className="rounded-xl border border-neutral-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-neutral-900">
                            {formatDate(row.day)}
                          </div>
                          <div className="text-sm font-bold text-neutral-900">
                            {formatYen(row.sales)}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-neutral-500">
                          件数：{row.count.toLocaleString('ja-JP')}件
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-neutral-900">売上明細</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  入金日・支払い方法ごとの売上明細です
                </p>
              </div>

              {payments.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-neutral-500">
                  この月の売上明細はありません
                </div>
              ) : (
                <>
                  <div className="hidden md:block">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600">
                            入金日
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600">
                            支払い方法
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600">
                            金額
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((row) => (
                          <tr key={row.id} className="border-b border-neutral-100 last:border-b-0">
                            <td className="px-4 py-4 text-sm text-neutral-700">
                              {formatDate(row.payment_date)}
                            </td>
                            <td className="px-4 py-4 text-sm text-neutral-700">
                              {getPaymentMethodLabel(row.payment_method)}
                            </td>
                            <td className="px-4 py-4 text-right text-sm font-semibold text-neutral-900">
                              {formatYen(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 p-4 md:hidden">
                    {payments.map((row) => (
                      <div key={row.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-neutral-900">
                              {formatDate(row.payment_date)}
                            </div>
                            <div className="mt-1 text-xs text-neutral-500">
                              {getPaymentMethodLabel(row.payment_method)}
                            </div>
                          </div>
                          <div className="text-sm font-bold text-neutral-900">
                            {formatYen(row.amount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}