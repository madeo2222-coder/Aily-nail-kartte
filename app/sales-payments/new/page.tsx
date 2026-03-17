'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type VisitRow = {
  id: string
  customer_id: string | null
  visit_date: string | null
  menu?: string | null
  price?: number | string | null
  customers?: {
    name?: string | null
  } | null
}

const PAYMENT_METHODS = [
  { value: 'cash', label: '現金' },
  { value: 'card', label: 'クレカ' },
  { value: 'other', label: 'その他' },
]

function formatDateInput(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

export default function NewSalesPaymentPage() {
  const router = useRouter()

  const [visits, setVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [visitId, setVisitId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentDate, setPaymentDate] = useState(formatDateInput())

  useEffect(() => {
    const fetchVisits = async () => {
      setLoading(true)
      setPageError('')

      const { data, error } = await supabase
        .from('visits')
        .select(
          `
            id,
            customer_id,
            visit_date,
            menu,
            price,
            customers (
              name
            )
          `
        )
        .order('visit_date', { ascending: false })

      if (error) {
        setPageError(`来店データの取得に失敗しました：${error.message}`)
        setVisits([])
        setLoading(false)
        return
      }

      setVisits((data as VisitRow[]) || [])
      setLoading(false)
    }

    fetchVisits()
  }, [])

  const selectedVisit = useMemo(() => {
    return visits.find((v) => String(v.id) === String(visitId)) || null
  }, [visits, visitId])

  useEffect(() => {
    if (!selectedVisit) return
    const visitPrice = selectedVisit.price
    if (visitPrice !== null && visitPrice !== undefined && visitPrice !== '') {
      const numeric = Number(visitPrice)
      if (!Number.isNaN(numeric)) {
        setAmount(String(numeric))
      }
    }
  }, [selectedVisit])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setSuccessMessage('')
    setPageError('')

    if (!visitId) {
      setPageError('来店を選択してください。')
      return
    }

    if (!amount || Number(amount) <= 0) {
      setPageError('金額を正しく入力してください。')
      return
    }

    if (!paymentDate) {
      setPageError('入金日を入力してください。')
      return
    }

    setSaving(true)

    const payload = {
      visit_id: visitId,
      amount: Number(amount),
      payment_method: paymentMethod,
      payment_date: paymentDate,
    }

    const trySalesPayments = await supabase.from('sales_payments').insert([payload])

    if (trySalesPayments.error) {
      const tryPayments = await supabase.from('payments').insert([payload])

      if (tryPayments.error) {
        setPageError(
          `保存に失敗しました。sales_payments / payments の両方でエラーが出ています：${tryPayments.error.message}`
        )
        setSaving(false)
        return
      }
    }

    setSuccessMessage('売上を保存しました。')
    setSaving(false)

    setTimeout(() => {
      router.push('/sales-payments')
    }, 600)
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">売上登録</h1>
            <p className="mt-1 text-sm text-neutral-600">
              来店に紐づく売上・入金情報を登録します
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/sales-payments"
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              一覧へ
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
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

        {successMessage ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
          {loading ? (
            <div className="py-10 text-center text-sm text-neutral-500">来店データを読み込み中...</div>
          ) : visits.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-neutral-600">登録できる来店データがありません。</p>
              <div className="mt-4">
                <Link
                  href="/visits/new"
                  className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  来店登録へ
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="visit_id" className="mb-2 block text-sm font-medium text-neutral-800">
                  来店選択
                </label>
                <select
                  id="visit_id"
                  value={visitId}
                  onChange={(e) => setVisitId(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm outline-none ring-0 transition focus:border-black"
                >
                  <option value="">来店を選択してください</option>
                  {visits.map((visit) => {
                    const customerName = visit.customers?.name || '顧客名未設定'
                    const visitDate = formatDisplayDate(visit.visit_date)
                    const menuName = visit.menu || 'メニュー未設定'
                    const priceText =
                      visit.price !== null && visit.price !== undefined && visit.price !== ''
                        ? ` / ${formatYen(visit.price)}`
                        : ''

                    return (
                      <option key={visit.id} value={visit.id}>
                        {visitDate} / {customerName} / {menuName}
                        {priceText}
                      </option>
                    )
                  })}
                </select>
              </div>

              {selectedVisit ? (
                <div className="rounded-xl bg-neutral-50 p-4">
                  <h2 className="mb-3 text-sm font-semibold text-neutral-900">選択中の来店情報</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-white p-3">
                      <div className="text-xs text-neutral-500">顧客名</div>
                      <div className="mt-1 text-sm font-medium text-neutral-900">
                        {selectedVisit.customers?.name || '顧客名未設定'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <div className="text-xs text-neutral-500">来店日</div>
                      <div className="mt-1 text-sm font-medium text-neutral-900">
                        {formatDisplayDate(selectedVisit.visit_date)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <div className="text-xs text-neutral-500">メニュー</div>
                      <div className="mt-1 text-sm font-medium text-neutral-900">
                        {selectedVisit.menu || '未設定'}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <div className="text-xs text-neutral-500">来店価格</div>
                      <div className="mt-1 text-sm font-medium text-neutral-900">
                        {formatYen(selectedVisit.price)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="amount" className="mb-2 block text-sm font-medium text-neutral-800">
                    金額
                  </label>
                  <input
                    id="amount"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="例：8000"
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-black"
                  />
                </div>

                <div>
                  <label htmlFor="payment_method" className="mb-2 block text-sm font-medium text-neutral-800">
                    支払い方法
                  </label>
                  <select
                    id="payment_method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-black"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="payment_date" className="mb-2 block text-sm font-medium text-neutral-800">
                  入金日
                </label>
                <input
                  id="payment_date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-black"
                />
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? '保存中...' : '売上を保存する'}
                </button>

                <Link
                  href="/sales-payments"
                  className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-100"
                >
                  キャンセル
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}