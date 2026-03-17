"use client"

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Visit = {
  id: string
  customer_id: string | null
  menu: string | null
  color: string | null
  memo: string | null
  price: number | null
  photo_urls: string[] | null
  created_at: string | null
}

type Customer = {
  id: string
  name: string | null
}

const BUCKET_NAME = "visit-photos"

function formatDate(date: string | null) {
  if (!date) return "-"
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return "-"
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export default function EditVisitPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [visit, setVisit] = useState<Visit | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)

  const [menu, setMenu] = useState("")
  const [color, setColor] = useState("")
  const [memo, setMemo] = useState("")
  const [price, setPrice] = useState("")
  const [photoUrls, setPhotoUrls] = useState<string[]>([])

  const [newFiles, setNewFiles] = useState<File[]>([])
  const [newPreviews, setNewPreviews] = useState<string[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const customerDetailHref = useMemo(() => {
    if (!visit?.customer_id) return "/visits"
    return `/customers/${visit.customer_id}`
  }, [visit?.customer_id])

  useEffect(() => {
    if (!id) return

    async function fetchVisit() {
      setLoading(true)
      setErrorMessage("")

      const { data, error } = await supabase
        .from("visits")
        .select("id,customer_id,menu,color,memo,price,photo_urls,created_at")
        .eq("id", id)
        .single()

      if (error || !data) {
        setErrorMessage("来店履歴が見つかりません。")
        setLoading(false)
        return
      }

      const currentVisit = data as Visit
      setVisit(currentVisit)
      setMenu(currentVisit.menu ?? "")
      setColor(currentVisit.color ?? "")
      setMemo(currentVisit.memo ?? "")
      setPrice(
        currentVisit.price === null || currentVisit.price === undefined
          ? ""
          : String(currentVisit.price)
      )
      setPhotoUrls(currentVisit.photo_urls ?? [])

      if (currentVisit.customer_id) {
        const { data: customerData } = await supabase
          .from("customers")
          .select("id,name")
          .eq("id", currentVisit.customer_id)
          .single()

        if (customerData) {
          setCustomer(customerData as Customer)
        }
      }

      setLoading(false)
    }

    fetchVisit()
  }, [id])

  useEffect(() => {
    return () => {
      newPreviews.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [newPreviews])

  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    newPreviews.forEach((url) => URL.revokeObjectURL(url))

    setNewFiles(files)
    setNewPreviews(files.map((file) => URL.createObjectURL(file)))
  }

  function removeExistingPhoto(targetUrl: string) {
    setPhotoUrls((prev) => prev.filter((url) => url !== targetUrl))
  }

  function removeNewPhoto(index: number) {
    const target = newPreviews[index]
    if (target) URL.revokeObjectURL(target)

    setNewFiles((prev) => prev.filter((_, i) => i !== index))
    setNewPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  async function uploadNewFiles() {
    const uploadedUrls: string[] = []

    for (const file of newFiles) {
      const ext = file.name.split(".").pop() || "jpg"
      const filePath = `${visit?.customer_id ?? "unknown"}/${id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file)

      if (uploadError) {
        throw new Error("写真アップロードに失敗しました。")
      }

      const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)
      if (data?.publicUrl) {
        uploadedUrls.push(data.publicUrl)
      }
    }

    return uploadedUrls
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!visit || saving) return

    setSaving(true)
    setErrorMessage("")

    try {
      let uploadedUrls: string[] = []

      if (newFiles.length > 0) {
        uploadedUrls = await uploadNewFiles()
      }

      const parsedPrice =
        price.trim() === "" ? null : Number(price.replace(/,/g, ""))

      if (price.trim() !== "" && Number.isNaN(parsedPrice)) {
        setErrorMessage("金額は数字で入力してください。")
        setSaving(false)
        return
      }

      const nextPhotoUrls = [...photoUrls, ...uploadedUrls]

      const { error } = await supabase
        .from("visits")
        .update({
          menu: menu.trim() || null,
          color: color.trim() || null,
          memo: memo.trim() || null,
          price: parsedPrice,
          photo_urls: nextPhotoUrls,
        })
        .eq("id", visit.id)

      if (error) {
        setErrorMessage("来店履歴の更新に失敗しました。")
        setSaving(false)
        return
      }

      router.push(customerDetailHref)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "更新中にエラーが発生しました。"
      )
      setSaving(false)
    }
  }

  async function handleDeleteVisit() {
    if (!visit || deleting) return

    const confirmed = window.confirm("この来店履歴を削除しますか？")
    if (!confirmed) return

    setDeleting(true)
    setErrorMessage("")

    const { error } = await supabase
      .from("visits")
      .delete()
      .eq("id", visit.id)

    if (error) {
      setErrorMessage("来店履歴の削除に失敗しました。")
      setDeleting(false)
      return
    }

    router.push(customerDetailHref)
  }

  if (loading) {
    return <div className="p-6">読み込み中...</div>
  }

  if (!visit) {
    return <div className="p-6">来店履歴が見つかりません。</div>
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">来店履歴編集</h1>
          <p className="text-sm text-gray-500">
            {customer?.name || "顧客名未登録"} / {formatDate(visit.created_at)}
          </p>
        </div>
        <Link href={customerDetailHref} className="rounded-xl border px-4 py-2 text-sm">
          顧客詳細へ戻る
        </Link>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium">メニュー</label>
            <input
              type="text"
              value={menu}
              onChange={(e) => setMenu(e.target.value)}
              placeholder="ワンカラー / 定額デザイン など"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">カラー</label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="ベージュ / ピンク など"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">金額</label>
            <input
              type="text"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="6500"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">メモ</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={5}
              placeholder="施術内容や次回提案など"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">既存写真</label>
            {photoUrls.length === 0 ? (
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                写真はまだありません
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photoUrls.map((url) => (
                  <div key={url} className="rounded-xl border p-2">
                    <img
                      src={url}
                      alt="visit photo"
                      className="h-32 w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeExistingPhoto(url)}
                      className="mt-2 w-full rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600"
                    >
                      この写真を外す
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">写真を追加</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFilesChange}
              className="block w-full text-sm"
            />

            {newPreviews.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {newPreviews.map((preview, index) => (
                  <div key={`${preview}-${index}`} className="rounded-xl border p-2">
                    <img
                      src={preview}
                      alt="new preview"
                      className="h-32 w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeNewPhoto(index)}
                      className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      追加をやめる
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
            >
              {saving ? "保存中..." : "保存する"}
            </button>

            <button
              type="button"
              onClick={handleDeleteVisit}
              disabled={deleting}
              className="rounded-xl border border-red-200 px-4 py-3 text-red-600 disabled:opacity-60"
            >
              {deleting ? "削除中..." : "この来店履歴を削除"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}