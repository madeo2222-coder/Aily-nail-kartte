"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Visit = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  menu: string | null;
  color: string | null;
  memo: string | null;
  price: number | null;
  payment_method: string | null;
  photo_urls: string[] | null;
  created_at: string | null;
};

type Customer = {
  id: string;
  name: string | null;
};

type VisitPaymentRow = {
  id: string;
  visit_id: string;
  payment_method: string | null;
  amount: number | null;
  sort_order: number | null;
};

type PaymentLine = {
  id: string;
  payment_method: string;
  amount: string;
};

const BUCKET_NAME = "visit-photos";

const PAYMENT_METHOD_OPTIONS = [
  "現金",
  "クレジットカード",
  "PayPay",
  "交通系IC",
  "iD",
  "QUICPay",
  "楽天Edy",
  "WAON",
  "nanaco",
  "UnionPay（銀聯）",
  "Discover",
  "ホットペッパーポイント",
  "割引",
  "その他",
];

function formatDate(date: string | null) {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function createLineId() {
  return `payment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createPaymentLine(method = "現金", amount = ""): PaymentLine {
  return {
    id: createLineId(),
    payment_method: method,
    amount,
  };
}

function toSafeNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function yen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function isDiscountMethod(method: string) {
  return method.trim() === "割引";
}

function formatAmountPreview(value: string) {
  const amount = toSafeNumber(value);
  if (!Number.isFinite(amount)) return "未入力";
  return `${amount.toLocaleString("ja-JP")}`;
}

export default function EditVisitPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [visit, setVisit] = useState<Visit | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [visitDate, setVisitDate] = useState("");
  const [menu, setMenu] = useState("");
  const [color, setColor] = useState("");
  const [memo, setMemo] = useState("");
  const [price, setPrice] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    createPaymentLine("現金", ""),
  ]);

  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const customerDetailHref = useMemo(() => {
    if (!visit?.customer_id) return "/visits";
    return `/customers/${visit.customer_id}`;
  }, [visit?.customer_id]);

  const totalPrice = useMemo(() => {
    return toSafeNumber(price);
  }, [price]);

  const paymentTotal = useMemo(() => {
    return paymentLines.reduce((sum, line) => {
      const amount = toSafeNumber(line.amount);
      if (!Number.isFinite(amount)) return sum;
      return sum + amount;
    }, 0);
  }, [paymentLines]);

  const paymentDiff = useMemo(() => {
    if (!Number.isFinite(totalPrice)) return NaN;
    return totalPrice - paymentTotal;
  }, [totalPrice, paymentTotal]);

  useEffect(() => {
    if (!id) return;

    async function fetchVisit() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("visits")
        .select(
          "id,customer_id,visit_date,menu,color,memo,price,payment_method,photo_urls,created_at"
        )
        .eq("id", id)
        .single();

      if (error || !data) {
        setErrorMessage("来店履歴が見つかりません。");
        setLoading(false);
        return;
      }

      const currentVisit = data as Visit;
      setVisit(currentVisit);
      setVisitDate(currentVisit.visit_date || "");
      setMenu(currentVisit.menu ?? "");
      setColor(currentVisit.color ?? "");
      setMemo(currentVisit.memo ?? "");
      setPrice(
        currentVisit.price === null || currentVisit.price === undefined
          ? ""
          : String(currentVisit.price)
      );
      setPhotoUrls(currentVisit.photo_urls ?? []);

      if (currentVisit.customer_id) {
        const { data: customerData } = await supabase
          .from("customers")
          .select("id,name")
          .eq("id", currentVisit.customer_id)
          .single();

        if (customerData) {
          setCustomer(customerData as Customer);
        }
      }

      const { data: paymentData, error: paymentError } = await supabase
        .from("visit_payments")
        .select("id, visit_id, payment_method, amount, sort_order")
        .eq("visit_id", id)
        .order("sort_order", { ascending: true });

      if (paymentError) {
        console.error("visit_payments取得エラー:", paymentError);
      }

      const paymentRows = (paymentData ?? []) as VisitPaymentRow[];

      if (paymentRows.length > 0) {
        setPaymentLines(
          paymentRows.map((row) => ({
            id: row.id || createLineId(),
            payment_method: row.payment_method || "現金",
            amount:
              row.amount === null || row.amount === undefined ? "" : String(row.amount),
          }))
        );
      } else {
        setPaymentLines([
          createPaymentLine(
            currentVisit.payment_method || "現金",
            currentVisit.price === null || currentVisit.price === undefined
              ? ""
              : String(currentVisit.price)
          ),
        ]);
      }

      setLoading(false);
    }

    fetchVisit();
  }, [id]);

  useEffect(() => {
    return () => {
      newPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [newPreviews]);

  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    newPreviews.forEach((url) => URL.revokeObjectURL(url));

    setNewFiles(files);
    setNewPreviews(files.map((file) => URL.createObjectURL(file)));
  }

  function removeExistingPhoto(targetUrl: string) {
    setPhotoUrls((prev) => prev.filter((url) => url !== targetUrl));
  }

  function removeNewPhoto(index: number) {
    const target = newPreviews[index];
    if (target) URL.revokeObjectURL(target);

    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePaymentLine(
    lineId: string,
    key: "payment_method" | "amount",
    value: string
  ) {
    setPaymentLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? {
              ...line,
              [key]: value,
            }
          : line
      )
    );
  }

  function addPaymentLine() {
    setPaymentLines((prev) => [...prev, createPaymentLine("現金", "")]);
  }

  function removePaymentLine(lineId: string) {
    setPaymentLines((prev) => {
      if (prev.length === 1) {
        return [createPaymentLine("現金", "")];
      }
      return prev.filter((line) => line.id !== lineId);
    });
  }

  async function uploadNewFiles() {
    const uploadedUrls: string[] = [];

    for (const file of newFiles) {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${visit?.customer_id ?? "unknown"}/${id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file);

      if (uploadError) {
        throw new Error("写真アップロードに失敗しました。");
      }

      const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
      if (data?.publicUrl) {
        uploadedUrls.push(data.publicUrl);
      }
    }

    return uploadedUrls;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!visit || saving) return;

    setSaving(true);
    setErrorMessage("");

    try {
      let uploadedUrls: string[] = [];

      if (newFiles.length > 0) {
        uploadedUrls = await uploadNewFiles();
      }

      const parsedPrice =
        price.trim() === "" ? null : Number(price.replace(/,/g, ""));

      if (price.trim() !== "" && Number.isNaN(parsedPrice)) {
        setErrorMessage("金額は数字で入力してください。");
        setSaving(false);
        return;
      }

      if (!visitDate) {
        setErrorMessage("来店日を入力してください。");
        setSaving(false);
        return;
      }

      if (!Number.isFinite(totalPrice) || totalPrice < 0) {
        setErrorMessage("売上金額を正しく入力してください。");
        setSaving(false);
        return;
      }

      const cleanedPaymentLines = paymentLines
        .map((line, index) => ({
          payment_method: line.payment_method.trim(),
          amount: toSafeNumber(line.amount),
          sort_order: index + 1,
        }))
        .filter((line) => line.payment_method && line.amount !== 0);

      if (cleanedPaymentLines.length === 0) {
        setErrorMessage("支払い内訳を1件以上入力してください。");
        setSaving(false);
        return;
      }

      const hasInvalidPaymentAmount = cleanedPaymentLines.some(
        (line) => !Number.isFinite(line.amount)
      );

      if (hasInvalidPaymentAmount) {
        setErrorMessage("支払い内訳の金額を正しく入力してください。");
        setSaving(false);
        return;
      }

      const hasDiscountPositive = cleanedPaymentLines.some(
        (line) => isDiscountMethod(line.payment_method) && line.amount > 0
      );

      if (hasDiscountPositive) {
        setErrorMessage("割引はマイナス金額で入力してください。");
        setSaving(false);
        return;
      }

      const hasNonDiscountNegative = cleanedPaymentLines.some(
        (line) => !isDiscountMethod(line.payment_method) && line.amount < 0
      );

      if (hasNonDiscountNegative) {
        setErrorMessage("割引以外の支払い方法はマイナスにできません。");
        setSaving(false);
        return;
      }

      if (paymentTotal !== totalPrice) {
        setErrorMessage("売上金額と支払い内訳合計を一致させてください。");
        setSaving(false);
        return;
      }

      const nextPhotoUrls = [...photoUrls, ...uploadedUrls];
      const mainPaymentMethod =
        cleanedPaymentLines.length === 1
          ? cleanedPaymentLines[0].payment_method
          : "複数";

      const { error: visitUpdateError } = await supabase
        .from("visits")
        .update({
          visit_date: visitDate,
          menu: menu.trim() || null,
          color: color.trim() || null,
          memo: memo.trim() || null,
          price: parsedPrice,
          payment_method: mainPaymentMethod,
          photo_urls: nextPhotoUrls,
        })
        .eq("id", visit.id);

      if (visitUpdateError) {
        setErrorMessage("来店履歴の更新に失敗しました。");
        setSaving(false);
        return;
      }

      const { error: paymentDeleteError } = await supabase
        .from("visit_payments")
        .delete()
        .eq("visit_id", visit.id);

      if (paymentDeleteError) {
        setErrorMessage("支払い内訳の更新に失敗しました。");
        setSaving(false);
        return;
      }

      const paymentPayload = cleanedPaymentLines.map((line) => ({
        visit_id: visit.id,
        payment_method: line.payment_method,
        amount: line.amount,
        sort_order: line.sort_order,
      }));

      const { error: paymentInsertError } = await supabase
        .from("visit_payments")
        .insert(paymentPayload);

      if (paymentInsertError) {
        setErrorMessage("支払い内訳の更新に失敗しました。");
        setSaving(false);
        return;
      }

      router.push(customerDetailHref);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "更新中にエラーが発生しました。"
      );
      setSaving(false);
    }
  }

  async function handleDeleteVisit() {
    if (!visit || deleting) return;

    const confirmed = window.confirm("この来店履歴を削除しますか？");
    if (!confirmed) return;

    setDeleting(true);
    setErrorMessage("");

    const { error: paymentDeleteError } = await supabase
      .from("visit_payments")
      .delete()
      .eq("visit_id", visit.id);

    if (paymentDeleteError) {
      setErrorMessage("支払い内訳の削除に失敗しました。");
      setDeleting(false);
      return;
    }

    const { error: visitDeleteError } = await supabase
      .from("visits")
      .delete()
      .eq("id", visit.id);

    if (visitDeleteError) {
      setErrorMessage("来店履歴の削除に失敗しました。");
      setDeleting(false);
      return;
    }

    router.push(customerDetailHref);
  }

  if (loading) {
    return <div className="p-6">読み込み中...</div>;
  }

  if (!visit) {
    return <div className="p-6">来店履歴が見つかりません。</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24">
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
            <label className="mb-2 block text-sm font-medium">来店日</label>
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
            />
          </div>

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
              placeholder="赤 / ベージュ / クリア など"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">メモ</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={5}
              placeholder="メモを入力"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">金額</label>
            <input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="例: 6500"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900">支払い内訳</div>
                <div className="mt-1 text-xs text-slate-500">
                  例: 現金 6000 / 割引 -1000 → 売上金額 5000
                </div>
              </div>

              <button
                type="button"
                onClick={addPaymentLine}
                className="rounded-xl border bg-white px-3 py-2 text-sm font-bold text-slate-700"
              >
                ＋行追加
              </button>
            </div>

            <div className="space-y-3">
              {paymentLines.map((line, index) => {
                const isDiscount = isDiscountMethod(line.payment_method);

                return (
                  <div key={line.id} className="rounded-2xl border bg-white p-3">
                    <div className="mb-3 text-xs font-bold text-slate-500">
                      内訳 {index + 1}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_auto]">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          支払い方法
                        </label>
                        <select
                          value={line.payment_method}
                          onChange={(e) =>
                            updatePaymentLine(line.id, "payment_method", e.target.value)
                          }
                          className="w-full rounded-xl border px-3 py-3 text-sm"
                        >
                          {PAYMENT_METHOD_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          金額
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={line.amount}
                          onChange={(e) =>
                            updatePaymentLine(line.id, "amount", e.target.value)
                          }
                          placeholder={isDiscount ? "例: -1000" : "例: 5000"}
                          className={`w-full rounded-xl border px-3 py-3 text-sm ${
                            isDiscount ? "border-rose-300 bg-rose-50" : ""
                          }`}
                        />
                        {isDiscount ? (
                          <p className="mt-1 text-[11px] text-rose-600">
                            割引はマイナスで入力
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removePaymentLine(line.id)}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-bold text-red-600"
                        >
                          削除
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      入力値: {formatAmountPreview(line.amount)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <div className="text-xs text-slate-500">売上金額</div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {Number.isFinite(totalPrice) ? yen(totalPrice) : "-"}
                </div>
              </div>

              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <div className="text-xs text-slate-500">内訳合計</div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {yen(paymentTotal)}
                </div>
              </div>

              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <div className="text-xs text-slate-500">差額</div>
                <div
                  className={`mt-1 text-lg font-bold ${
                    paymentDiff === 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {Number.isFinite(paymentDiff) ? yen(paymentDiff) : "-"}
                </div>
              </div>
            </div>

            {Number.isFinite(paymentDiff) && paymentDiff !== 0 ? (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                売上金額と支払い内訳合計を一致させてください。
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">既存写真</label>
            {photoUrls.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-gray-500">
                写真はありません。
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
                      className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
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
              disabled={saving || deleting}
              className="rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
            >
              {saving ? "保存中..." : "保存する"}
            </button>

            <button
              type="button"
              onClick={handleDeleteVisit}
              disabled={saving || deleting}
              className="rounded-xl border border-red-200 px-4 py-3 text-red-600 disabled:opacity-60"
            >
              {deleting ? "削除中..." : "この来店履歴を削除"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}