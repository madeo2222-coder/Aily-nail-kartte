'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type PaymentRow = {
  id: string
  visit_id: string | null
  amount: number
  payment_method: string | null
  payment_date: string | null
  visit_date: string | null
  menu: string | null
  customer_name: string | null
}

function formatDisplayDate(value?: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function formatYen(value?: number | string | null) {
  const n = Number(value ?? 0)
  if (Number.isNaN(n)) return '¥0'
  return `¥${n.toLocaleString('ja-JP')}`
}

function getPaymentMethodLabel(value?: string | null) {
  if (!value) return '-'
  if (value === 'cash') return '現金'
  if (value === 'card') return 'クレカ'
  if (value === 'other') return 'その他'
  return value
}

function normalizePaymentRows(rows: any[]): PaymentRow[] {
  return (rows || []).map((row) => {
    const visit = Array.isArray(row.visits) ? row.visits[0] : row.visits
    const customer = Array.isArray(visit?.customers) ? visit?.customers[0] : visit?.customers

    return {
      id: String(row.id),
      visit_id: row.visit_id ? String(row.visit_id) : null,
      amount: Number(row.amount ?? 0),
      payment_method: row.payment_method ?? null,
      payment_date: row.payment_date ?? null,
      visit_date: visit?.visit_date ?? null,
      menu: visit?.menu ?? null,
      customer_name: customer?.name ?? null,
    }
  })
}

export default function SalesPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [usingTable, setUsingTable] = useState<'sales_payments' | 'payments' | ''>('')

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true)
      setPageError('')

      const salesPaymentsQuery = await supabase
        .from('sales_payments')
        .select(
          `
            id,
            visit_id,
            amount,
            payment_method,
            payment_date,
            visits (
              id,
              visit_date,
              menu,
              customer_id,
              customers (
                name
              )
            )
          `
        )
        .order('payment_date', { ascending: false })

      if (!salesPaymentsQuery.error) {
        setPayments(normalizePaymentRows(salesPaymentsQuery.data || []))
        setUsingTable('sales_payments')
        setLoading(false)
        return
      }

      const paymentsQuery = await supabase
        .from('payments')
        .select(
          `
            id,
            visit_id,
            amount,
            payment_method,
            payment_date,
            visits (
              id,
              visit_date,
              menu,
              customer_id,
              customers (
                name
              )
            )
          `
        )
        .order('payment_date', { ascending: false })

      if (!paymentsQuery.error) {
        setPayments(normalizePaymentRows(paymentsQuery.data || []))
        setUsingTable('payments')
        setLoading(false)
        return
      }

      setPageError(
        `売上データの取得に失敗しました：sales_payments → ${salesPaymentsQuery.error.message} / payments → ${paymentsQuery.error.message}`
      )
      setPayments([])
      setUsingTable('')
      setLoading(false)
    }

    fetchPayments()
  }, [])

  const totalAmount = useMemo(() => {
    return payments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  }, [payments])

  const currentMonthTotal = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    return payments.reduce((sum, row) => {
      if (!row.payment_date) return sum
      const d = new Date(row.payment_date)
      if (Number.isNaN(d.getTime())) return sum
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        return sum + Number(row.amount ?? 0)
      }
      return sum
    }, 0)
  }, [payments])

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">売上一覧</h1>
            <p className="mt-1 text-sm text-neutral-600">入金情報の一覧・合計を確認できます</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/sales-payments/new"
              className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              売上登録
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ダッシュボード
            </Link>
          </div>
        </div>

        {pageError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : null}

        {usingTable ? (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            使用テーブル：{usingTable}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-neutral-500">総売上合計</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{formatYen(totalAmount)}</div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-neutral-500">今月売上</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">
              {formatYen(currentMonthTotal)}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-neutral-500">登録件数</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">
              {payments.length.toLocaleString('ja-JP')}件
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {loading ? (
            <div className="py-12 text-center text-sm text-neutral-500">売上データを読み込み中...</div>
          ) : payments.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-neutral-600">売上データはまだありません。</p>
              <div className="mt-4">
                <Link
                  href="/sales-payments/new"
                  className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  最初の売上を登録する
                </Link>
              </div>
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
                        来店日
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600">
                        顧客名
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600">
                        メニュー
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
                          {formatDisplayDate(row.payment_date)}
                        </td>
                        <td className="px-4 py-4 text-sm text-neutral-700">
                          {formatDisplayDate(row.visit_date)}
                        </td>
                        <td className="px-4 py-4 text-sm font-medium text-neutral-900">
                          {row.customer_name || '顧客名未設定'}
                        </td>
                        <td className="px-4 py-4 text-sm text-neutral-700">{row.menu || '-'}</td>
                        <td className="px-4 py-4 text-sm text-neutral-700">
                          {getPaymentMethodLabel(row.payment_method)}
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-semibold text-neutral-900">
                          {formatYen(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-neutral-50">
                      <td
                        colSpan={5}
                        className="px-4 py-4 text-right text-sm font-semibold text-neutral-700"
                      >
                        合計
                      </td>
                      <td className="px-4 py-4 text-right text-base font-bold text-neutral-900">
                        {formatYen(totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {payments.map((row) => (
                  <div key={row.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">
                          {row.customer_name || '顧客名未設定'}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          来店日：{formatDisplayDate(row.visit_date)}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          入金日：{formatDisplayDate(row.payment_date)}
                        </div>
                      </div>
                      <div className="text-right text-sm font-bold text-neutral-900">
                        {formatYen(row.amount)}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-neutral-50 px-3 py-2 text-neutral-700">
                        メニュー：{row.menu || '-'}
                      </div>
                      <div className="rounded-lg bg-neutral-50 px-3 py-2 text-neutral-700">
                        支払方法：{getPaymentMethodLabel(row.payment_method)}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="rounded-xl bg-neutral-900 p-4 text-white">
                  <div className="text-sm text-neutral-300">合計</div>
                  <div className="mt-1 text-xl font-bold">{formatYen(totalAmount)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}