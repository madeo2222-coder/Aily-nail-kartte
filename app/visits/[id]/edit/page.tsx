"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  VISIT_PHOTO_ACCEPT,
  createVisitPhotoPath,
  validateVisitPhotoFile,
  validateVisitPhotoMetadata,
} from "@/lib/visitPhotoStorage";
import VisitEditPhoto from "./VisitEditPhoto";

type Visit = {
  id: string;
  customer_id: string | null;
  visit_date: string | null;
  menu: string | null;
  menu_name: string | null;
  color: string | null;
  memo: string | null;
  price: number | null;
  payment_method: string | null;
  created_at: string | null;
};

type Customer = {
  id: string;
  name: string | null;
  salon_id: string | null;
};

type VisitPaymentRow = {
  id: string;
  visit_id: string;
  payment_method: string | null;
  amount: number | null;
  sort_order: number | null;
};

type VisitPhotoRow = {
  id: string;
  visit_id: string | null;
  salon_id: string | null;
  image_url: string | null;
  photo_type: string | null;
  created_at: string | null;
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
  const [existingPhotos, setExistingPhotos] = useState<VisitPhotoRow[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);

  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    createPaymentLine("現金", ""),
  ]);

  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const newPreviewUrls = useRef(new Set<string>());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const loadRequestVersion = useRef(0);

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

    const requestVersion = ++loadRequestVersion.current;

    async function fetchVisit() {
      setLoading(true);
      setLoadError("");
      setErrorMessage("");
      setVisit(null);
      setCustomer(null);
      setExistingPhotos([]);
      setRemovedPhotoIds([]);

      try {
        const { data, error } = await supabase
          .from("visits")
          .select(
            "id,customer_id,visit_date,menu,menu_name,color,memo,price,payment_method,created_at"
          )
          .eq("id", id)
          .single();

        if (loadRequestVersion.current !== requestVersion) return;

        if (error) {
          console.error("visits取得エラー:", error);
          setLoadError("来店履歴の取得に失敗しました。時間をおいて再試行してください。");
          setLoading(false);
          return;
        }

        if (!data) {
          setLoadError("来店履歴が見つかりません。削除済みの可能性があります。");
          setLoading(false);
          return;
        }

        const currentVisit = data as Visit;
        const customerRequest = currentVisit.customer_id
          ? supabase
              .from("customers")
              .select("id,name,salon_id")
              .eq("id", currentVisit.customer_id)
              .single()
          : Promise.resolve({ data: null, error: null });

        const [customerResult, photoResult, paymentResult] = await Promise.all([
          customerRequest,
          supabase
            .from("visit_photos")
            .select("id, visit_id, salon_id, image_url, photo_type, created_at")
            .eq("visit_id", id)
            .order("created_at", { ascending: true }),
          supabase
            .from("visit_payments")
            .select("id, visit_id, payment_method, amount, sort_order")
            .eq("visit_id", id)
            .order("sort_order", { ascending: true }),
        ]);

        if (loadRequestVersion.current !== requestVersion) return;

        const missingCustomer = Boolean(
          currentVisit.customer_id && !customerResult.data
        );
        const failedSources = [
          customerResult.error || missingCustomer ? "顧客" : "",
          photoResult.error ? "写真" : "",
          paymentResult.error ? "支払い内訳" : "",
        ].filter(Boolean);

        if (failedSources.length > 0) {
          if (customerResult.error || missingCustomer) {
            console.error("customers取得エラー:", customerResult.error);
          }
          if (photoResult.error) {
            console.error("visit_photos取得エラー:", photoResult.error);
          }
          if (paymentResult.error) {
            console.error("visit_payments取得エラー:", paymentResult.error);
          }
          setLoadError(
            `${failedSources.join("・")}の取得に失敗しました。不完全な状態での編集を防ぐため、再試行してください。`
          );
          setLoading(false);
          return;
        }

        const paymentRows = (paymentResult.data ?? []) as VisitPaymentRow[];

        setVisit(currentVisit);
        setCustomer((customerResult.data as Customer | null) ?? null);
        setVisitDate(currentVisit.visit_date || "");
        setMenu(currentVisit.menu_name ?? currentVisit.menu ?? "");
        setColor(currentVisit.color ?? "");
        setMemo(currentVisit.memo ?? "");
        setPrice(
          currentVisit.price === null || currentVisit.price === undefined
            ? ""
            : String(currentVisit.price)
        );
        setExistingPhotos((photoResult.data ?? []) as VisitPhotoRow[]);
        setPaymentLines(
          paymentRows.length > 0
            ? paymentRows.map((row) => ({
                id: row.id || createLineId(),
                payment_method: row.payment_method || "現金",
                amount:
                  row.amount === null || row.amount === undefined
                    ? ""
                    : String(row.amount),
              }))
            : [
                createPaymentLine(
                  currentVisit.payment_method || "現金",
                  currentVisit.price === null || currentVisit.price === undefined
                    ? ""
                    : String(currentVisit.price)
                ),
              ]
        );
        setLoading(false);
      } catch (error) {
        if (loadRequestVersion.current !== requestVersion) return;
        console.error("来店履歴編集データ取得エラー:", error);
        setLoadError(
          "来店履歴の編集データを取得できませんでした。通信状態を確認して再試行してください。"
        );
        setLoading(false);
      }
    }

    void fetchVisit();

    return () => {
      if (loadRequestVersion.current === requestVersion) {
        loadRequestVersion.current += 1;
      }
    };
  }, [id, loadAttempt]);

  useEffect(() => {
    const urls = newPreviewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    newPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    newPreviewUrls.current.clear();

    const imageFiles: File[] = [];
    let rejectionMessage = "";
    for (const file of files) {
      try {
        validateVisitPhotoMetadata(file);
        imageFiles.push(file);
      } catch (error) {
        rejectionMessage = error instanceof Error ? error.message : "写真を選択できませんでした。";
      }
    }
    setErrorMessage(rejectionMessage);

    const previewUrls = imageFiles.map((file) => URL.createObjectURL(file));
    previewUrls.forEach((url) => newPreviewUrls.current.add(url));

    setNewFiles(imageFiles);
    setNewPreviews(previewUrls);
  }

  function removeExistingPhoto(photoId: string) {
    setRemovedPhotoIds((prev) => [...prev, photoId]);
    setExistingPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
  }

  function removeNewPhoto(index: number) {
    const target = newPreviews[index];
    if (target && newPreviewUrls.current.delete(target)) {
      URL.revokeObjectURL(target);
    }

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
    const uploadedRows: {
      visit_id: string;
      salon_id: string | null;
      image_url: string;
      photo_type: string;
    }[] = [];

    for (const file of newFiles) {
      const validatedPhoto = await validateVisitPhotoFile(file);
      const filePath = createVisitPhotoPath(id, validatedPhoto.extension);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, validatedPhoto.file, {
          cacheControl: "3600",
          contentType: validatedPhoto.contentType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`写真アップロードに失敗しました: ${uploadError.message}`);
      }

      const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);

      if (data?.publicUrl) {
        uploadedRows.push({
          visit_id: id,
          salon_id: customer?.salon_id || null,
          image_url: data.publicUrl,
          photo_type: "after",
        });
      }
    }

    if (uploadedRows.length > 0) {
      const { error: insertPhotoError } = await supabase
        .from("visit_photos")
        .insert(uploadedRows);

      if (insertPhotoError) {
        throw new Error(`写真情報の保存に失敗しました: ${insertPhotoError.message}`);
      }
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!visit || saving) return;

    setSaving(true);
    setErrorMessage("");

    try {
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

      await Promise.all(newFiles.map((file) => validateVisitPhotoFile(file)));

      const mainPaymentMethod =
        cleanedPaymentLines.length === 1
          ? cleanedPaymentLines[0].payment_method
          : "複数";

      const normalizedMenu = menu.trim() || null;

      const { error: visitUpdateError } = await supabase
        .from("visits")
        .update({
          visit_date: visitDate,
          menu: normalizedMenu,
          menu_name: normalizedMenu,
          color: color.trim() || null,
          memo: memo.trim() || null,
          price: parsedPrice,
          payment_method: mainPaymentMethod,
        })
        .eq("id", visit.id);

      if (visitUpdateError) {
        setErrorMessage("来店履歴の更新に失敗しました。");
        setSaving(false);
        return;
      }

      if (removedPhotoIds.length > 0) {
        const { error: photoDeleteError } = await supabase
          .from("visit_photos")
          .delete()
          .in("id", removedPhotoIds);

        if (photoDeleteError) {
          setErrorMessage("写真の削除に失敗しました。");
          setSaving(false);
          return;
        }
      }

      if (newFiles.length > 0) {
        await uploadNewFiles();
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

    const { error: photoDeleteError } = await supabase
      .from("visit_photos")
      .delete()
      .eq("visit_id", visit.id);

    if (photoDeleteError) {
      setErrorMessage("写真情報の削除に失敗しました。");
      setDeleting(false);
      return;
    }

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

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700"
        >
          <h1 className="text-lg font-bold">来店履歴を読み込めませんでした</h1>
          <p className="mt-2 text-sm">{loadError}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"
            >
              再試行
            </button>
            <Link href="/visits" className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm">
              来店履歴一覧へ戻る
            </Link>
          </div>
        </div>
      </div>
    );
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
            {existingPhotos.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-gray-500">
                写真はありません。
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {existingPhotos.map((photo) =>
                  photo.image_url ? (
                    <div key={photo.id} className="rounded-xl border p-2">
                      <a
                        href={photo.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative block h-32"
                      >
                        <VisitEditPhoto
                          src={photo.image_url}
                          alt="visit photo"
                        />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeExistingPhoto(photo.id)}
                        className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
                      >
                        この写真を外す
                      </button>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">写真を追加</label>
            <input
              type="file"
              accept={VISIT_PHOTO_ACCEPT}
              multiple
              onChange={handleFilesChange}
              className="block w-full text-sm"
            />

            {newPreviews.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {newPreviews.map((preview, index) => (
                  <div key={`${preview}-${index}`} className="rounded-xl border p-2">
                    <div className="relative h-32">
                      <VisitEditPhoto
                      src={preview}
                      alt="new preview"
                        unoptimized
                      />
                    </div>
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
