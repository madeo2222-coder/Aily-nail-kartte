"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  salon_id?: string | null;
};

type PaymentLine = {
  id: string;
  payment_method: string;
  amount: string;
};

type PhotoPreview = {
  id: string;
  file: File;
  previewUrl: string;
};

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

const VISIT_PHOTO_BUCKET = "visit-photos";
const DEFAULT_SALON_ID = "e120ed90-fded-41b8-b3fe-f486e84f2418";

function createLineId() {
  return `payment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createPhotoId() {
  return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

function isDiscountMethod(method: string) {
  return method.trim() === "割引";
}

function formatAmountPreview(value: string) {
  const amount = toSafeNumber(value);
  if (!Number.isFinite(amount)) return "未入力";
  return `${amount.toLocaleString("ja-JP")}`;
}

function getFileExtension(fileName: string) {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? parts.pop() : "";
  return extension ? extension.toLowerCase() : "jpg";
}

export default function NewVisitPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const preselectedCustomerId = searchParams.get("customer_id") || "";
  const prefilledReservationId = searchParams.get("reservation_id") || "";
  const prefilledVisitDate = searchParams.get("visit_date") || "";
  const prefilledMenuName = searchParams.get("menu_name") || "";
  const prefilledStaffName = searchParams.get("staff_name") || "";
  const prefilledMemo = searchParams.get("memo") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  const [customerId, setCustomerId] = useState(preselectedCustomerId);
  const [visitDate, setVisitDate] = useState(
    prefilledVisitDate || new Date().toISOString().split("T")[0]
  );
  const [menuName, setMenuName] = useState(prefilledMenuName);
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [memo, setMemo] = useState(prefilledMemo);
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextProposal, setNextProposal] = useState("");
  const [staffName, setStaffName] = useState(prefilledStaffName);

  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    createPaymentLine("現金", ""),
  ]);

  const [visitPhotos, setVisitPhotos] = useState<PhotoPreview[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (preselectedCustomerId) setCustomerId(preselectedCustomerId);
    if (prefilledVisitDate) setVisitDate(prefilledVisitDate);
    if (prefilledMenuName) setMenuName(prefilledMenuName);
    if (prefilledStaffName) setStaffName(prefilledStaffName);
    if (prefilledMemo) setMemo(prefilledMemo);
  }, [
    preselectedCustomerId,
    prefilledVisitDate,
    prefilledMenuName,
    prefilledStaffName,
    prefilledMemo,
  ]);

  useEffect(() => {
    return () => {
      visitPhotos.forEach((photo) => {
        URL.revokeObjectURL(photo.previewUrl);
      });
    };
  }, [visitPhotos]);

  async function fetchCustomers() {
    setLoadingCustomers(true);

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, salon_id")
      .order("name", { ascending: true });

    if (error) {
      console.error("customers取得エラー:", error);
      setMessage("顧客一覧の取得に失敗しました");
      setLoadingCustomers(false);
      return;
    }

    setCustomers(data || []);
    setLoadingCustomers(false);
  }

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === customerId) || null;
  }, [customers, customerId]);

  const resolvedSalonId = selectedCustomer?.salon_id || DEFAULT_SALON_ID;

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

  function updatePaymentLine(
    lineId: string,
    key: "payment_method" | "amount",
    value: string
  ) {
    setPaymentLines((prev) =>
      prev.map((line) =>
        line.id === lineId ? { ...line, [key]: value } : line
      )
    );
  }

  function addPaymentLine() {
    setPaymentLines((prev) => [...prev, createPaymentLine("現金", "")]);
  }

  function removePaymentLine(lineId: string) {
    setPaymentLines((prev) => {
      if (prev.length === 1) return [createPaymentLine("現金", "")];
      return prev.filter((line) => line.id !== lineId);
    });
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length !== files.length) {
      setMessage("写真ファイルのみ選択できます");
    } else {
      setMessage("");
    }

    const newPhotos = imageFiles.map((file) => ({
      id: createPhotoId(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setVisitPhotos((prev) => [...prev, ...newPhotos]);
    e.target.value = "";
  }

  function removePhoto(photoId: string) {
    setVisitPhotos((prev) => {
      const target = prev.find((photo) => photo.id === photoId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((photo) => photo.id !== photoId);
    });
  }

  async function uploadVisitPhotos({
    visitId,
    salonId,
  }: {
    visitId: string;
    salonId: string;
  }) {
    if (visitPhotos.length === 0) return;

    const uploadedPhotoRows = [];

    for (const photo of visitPhotos) {
      const extension = getFileExtension(photo.file.name);
      const filePath = `${visitId}/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(VISIT_PHOTO_BUCKET)
        .upload(filePath, photo.file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`写真アップロード失敗: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from(VISIT_PHOTO_BUCKET)
        .getPublicUrl(filePath);

      if (!publicUrlData.publicUrl) {
        throw new Error("写真URLの取得に失敗しました");
      }

      uploadedPhotoRows.push({
        visit_id: visitId,
        salon_id: salonId,
        image_url: publicUrlData.publicUrl,
        photo_type: "after",
      });
    }

    const { error: photoInsertError } = await supabase
      .from("visit_photos")
      .insert(uploadedPhotoRows);

    if (photoInsertError) {
      throw new Error(`写真情報の保存に失敗しました: ${photoInsertError.message}`);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!customerId) {
      setMessage("顧客を選択してください");
      return;
    }

    if (!visitDate) {
      setMessage("来店日を入力してください");
      return;
    }

    if (!price || Number(price) < 0) {
      setMessage("売上金額を正しく入力してください");
      return;
    }

    if (!Number.isFinite(totalPrice)) {
      setMessage("売上金額を正しく入力してください");
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
      setMessage("支払い内訳を1件以上入力してください");
      return;
    }

    if (cleanedPaymentLines.some((line) => !Number.isFinite(line.amount))) {
      setMessage("支払い内訳の金額を正しく入力してください");
      return;
    }

    if (
      cleanedPaymentLines.some(
        (line) => isDiscountMethod(line.payment_method) && line.amount > 0
      )
    ) {
      setMessage("割引はマイナス金額で入力してください");
      return;
    }

    if (
      cleanedPaymentLines.some(
        (line) => !isDiscountMethod(line.payment_method) && line.amount < 0
      )
    ) {
      setMessage("割引以外の支払い方法はマイナスにできません");
      return;
    }

    if (paymentTotal !== totalPrice) {
      setMessage("売上金額と支払い内訳合計を一致させてください");
      return;
    }

    setSaving(true);

    try {
      const normalizedMenuName = menuName.trim() || null;

      const mainPaymentMethod =
        cleanedPaymentLines.length === 1
          ? cleanedPaymentLines[0].payment_method
          : "複数";

      const visitPayload = {
        customer_id: customerId,
        salon_id: resolvedSalonId,
        visit_date: visitDate,
        menu_name: normalizedMenuName,
        menu: normalizedMenuName,
        color: color.trim() || null,
        price: totalPrice,
        payment_method: mainPaymentMethod,
        memo: memo.trim() || null,
        next_visit_date: nextVisitDate || null,
        next_proposal: nextProposal.trim() || null,
        staff_name: staffName.trim() || null,
      };

      const { data: insertedVisit, error: visitError } = await supabase
        .from("visits")
        .insert([visitPayload])
        .select("id")
        .single();

      if (visitError || !insertedVisit) {
        console.error("visits insert error:", visitError);
        setMessage(
          `来店履歴の登録に失敗しました: ${
            visitError?.message || "insert failed"
          }`
        );
        setSaving(false);
        return;
      }
const { count: visitCount } = await supabase
  .from("visits")
  .select("*", {
    count: "exact",
    head: true,
  })
  .eq("customer_id", customerId);

if (visitCount) {
  if (visitCount % 12 === 0) {
    await supabase.rpc("increment_coupon_1000", {
      customer_id_input: customerId,
    });

    await supabase.from("coupon_histories").insert({
      customer_id: customerId,
      visit_id: insertedVisit.id,
      coupon_type: "coupon_1000",
      action: "earned",
      amount: 1000,
      note: "12回来店達成",
    });
  } else if (visitCount % 6 === 0) {
    await supabase.rpc("increment_coupon_500", {
      customer_id_input: customerId,
    });

    await supabase.from("coupon_histories").insert({
      customer_id: customerId,
      visit_id: insertedVisit.id,
      coupon_type: "coupon_500",
      action: "earned",
      amount: 500,
      note: "6回来店達成",
    });
  }
}
      const visitPaymentsPayload = cleanedPaymentLines.map((line) => ({
        visit_id: insertedVisit.id,
        payment_method: line.payment_method,
        amount: line.amount,
        sort_order: line.sort_order,
      }));

      const { error: paymentError } = await supabase
        .from("visit_payments")
        .insert(visitPaymentsPayload);

      if (paymentError) {
        console.error("visit_payments insert error:", paymentError);
        setMessage(`支払い内訳の登録に失敗しました: ${paymentError.message}`);
        setSaving(false);
        return;
      }
      const discountTotal = cleanedPaymentLines
        .filter((line) => isDiscountMethod(line.payment_method))
        .reduce((sum, line) => sum + Math.abs(line.amount), 0);

      if (discountTotal >= 1000) {
  await supabase.rpc("decrement_coupon_1000", {
    customer_id_input: customerId,
  });

  await supabase.from("coupon_histories").insert({
    customer_id: customerId,
    visit_id: insertedVisit.id,
    coupon_type: "coupon_1000",
    action: "used",
    amount: -1000,
    note: "会計時利用",
  });
} else if (discountTotal >= 500) {
  await supabase.rpc("decrement_coupon_500", {
    customer_id_input: customerId,
  });

  await supabase.from("coupon_histories").insert({
    customer_id: customerId,
    visit_id: insertedVisit.id,
    coupon_type: "coupon_500",
    action: "used",
    amount: -500,
    note: "会計時利用",
  });
}
      await uploadVisitPhotos({
        visitId: insertedVisit.id,
        salonId: resolvedSalonId,
      });

      if (prefilledReservationId) {
        const { error: reservationUpdateError } = await supabase
          .from("reservations")
          .update({ status: "完了" })
          .eq("id", prefilledReservationId);

        if (reservationUpdateError) {
          console.error("reservations update error:", reservationUpdateError);
          setMessage(
            `来店履歴と写真は登録できましたが、予約ステータス更新に失敗しました: ${reservationUpdateError.message}`
          );
          setSaving(false);
          return;
        }
      }

      alert("来店履歴を登録しました");
      router.push(`/customers/${customerId}`);
    } catch (error) {
      console.error("来店登録エラー:", error);
      const errorMessage =
        error instanceof Error ? error.message : "来店履歴の登録に失敗しました";
      setMessage(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-xl space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            NAILY AIDOL
          </p>
          <h1 className="mt-2 text-2xl font-bold">来店登録ページ</h1>
          <p className="mt-2 text-sm leading-6 text-white/90">
            来店内容、お会計、次回提案、施術後写真をまとめて登録できます。
          </p>
        </section>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">顧客情報</h2>

            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
            >
              <option value="">
                {loadingCustomers ? "読み込み中..." : "顧客を選択してください"}
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                  {customer.phone ? ` / ${customer.phone}` : ""}
                </option>
              ))}
            </select>
          </section>

          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">来店情報</h2>

            <div className="space-y-4">
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
              />

              <input
                type="text"
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
                placeholder="メニュー"
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
              />

              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="カラー"
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
              />

              <input
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="売上金額"
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
              />

              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="担当者"
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
              />

              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="メモ"
                rows={4}
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">支払い内訳</h2>

            <div className="space-y-3">
              {paymentLines.map((line) => {
                const isDiscount = isDiscountMethod(line.payment_method);

                return (
                  <div key={line.id} className="rounded-[28px] border border-rose-100 bg-white p-3">
                    <select
                      value={line.payment_method}
                      onChange={(e) =>
                        updatePaymentLine(line.id, "payment_method", e.target.value)
                      }
                      className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                    >
                      {PAYMENT_METHOD_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      inputMode="numeric"
                      value={line.amount}
                      onChange={(e) =>
                        updatePaymentLine(line.id, "amount", e.target.value)
                      }
                      placeholder={isDiscount ? "例: -1000" : "例: 5000"}
                      className="mt-3 w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                    />

                    <div className="mt-2 text-xs text-slate-500">
                      入力値: {formatAmountPreview(line.amount)}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addPaymentLine}
              className="mt-3 rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-600"
            >
              ＋行追加
            </button>
          </section>

          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-lg font-bold text-slate-900">施術後写真</h2>

            <label className="block cursor-pointer rounded-[28px] border border-dashed border-rose-300 bg-rose-50/50 px-4 py-6 text-center">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoChange}
                className="hidden"
              />
              <div className="text-sm font-bold text-rose-600">写真を選択する</div>
            </label>

            {visitPhotos.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {visitPhotos.map((photo) => (
                  <div key={photo.id} className="overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-sm">
                    <img
                      src={photo.previewUrl}
                      alt="施術後写真プレビュー"
                      className="h-36 w-full object-cover"
                    />
                    <div className="p-2">
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">次回提案</h2>

            <input
              type="date"
              value={nextVisitDate}
              onChange={(e) => setNextVisitDate(e.target.value)}
              className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
            />

            <textarea
              value={nextProposal}
              onChange={(e) => setNextProposal(e.target.value)}
              placeholder="次回提案"
              rows={3}
              className="mt-3 w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
            />
          </section>

          {message ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "登録中..." : "登録する"}
          </button>
        </form>

        <Link
          href="/visits"
          className="block rounded-2xl border border-rose-200 bg-white px-4 py-3 text-center text-sm font-bold text-rose-600"
        >
          来店ページへ
        </Link>
      </div>
    </main>
  );
}