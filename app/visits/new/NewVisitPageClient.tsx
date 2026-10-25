"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  VISIT_PHOTO_ACCEPT,
  createVisitPhotoPath,
  validateVisitPhotoFile,
  validateVisitPhotoMetadata,
} from "@/lib/visitPhotoStorage";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  salon_id?: string | null;
};

type Staff = {
  id: string;
  name: string;
  salon_id: string;
};

type RegistrationDataResponse = {
  ok: true;
  authenticationMode: "supabase" | "legacy";
  customers: Customer[];
  staffs: Staff[];
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
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KNOWN_VISIT_API_ERRORS = new Set([
  "スタッフ認証が必要です。",
  "この操作を行う権限がありません。",
  "入力内容を確認してください。",
  "顧客情報を確認できません。",
  "担当スタッフを確認できません。",
  "予約情報を確認できません。",
  "この予約は既に完了しています。",
  "この予約には既に来店履歴があります。",
  "支払い内容を確認してください。",
  "売上金額と支払い内訳合計を一致させてください。",
  "利用できるクーポン残高を確認してください。",
  "予約状態が変更されたため登録できませんでした。",
  "来店登録を開始できませんでした。",
  "来店登録に失敗しました。",
  "来店登録結果を確認できませんでした。",
]);
const KNOWN_RESERVATION_STATUS_API_ERRORS = new Set([
  "スタッフ認証が必要です。",
  "この操作を行う権限がありません。",
  "予約ステータスが正しくありません。",
  "予約内容を読み直してから更新してください。",
  "予約が見つかりません。",
  "予約内容が更新されています。最新の内容を読み込み直してください。",
  "現在の予約状態からは更新できません。最新の内容を確認してください。",
  "この予約には既に来店履歴があります。",
  "予約ステータスの更新に失敗しました。",
]);

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

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : NaN;
}

function isDiscountMethod(method: string) {
  return method.trim() === "割引";
}

function formatAmountPreview(value: string) {
  const amount = toSafeNumber(value);

  if (!Number.isFinite(amount)) {
    return "未入力";
  }

  return amount.toLocaleString("ja-JP");
}

function formatYen(value: number) {
  const amount = Number.isFinite(value) ? Math.round(value) : 0;
  const absoluteAmount = Math.abs(amount).toLocaleString("ja-JP");

  return amount < 0 ? `-¥${absoluteAmount}` : `¥${absoluteAmount}`;
}

function visitApiErrorMessage(status: number, value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    KNOWN_VISIT_API_ERRORS.has(value.error)
  ) {
    return value.error;
  }

  if (status === 401 || status === 403) {
    return "ログイン状態を確認して、もう一度お試しください。";
  }

  if (status === 409) {
    return "登録済みの内容やクーポン残高を確認してください。";
  }

  return "来店登録に失敗しました。入力内容を確認してください。";
}

function getCreatedVisitId(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("ok" in value) ||
    value.ok !== true ||
    !("visit" in value) ||
    typeof value.visit !== "object" ||
    value.visit === null ||
    !("id" in value.visit) ||
    typeof value.visit.id !== "string" ||
    !UUID_PATTERN.test(value.visit.id)
  ) {
    return null;
  }

  return value.visit.id;
}

function reservationStatusApiErrorMessage(status: number, value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    KNOWN_RESERVATION_STATUS_API_ERRORS.has(value.error)
  ) {
    return value.error;
  }

  if (status === 401 || status === 403) {
    return "ログイン状態を確認して、もう一度お試しください。";
  }

  return "予約状態を更新できませんでした。予約一覧を読み直してください。";
}

function getReservationStatusResult(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("ok" in value) ||
    value.ok !== true ||
    !("reservation" in value) ||
    typeof value.reservation !== "object" ||
    value.reservation === null ||
    !("status" in value.reservation) ||
    typeof value.reservation.status !== "string"
  ) {
    return null;
  }

  let existingVisitId: string | null = null;

  if ("existingVisit" in value && value.existingVisit !== undefined) {
    if (
      typeof value.existingVisit !== "object" ||
      value.existingVisit === null ||
      !("id" in value.existingVisit) ||
      typeof value.existingVisit.id !== "string" ||
      !UUID_PATTERN.test(value.existingVisit.id)
    ) {
      return null;
    }

    existingVisitId = value.existingVisit.id;
  }

  return {
    status: value.reservation.status,
    existingVisitId,
  };
}

function isCustomer(value: unknown): value is Customer {
  if (typeof value !== "object" || value === null) return false;

  const customer = value as Record<string, unknown>;

  return (
    typeof customer.id === "string" &&
    typeof customer.name === "string" &&
    (customer.phone === null || typeof customer.phone === "string") &&
    (customer.salon_id === undefined ||
      customer.salon_id === null ||
      typeof customer.salon_id === "string")
  );
}

function isStaff(value: unknown): value is Staff {
  if (typeof value !== "object" || value === null) return false;

  const staff = value as Record<string, unknown>;

  return (
    typeof staff.id === "string" &&
    typeof staff.name === "string" &&
    typeof staff.salon_id === "string"
  );
}

function parseRegistrationData(value: unknown): RegistrationDataResponse | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("ok" in value) ||
    value.ok !== true ||
    !("customers" in value) ||
    !Array.isArray(value.customers) ||
    !value.customers.every(isCustomer) ||
    !("staffs" in value) ||
    !Array.isArray(value.staffs) ||
    !value.staffs.every(isStaff) ||
    !("authenticationMode" in value) ||
    (value.authenticationMode !== "supabase" &&
      value.authenticationMode !== "legacy")
  ) {
    return null;
  }

  return {
    ok: true,
    authenticationMode: value.authenticationMode,
    customers: value.customers,
    staffs: value.staffs,
  };
}

export default function NewVisitPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const preselectedCustomerId = searchParams.get("customer_id") || "";
  const prefilledReservationId = searchParams.get("reservation_id") || "";
  const prefilledReservationStatus = searchParams.get("reservation_status");
  const prefilledVisitDate = searchParams.get("visit_date") || "";
  const prefilledMenuName = searchParams.get("menu_name") || "";
  const prefilledStaffName = searchParams.get("staff_name") || "";
  const prefilledMemo = searchParams.get("memo") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staffs, setStaffs] = useState<Staff[]>([]);
  const [authenticationMode, setAuthenticationMode] = useState<
    "supabase" | "legacy" | null
  >(null);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [customerLoadError, setCustomerLoadError] = useState("");
  const customerRequestVersionRef = useRef(0);

  const [customerId, setCustomerId] = useState("");
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
  const [staffId, setStaffId] = useState("");

  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    createPaymentLine("現金", ""),
  ]);

  const [visitPhotos, setVisitPhotos] = useState<PhotoPreview[]>([]);
  const photoPreviewUrls = useRef(new Set<string>());
  const [saving, setSaving] = useState(false);
  const [submissionLocked, setSubmissionLocked] = useState(false);
  const [message, setMessage] = useState("");
  const submissionLockRef = useRef(false);

  useEffect(() => {
    if (prefilledVisitDate) {
      setVisitDate(prefilledVisitDate);
    }

    if (prefilledMenuName) {
      setMenuName(prefilledMenuName);
    }

    if (prefilledStaffName) {
      setStaffName(prefilledStaffName);
    }

    if (prefilledMemo) {
      setMemo(prefilledMemo);
    }
  }, [
    prefilledVisitDate,
    prefilledMenuName,
    prefilledStaffName,
    prefilledMemo,
  ]);

  useEffect(() => {
    const urls = photoPreviewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const fetchCustomers = useCallback(async () => {
    const requestVersion = customerRequestVersionRef.current + 1;
    customerRequestVersionRef.current = requestVersion;
    setLoadingCustomers(true);
    setCustomerLoadError("");
    setMessage("");
    setCustomers([]);
    setStaffs([]);
    setAuthenticationMode(null);
    setCustomerId("");
    setStaffId("");

    try {
      const response = await fetch("/api/visits/registration-data", {
        cache: "no-store",
      });
      const responseBody: unknown = await response.json().catch(() => null);

      if (customerRequestVersionRef.current !== requestVersion) {
        return;
      }

      const registrationData = parseRegistrationData(responseBody);

      if (!response.ok || !registrationData) {
        setCustomerLoadError(
          "顧客一覧を取得できませんでした。来店登録はまだ行われていません。"
        );
        return;
      }

      const loadedCustomers = registrationData.customers;
      setCustomers(loadedCustomers);
      setStaffs(registrationData.staffs);
      setAuthenticationMode(registrationData.authenticationMode);
      setCustomerId(
        loadedCustomers.some(
          (customer) => customer.id === preselectedCustomerId
        )
          ? preselectedCustomerId
          : ""
      );
      setStaffId(
        registrationData.authenticationMode === "supabase"
          ? registrationData.staffs.find(
              (staff) => staff.name === prefilledStaffName
            )?.id || ""
          : ""
      );
    } catch (error) {
      if (customerRequestVersionRef.current !== requestVersion) {
        return;
      }

      console.error("customers取得エラー:", error);
      setCustomerLoadError(
        "顧客一覧を取得できませんでした。来店登録はまだ行われていません。"
      );
    } finally {
      if (customerRequestVersionRef.current === requestVersion) {
        setLoadingCustomers(false);
      }
    }
  }, [prefilledStaffName, preselectedCustomerId]);

  useEffect(() => {
    void fetchCustomers();

    return () => {
      customerRequestVersionRef.current += 1;
    };
  }, [fetchCustomers]);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === customerId) || null;
  }, [customers, customerId]);

  const resolvedSalonId = selectedCustomer?.salon_id || DEFAULT_SALON_ID;

  const selectedStaff = useMemo(() => {
    return staffs.find((staff) => staff.id === staffId) || null;
  }, [staffId, staffs]);

  const totalPrice = useMemo(() => {
    return toSafeNumber(price);
  }, [price]);

  const paymentTotal = useMemo(() => {
    return paymentLines.reduce((sum, line) => {
      const amount = toSafeNumber(line.amount);

      if (!Number.isFinite(amount)) {
        return sum;
      }

      return sum + amount;
    }, 0);
  }, [paymentLines]);

  const paymentDiff = useMemo(() => {
    if (!Number.isFinite(totalPrice)) {
      return NaN;
    }

    return totalPrice - paymentTotal;
  }, [totalPrice, paymentTotal]);

  function updatePaymentLine(
    lineId: string,
    key: "payment_method" | "amount",
    value: string
  ) {
    setPaymentLines((previous) =>
      previous.map((line) =>
        line.id === lineId ? { ...line, [key]: value } : line
      )
    );
  }

  function addPaymentLine() {
    setPaymentLines((previous) => [
      ...previous,
      createPaymentLine("現金", ""),
    ]);
  }

  function removePaymentLine(lineId: string) {
    setPaymentLines((previous) => {
      if (previous.length === 1) {
        return [createPaymentLine("現金", "")];
      }

      return previous.filter((line) => line.id !== lineId);
    });
  }

  function handlePriceChange(value: string) {
    setPrice(value);

    const total = toSafeNumber(value);

    setPaymentLines((previous) => {
      if (previous.length !== 1) {
        return previous;
      }

      return previous.map((line) => ({
        ...line,
        amount:
          Number.isFinite(total) && total >= 0 ? String(total) : line.amount,
      }));
    });
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);

    if (files.length === 0) {
      return;
    }

    const acceptedFiles: File[] = [];
    let rejectionMessage = "";
    for (const file of files) {
      try {
        validateVisitPhotoMetadata(file);
        acceptedFiles.push(file);
      } catch (error) {
        rejectionMessage = error instanceof Error ? error.message : "写真を選択できませんでした。";
      }
    }
    setMessage(rejectionMessage);

    const newPhotos = acceptedFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      photoPreviewUrls.current.add(previewUrl);
      return { id: createPhotoId(), file, previewUrl };
    });

    setVisitPhotos((previous) => [...previous, ...newPhotos]);
    e.target.value = "";
  }

  function removePhoto(photoId: string) {
    const target = visitPhotos.find((photo) => photo.id === photoId);
    if (target && photoPreviewUrls.current.delete(target.previewUrl)) {
      URL.revokeObjectURL(target.previewUrl);
    }

    setVisitPhotos((previous) => previous.filter((photo) => photo.id !== photoId));
  }

  async function uploadVisitPhotos({
    visitId,
    salonId,
  }: {
    visitId: string;
    salonId: string;
  }) {
    if (visitPhotos.length === 0) {
      return;
    }

    const uploadedPhotoRows = [];

    for (const photo of visitPhotos) {
      const validatedPhoto = await validateVisitPhotoFile(photo.file);
      const filePath = createVisitPhotoPath(visitId, validatedPhoto.extension);

      const { error: uploadError } = await supabase.storage
        .from(VISIT_PHOTO_BUCKET)
        .upload(filePath, validatedPhoto.file, {
          cacheControl: "3600",
          contentType: validatedPhoto.contentType,
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

    const response = await fetch(`/api/visits/${visitId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salonId,
        photos: uploadedPhotoRows.map((photo) => ({
          imageUrl: photo.image_url,
          photoType: photo.photo_type,
        })),
      }),
    });
    const responseBody: unknown = await response.json().catch(() => null);

    if (
      !response.ok ||
      typeof responseBody !== "object" ||
      responseBody === null ||
      !("ok" in responseBody) ||
      responseBody.ok !== true
    ) {
      throw new Error("写真情報の保存に失敗しました");
    }
  }

  async function updateReservationStatus({
    reservationId,
    status,
    expectedCustomerId,
    expectedStatus,
  }: {
    reservationId: string;
    status: "来店" | "完了";
    expectedCustomerId: string;
    expectedStatus: string;
  }) {
    const response = await fetch(`/api/reservations/${reservationId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, expectedCustomerId, expectedStatus }),
    });
    const responseBody: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        reservationStatusApiErrorMessage(response.status, responseBody)
      );
    }

    const statusResult = getReservationStatusResult(responseBody);
    if (!statusResult) {
      throw new Error(
        "予約状態の更新結果を確認できませんでした。予約一覧を読み直してください。"
      );
    }

    return statusResult;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (submissionLockRef.current || saving || submissionLocked) {
      return;
    }

    if (loadingCustomers || customerLoadError) {
      setMessage("顧客一覧を再取得してから登録してください");
      return;
    }

    if (!customerId) {
      setMessage("顧客を選択してください");
      return;
    }

    if (!selectedCustomer) {
      setMessage("有効な顧客を選択してください");
      return;
    }

    if (!authenticationMode) {
      setMessage("ログイン状態を確認して、顧客一覧を再取得してください");
      return;
    }

    if (
      authenticationMode === "supabase" &&
      !prefilledReservationId &&
      !selectedStaff
    ) {
      setMessage("担当スタッフを選択してください");
      return;
    }

    if (!visitDate) {
      setMessage("来店日を入力してください");
      return;
    }

    if (
      !price ||
      Number(price) < 0 ||
      !Number.isFinite(totalPrice) ||
      !Number.isSafeInteger(totalPrice)
    ) {
      setMessage("売上金額を正しく入力してください");
      return;
    }

    const cleanedPaymentLines = paymentLines
      .map((line, index) => ({
        payment_method: line.payment_method.trim(),
        amount: toSafeNumber(line.amount),
        sort_order: index + 1,
      }))
      .filter(
        (line) =>
          line.payment_method &&
          Number.isFinite(line.amount) &&
          line.amount !== 0
      );

    if (cleanedPaymentLines.length === 0) {
      setMessage("支払い内訳を1件以上入力してください");
      return;
    }

    if (
      cleanedPaymentLines.some((line) => !Number.isFinite(line.amount))
    ) {
      setMessage("支払い内訳の金額を正しく入力してください");
      return;
    }

    if (
      cleanedPaymentLines.some(
        (line) =>
          isDiscountMethod(line.payment_method) && line.amount > 0
      )
    ) {
      setMessage("割引はマイナス金額で入力してください");
      return;
    }

    if (
      cleanedPaymentLines.some(
        (line) =>
          !isDiscountMethod(line.payment_method) && line.amount < 0
      )
    ) {
      setMessage("割引以外の支払い方法はマイナスにできません");
      return;
    }

    if (paymentTotal !== totalPrice) {
      setMessage("売上金額と支払い内訳合計を一致させてください");
      return;
    }

    try {
      await Promise.all(visitPhotos.map((photo) => validateVisitPhotoFile(photo.file)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "写真を確認できませんでした。");
      return;
    }

    submissionLockRef.current = true;
    setSaving(true);
    let keepSubmissionLocked = false;
    let visitCommitted = false;

    try {
      const normalizedMenuName = menuName.trim() || null;
      let insertedVisitId: string | null = null;
      let reservationStatusForCompletion: string | null = null;

      if (authenticationMode === "supabase") {
        const response = await fetch("/api/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reservationId: prefilledReservationId || null,
            customerId,
            staffId: prefilledReservationId ? null : selectedStaff?.id || null,
            visitDate,
            menuName: normalizedMenuName,
            color: color.trim() || null,
            price: totalPrice,
            memo: memo.trim() || null,
            nextVisitDate: nextVisitDate || null,
            nextProposal: nextProposal.trim() || null,
            payments: cleanedPaymentLines.map((line) => ({
              method: line.payment_method,
              amount: line.amount,
            })),
          }),
        });
        const responseBody: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          setMessage(visitApiErrorMessage(response.status, responseBody));

          if (response.status >= 500) {
            keepSubmissionLocked = true;
            setMessage(
              "登録結果を確認できませんでした。再送信せず、管理者へ確認してください。"
            );
          }
          return;
        }

        const createdVisitId = getCreatedVisitId(responseBody);
        if (!createdVisitId) {
          keepSubmissionLocked = true;
          setMessage(
            "登録結果を確認できませんでした。再送信せず、管理者へ確認してください。"
          );
          return;
        }

        insertedVisitId = createdVisitId;
        visitCommitted = true;
        keepSubmissionLocked = true;
      } else {
        if (prefilledReservationId) {
          if (prefilledReservationStatus === null) {
            setMessage(
              "予約一覧を読み直してから来店登録してください。"
            );
            return;
          }

          const statusResult = await updateReservationStatus({
            reservationId: prefilledReservationId,
            status: "来店",
            expectedCustomerId: customerId,
            expectedStatus: prefilledReservationStatus,
          });
          reservationStatusForCompletion = statusResult.status;

          if (statusResult.existingVisitId) {
            insertedVisitId = statusResult.existingVisitId;
            visitCommitted = true;
            keepSubmissionLocked = true;
          }
        }

        if (!visitCommitted) {
          const mainPaymentMethod =
            cleanedPaymentLines.length === 1
              ? cleanedPaymentLines[0].payment_method
              : "複数";

          const visitPayload = {
            reservation_id: prefilledReservationId || null,
            customer_id: customerId,
            salon_id: resolvedSalonId,
            visit_date: visitDate,
            menu_name: normalizedMenuName,
            menu: normalizedMenuName,
            color: color.trim() || null,
            price: totalPrice,
            payment_method: mainPaymentMethod,
            payment_status: "paid",
            paid_amount: totalPrice,
            unpaid_amount: 0,
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

          if (
            visitError ||
            !insertedVisit ||
            !UUID_PATTERN.test(insertedVisit.id)
          ) {
            console.error("visits insert error:", visitError);
            setMessage(
              `来店履歴の登録に失敗しました: ${
                visitError?.message || "insert failed"
              }`
            );
            return;
          }

          insertedVisitId = insertedVisit.id;
          visitCommitted = true;
          keepSubmissionLocked = true;

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
                visit_id: insertedVisitId,
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
                visit_id: insertedVisitId,
                coupon_type: "coupon_500",
                action: "earned",
                amount: 500,
                note: "6回来店達成",
              });
            }
          }

          const visitPaymentsPayload = cleanedPaymentLines.map((line) => ({
            visit_id: insertedVisitId,
            payment_method: line.payment_method,
            amount: line.amount,
            sort_order: line.sort_order,
          }));

          const { error: paymentError } = await supabase
            .from("visit_payments")
            .insert(visitPaymentsPayload);

          if (paymentError) {
            throw new Error(
              `支払い内訳の登録に失敗しました: ${paymentError.message}`
            );
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
              visit_id: insertedVisitId,
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
              visit_id: insertedVisitId,
              coupon_type: "coupon_500",
              action: "used",
              amount: -500,
              note: "会計時利用",
            });
          }
        }
      }

      if (!insertedVisitId) {
        throw new Error("来店履歴の登録結果を確認できませんでした。");
      }

      await uploadVisitPhotos({
        visitId: insertedVisitId,
        salonId: resolvedSalonId,
      });

      if (authenticationMode === "legacy" && prefilledReservationId) {
        if (!reservationStatusForCompletion) {
          throw new Error(
            "予約状態を確認できませんでした。予約一覧を読み直してください。"
          );
        }

        await updateReservationStatus({
          reservationId: prefilledReservationId,
          status: "完了",
          expectedCustomerId: customerId,
          expectedStatus: reservationStatusForCompletion,
        });
      }

      alert("来店履歴を登録しました");
      router.push(`/customers/${customerId}`);
    } catch (error) {
      console.error("来店登録エラー:", error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : "来店履歴の登録に失敗しました";

      setMessage(
        visitCommitted
          ? `来店履歴は登録されましたが、後続処理に失敗しました。再送信しないでください。${errorMessage}`
          : errorMessage
      );
    } finally {
      if (keepSubmissionLocked) {
        setSubmissionLocked(true);
      } else {
        submissionLockRef.current = false;
      }
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

        {loadingCustomers ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-700">
              顧客一覧を読み込み中...
            </p>
          </section>
        ) : customerLoadError ? (
          <section
            role="alert"
            className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 shadow-sm"
          >
            <h2 className="text-lg font-bold text-amber-900">
              顧客一覧を確認できません
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              {customerLoadError}
            </p>
            <button
              type="button"
              onClick={() => void fetchCustomers()}
              className="mt-4 rounded-2xl bg-amber-900 px-4 py-3 text-sm font-bold text-white"
            >
              再試行
            </button>
          </section>
        ) : customers.length === 0 ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">
              登録可能な顧客がいません
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              来店履歴を登録する前に顧客を追加してください。
            </p>
            <Link
              href="/customers/new"
              className="mt-4 inline-block rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white"
            >
              顧客を追加
            </Link>
          </section>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              顧客情報
            </h2>

            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={Boolean(prefilledReservationId)}
              className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              <option value="">
                顧客を選択してください
              </option>

              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                  {customer.phone ? ` / ${customer.phone}` : ""}
                </option>
              ))}
            </select>

            {prefilledReservationId ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                予約に登録された顧客へ来店履歴を保存します。顧客を変更する場合は、先に予約内容を修正してください。
              </p>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              来店情報
            </h2>

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
                min="0"
                value={price}
                onChange={(e) => handlePriceChange(e.target.value)}
                placeholder="売上金額"
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
              />

              {authenticationMode === "supabase" && !prefilledReservationId ? (
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                >
                  <option value="">担当スタッフを選択してください</option>
                  {staffs.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="担当者"
                  readOnly={
                    authenticationMode === "supabase" &&
                    Boolean(prefilledReservationId)
                  }
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm read-only:text-slate-500"
                />
              )}

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
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              支払い内訳
            </h2>

            <div className="space-y-3">
              {paymentLines.map((line) => {
                const isDiscount = isDiscountMethod(line.payment_method);

                return (
                  <div
                    key={line.id}
                    className="rounded-[28px] border border-rose-100 bg-white p-3"
                  >
                    <select
                      value={line.payment_method}
                      onChange={(e) =>
                        updatePaymentLine(
                          line.id,
                          "payment_method",
                          e.target.value
                        )
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
                        updatePaymentLine(
                          line.id,
                          "amount",
                          e.target.value
                        )
                      }
                      placeholder={isDiscount ? "例: -1000" : "例: 5000"}
                      className="mt-3 w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-3 text-sm"
                    />

                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>
                        入力値: {formatAmountPreview(line.amount)}
                      </span>

                      <button
                        type="button"
                        onClick={() => removePaymentLine(line.id)}
                        className="font-bold text-rose-600"
                      >
                        この行を削除
                      </button>
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

            <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">売上金額</span>
                <span className="font-bold text-slate-900">
                  {formatYen(
                    Number.isFinite(totalPrice) ? totalPrice : 0
                  )}
                </span>
              </div>

              <div className="mt-2 flex justify-between gap-3">
                <span className="text-slate-500">支払い内訳合計</span>
                <span className="font-bold text-slate-900">
                  {formatYen(paymentTotal)}
                </span>
              </div>

              <div className="mt-2 flex justify-between gap-3">
                <span className="text-slate-500">差額</span>
                <span
                  className={`font-bold ${
                    paymentDiff === 0
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }`}
                >
                  {formatYen(
                    Number.isFinite(paymentDiff) ? paymentDiff : 0
                  )}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-lg font-bold text-slate-900">
              施術後写真
            </h2>

            <label className="block cursor-pointer rounded-[28px] border border-dashed border-rose-300 bg-rose-50/50 px-4 py-6 text-center">
              <input
                type="file"
                accept={VISIT_PHOTO_ACCEPT}
                multiple
                onChange={handlePhotoChange}
                className="hidden"
              />

              <div className="text-sm font-bold text-rose-600">
                写真を選択する
              </div>
            </label>

            {visitPhotos.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {visitPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-sm"
                  >
                    <div className="relative h-36 w-full">
                      <Image
                        src={photo.previewUrl}
                        alt="施術後写真プレビュー"
                        fill
                        sizes="(max-width: 640px) calc(50vw - 30px), 264px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>

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
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              次回提案
            </h2>

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
            disabled={saving || submissionLocked}
            className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving
              ? "登録中..."
              : submissionLocked
                ? "登録結果を確認してください"
                : "登録する"}
          </button>
        </form>
        )}

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
