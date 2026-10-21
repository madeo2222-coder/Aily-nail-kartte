"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ReservationReferencePhoto from "../../ReservationReferencePhoto";
import { isCancelledReservationStatus } from "@/lib/reservation-status";
import {
  getConfirmationLineRetryLock,
  readConfirmationLineRetryLock,
  saveConfirmationLineRetryLock,
} from "@/lib/reservation-confirmation-line-retry";
import type {
  ConfirmationLineApiResult,
  ConfirmationLineRetryLock,
} from "@/lib/reservation-confirmation-line-retry";

type Salon = {
  id: string;
  name: string | null;
};

type Customer = {
  id: string;
  name: string | null;
  salon_id: string | null;
};

type Staff = {
  id: string;
  name: string | null;
  salon_id: string | null;
};

type ReservationDetail = {
  id: string;
  salon_id: string | null;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  memo: string | null;
};

type GalleryReference = {
  hasGallery: boolean;
  designId: string;
  photoUrl: string;
  menuName: string;
  color: string;
};

type ReservationStatus =
  | "予約"
  | "confirmed"
  | "来店"
  | "完了"
  | "キャンセル";

type CancellationReason =
  | "overlap"
  | "customer_request"
  | "salon_convenience"
  | "other";

type CancellationResult = {
  ok?: boolean;
  cancelled?: boolean;
  alreadyCancelled?: boolean;
  error?: string;
  line?: {
    status?: "sent" | "skipped" | "not_linked" | "failed";
    message?: string;
  };
};

type AlternativeRequestResult = {
  ok?: boolean;
  sent?: boolean;
  alreadySent?: boolean;
  error?: string;
  message?: string;
};

const STATUS_OPTIONS: { value: ReservationStatus; label: string }[] = [
  { value: "予約", label: "予約申請中" },
  { value: "confirmed", label: "予約確定" },
  { value: "来店", label: "来店" },
  { value: "完了", label: "完了" },
  { value: "キャンセル", label: "キャンセル" },
];

function normalizeSupabaseDateTime(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const isoLike = trimmed.includes("T")
    ? trimmed
    : trimmed.replace(" ", "T");

  return `${isoLike}Z`;
}

function getJstParts(value: string | null) {
  const normalizedValue = normalizeSupabaseDateTime(value);

  if (!normalizedValue) return null;

  const target = new Date(normalizedValue);

  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(target);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: map.get("year") || "",
    month: map.get("month") || "",
    day: map.get("day") || "",
    hour: map.get("hour") || "",
    minute: map.get("minute") || "",
  };
}

function extractDate(value: string | null) {
  const parts = getJstParts(value);

  if (!parts) return "";

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function extractTime(value: string | null) {
  const parts = getJstParts(value);

  if (!parts) return "";

  return `${parts.hour}:${parts.minute}`;
}

function buildDateTime(targetDate: string, targetTime: string) {
  if (!targetDate || !targetTime) return null;

  const date = new Date(`${targetDate}T${targetTime}:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeStatus(value: string | null): ReservationStatus {
  if (!value) return "予約";

  if (isCancelledReservationStatus(value)) return "キャンセル";
  if (value === "pending") return "予約";
  if (value === "requested") return "予約";
  if (value === "confirmed") return "confirmed";
  if (value === "completed") return "完了";

  if (value === "予約受付") return "予約";
  if (value === "予約申請中") return "予約";
  if (value === "予約確定") return "confirmed";
  if (value === "来店予定") return "来店";
  if (value === "完了待ち") return "来店";

  if (
    value === "予約" ||
    value === "来店" ||
    value === "完了" ||
    value === "キャンセル"
  ) {
    return value;
  }

  return "予約";
}

function getStatusLabel(value: ReservationStatus) {
  if (value === "confirmed") return "予約確定";
  if (value === "予約") return "予約申請中";
  return value;
}

function extractLineValue(memo: string, label: string) {
  const line = memo
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith(label));

  if (!line) return "";

  return line.replace(label, "").trim();
}

function extractGalleryReference(memo: string): GalleryReference {
  return {
    hasGallery: memo.includes("Aily Gallery参考デザインあり"),
    designId: extractLineValue(memo, "参考デザインID："),
    photoUrl: extractLineValue(memo, "参考写真URL："),
    menuName: extractLineValue(memo, "参考メニュー："),
    color: extractLineValue(memo, "参考カラー："),
  };
}

function removeGalleryReferenceLines(memo: string) {
  if (!memo) return "";

  return memo
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();

      if (trimmed === "Aily Gallery参考デザインあり") return false;
      if (trimmed.startsWith("参考デザインID：")) return false;
      if (trimmed.startsWith("参考写真URL：")) return false;
      if (trimmed.startsWith("参考メニュー：")) return false;
      if (trimmed.startsWith("参考カラー：")) return false;

      return true;
    })
    .join("\n")
    .trim();
}

function buildMemoForSave(galleryReference: GalleryReference, displayMemo: string) {
  const galleryLines = galleryReference.hasGallery
    ? [
        "Aily Gallery参考デザインあり",
        galleryReference.designId
          ? `参考デザインID：${galleryReference.designId}`
          : "",
        galleryReference.photoUrl ? `参考写真URL：${galleryReference.photoUrl}` : "",
        galleryReference.menuName &&
        !/^\d+$/.test(galleryReference.menuName.trim())
          ? `参考メニュー：${galleryReference.menuName}`
          : "",
        galleryReference.color ? `参考カラー：${galleryReference.color}` : "",
      ].filter(Boolean)
    : [];

  return [...galleryLines, displayMemo.trim()].filter(Boolean).join("\n");
}

function getExternalBlockLabel(menu: string, memo: string) {
  const checkText = `${menu}\n${memo}`;

  if (checkText.includes("ホットペッパー") || checkText.includes("HPB")) {
    return "ホットペッパー予約";
  }

  if (checkText.includes("ミニモ")) {
    return "ミニモ予約";
  }

  if (checkText.includes("電話")) {
    return "電話予約";
  }

  if (checkText.includes("Instagram") || checkText.includes("インスタ")) {
    return "Instagram予約";
  }

  if (checkText.includes("LINE") || checkText.includes("ライン")) {
    return "LINE予約";
  }

  if (checkText.includes("休憩")) {
    return "休憩";
  }

  if (checkText.includes("店休日")) {
    return "店休日";
  }

  if (checkText.includes("ブロック")) {
    return "外部予約ブロック";
  }

  return "";
}

function getDurationLabel(date: string, startTime: string, endTime: string) {
  const startAt = buildDateTime(date, startTime);
  const endAt = buildDateTime(date, endTime);

  if (!startAt || !endAt) return "未設定";

  const diffMinutes = Math.round(
    (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000
  );

  if (!Number.isFinite(diffMinutes) || diffMinutes <= 0) return "未設定";

  const hour = Math.floor(diffMinutes / 60);
  const minute = diffMinutes % 60;

  if (hour <= 0) return `${minute}分`;
  if (minute === 0) return `${hour}時間`;

  return `${hour}時間${minute}分`;
}

export default function EditReservationPage() {
  const router = useRouter();
  const params = useParams();

  const reservationId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [pageDataLoaded, setPageDataLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [requestingAlternative, setRequestingAlternative] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [mutationResultUnknown, setMutationResultUnknown] = useState(false);
  const [confirmationLineRetryLock, setConfirmationLineRetryLock] =
    useState<ConfirmationLineRetryLock | null>(null);

  const [salons, setSalons] = useState<Salon[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allStaffs, setAllStaffs] = useState<Staff[]>([]);

  const [salonId, setSalonId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [menu, setMenu] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState<ReservationStatus>("予約");
  const [wasInitiallyConfirmed, setWasInitiallyConfirmed] = useState(false);
  const [wasInitiallyCancelled, setWasInitiallyCancelled] = useState(false);
  const [sendCancellationLine, setSendCancellationLine] = useState(false);
  const [cancellationReason, setCancellationReason] =
    useState<CancellationReason>("overlap");
  const [cancellationReasonText, setCancellationReasonText] = useState("");
  const [memo, setMemo] = useState("");
  const [galleryReference, setGalleryReference] = useState<GalleryReference>({
    hasGallery: false,
    designId: "",
    photoUrl: "",
    menuName: "",
    color: "",
  });
  const mutationRequestPendingRef = useRef(false);

  async function loadPageData() {
    if (!reservationId) {
      setErrorMessage("予約IDが取得できませんでした");
      setLoading(false);
      return;
    }

    setLoading(true);
    setPageDataLoaded(false);
    setErrorMessage("");
    setSuccessMessage("");

    let response: Response;

    try {
      response = await fetch(`/api/reservations/${reservationId}/staff-edit`, {
        cache: "no-store",
      });
    } catch {
      setErrorMessage("予約情報の取得に失敗しました");
      setLoading(false);
      return;
    }

    const result = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      reservation?: ReservationDetail;
      salons?: Salon[];
      customers?: Customer[];
      staffs?: Staff[];
    } | null;

    if (!response.ok || !result?.ok || !result.reservation) {
      setErrorMessage(result?.error || "予約情報の取得に失敗しました");
      setLoading(false);
      return;
    }

    const reservation = result.reservation;
    const rawMemo = reservation.memo ?? "";
    const nextGalleryReference = extractGalleryReference(rawMemo);

    setSalons(result.salons ?? []);
    setAllCustomers(result.customers ?? []);
    setAllStaffs(result.staffs ?? []);

    setSalonId(reservation.salon_id ?? "");
    setCustomerId(reservation.customer_id ?? "");
    setStaffId(reservation.staff_id ?? "");
    setMenu(reservation.menu ?? "");
    setDate(extractDate(reservation.start_at));
    setStartTime(extractTime(reservation.start_at));
    setEndTime(extractTime(reservation.end_at));
    const normalizedStatus = normalizeStatus(reservation.status);
    setStatus(normalizedStatus);
    setWasInitiallyConfirmed(normalizedStatus === "confirmed");
    setWasInitiallyCancelled(
      isCancelledReservationStatus(reservation.status)
    );
    setGalleryReference(nextGalleryReference);
    setMemo(removeGalleryReferenceLines(rawMemo));

    setMutationResultUnknown(false);
    setPageDataLoaded(true);
    setLoading(false);
  }

  useEffect(() => {
    setConfirmationLineRetryLock(
      reservationId
        ? readConfirmationLineRetryLock(window.localStorage, reservationId)
        : null
    );
    loadPageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  const filteredCustomers = allCustomers;

  const filteredStaffs = useMemo(() => {
    return allStaffs.filter((item) =>
      salonId ? item.salon_id === salonId : true
    );
  }, [allStaffs, salonId]);

  const externalBlockLabel = useMemo(() => {
    return getExternalBlockLabel(menu, memo);
  }, [menu, memo]);

  const isExternalBlock = Boolean(externalBlockLabel) && !customerId;

  const durationLabel = useMemo(() => {
    return getDurationLabel(date, startTime, endTime);
  }, [date, startTime, endTime]);

  function handleSalonChange(nextSalonId: string) {
    setSalonId(nextSalonId);
  }

  function validateRequiredFields() {
    if (!salonId || !staffId || !date || !startTime || !endTime) {
      setErrorMessage("必要項目を入力してください");
      return null;
    }

    if (!isExternalBlock && !customerId) {
      setErrorMessage("顧客を選択してください");
      return null;
    }

    const startAt = buildDateTime(date, startTime);
    const endAt = buildDateTime(date, endTime);

    if (!startAt || !endAt || startAt >= endAt) {
      setErrorMessage("日時を正しく入力してください");
      return null;
    }

    return { startAt, endAt };
  }

  async function handleConfirmReservation() {
    if (!reservationId || mutationRequestPendingRef.current) return;

    const confirmed = window.confirm("この予約を『予約確定』にしますか？");
    if (!confirmed) return;

    const dateTime = validateRequiredFields();
    if (!dateTime) return;

    mutationRequestPendingRef.current = true;
    setConfirming(true);
    setErrorMessage("");
    setSuccessMessage("");

  try {
    const confirmationResponse = await fetch(
      `/api/reservations/${reservationId}/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: isExternalBlock ? null : customerId,
          staffId,
          menu: menu || null,
          startAt: dateTime.startAt,
          endAt: dateTime.endAt,
          memo: buildMemoForSave(galleryReference, memo) || null,
        }),
      }
    );
    const confirmation = (await confirmationResponse.json().catch(() => null)) as {
      ok?: boolean;
      confirmed?: boolean;
      alreadyConfirmed?: boolean;
      error?: string;
      message?: string;
    } | null;

    if (!confirmation) {
      setMutationResultUnknown(true);
      setErrorMessage("");
      return;
    }

    if (!confirmationResponse.ok || !confirmation?.ok) {
      setErrorMessage(confirmation?.error || "予約確定に失敗しました");
      return;
    }

    let lineNoticeMessage = "";

    if (confirmation.confirmed || confirmation.alreadyConfirmed) {
      try {
        const lineRes = await fetch("/api/send-reservation-confirmed-line", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reservationId,
          }),
        });

        const lineData = (await lineRes.json().catch(
          () => null
        )) as ConfirmationLineApiResult | null;
        const retryLock = getConfirmationLineRetryLock(lineData);
        saveConfirmationLineRetryLock(
          window.localStorage,
          reservationId,
          retryLock
        );
        setConfirmationLineRetryLock(retryLock);

        if (!lineRes.ok || lineData?.error) {
          lineNoticeMessage = ` LINE通知：${
            lineData?.error ||
            retryLock?.message ||
            "送信結果を確認できませんでした。"
          }`;
        } else if (lineData?.sent) {
          lineNoticeMessage = " 顧客へLINE通知も送信しました。";
        } else if (lineData?.message) {
          lineNoticeMessage = ` LINE通知：${lineData.message}`;
        } else {
          lineNoticeMessage = " LINE通知は送信されませんでした。";
        }
      } catch (lineError) {
        console.error("予約確定LINE通知エラー:", lineError);
        const retryLock = getConfirmationLineRetryLock(null);
        saveConfirmationLineRetryLock(
          window.localStorage,
          reservationId,
          retryLock
        );
        setConfirmationLineRetryLock(retryLock);
        lineNoticeMessage = ` LINE通知：${
          retryLock?.message || "送信結果を確認できませんでした。"
        }`;
      }
    } else {
      lineNoticeMessage = ` ${
        confirmation.message ||
        "予約確定の結果を確認できませんでした。"
      }`;
    }

    setStatus("confirmed");
    setWasInitiallyConfirmed(true);
    setSuccessMessage(
      `予約確定に変更しました。顧客マイページにも反映されます。${lineNoticeMessage}`
    );
  } catch (error) {
    console.error("予約確定結果の確認エラー:", error);
    setMutationResultUnknown(true);
    setErrorMessage("");
  } finally {
    mutationRequestPendingRef.current = false;
    setConfirming(false);
  }
  }

  async function retryConfirmationLine() {
    if (!reservationId || mutationRequestPendingRef.current) return;

    const confirmed = window.confirm(
      "予約確定LINEを再試行しますか？送信済みの場合は重複送信しません。"
    );
    if (!confirmed) return;

    mutationRequestPendingRef.current = true;
    setConfirming(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/send-reservation-confirmed-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });
      const result = (await response.json().catch(
        () => null
      )) as ConfirmationLineApiResult | null;
      const retryLock = getConfirmationLineRetryLock(result);
      saveConfirmationLineRetryLock(
        window.localStorage,
        reservationId,
        retryLock
      );
      setConfirmationLineRetryLock(retryLock);

      if (!result) {
        setErrorMessage("");
        return;
      }

      if (!response.ok || !result.ok) {
        setErrorMessage(result.error || "予約確定LINEの再試行に失敗しました。");
        return;
      }

      setSuccessMessage(
        result.alreadySent
          ? result.message || "予約確定LINEは送信済みです。重複送信していません。"
          : result.message || "予約確定LINEを送信しました。"
      );
    } catch (error) {
      console.error("予約確定LINE再試行結果の確認エラー:", error);
      const retryLock = getConfirmationLineRetryLock(null);
      saveConfirmationLineRetryLock(
        window.localStorage,
        reservationId,
        retryLock
      );
      setConfirmationLineRetryLock(retryLock);
      setErrorMessage("");
    } finally {
      mutationRequestPendingRef.current = false;
      setConfirming(false);
    }
  }

  async function requestAlternativeTime() {
    if (!reservationId || mutationRequestPendingRef.current) return;

    const confirmed = window.confirm(
      "この日時では予約確定できないことをLINEで知らせ、別の希望日時の入力を依頼しますか？"
    );

    if (!confirmed) return;

    mutationRequestPendingRef.current = true;
    setRequestingAlternative(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        `/api/reservations/${reservationId}/request-alternative`,
        { method: "POST" }
      );
      const result = (await response.json().catch(() => null)) as
        | AlternativeRequestResult
        | null;

      if (!result) {
        setMutationResultUnknown(true);
        setErrorMessage("");
        return;
      }

      if (!response.ok || !result.ok) {
        setErrorMessage(
          result.error || "別日時入力のLINE送信に失敗しました"
        );
        return;
      }

      setSuccessMessage(
        result.message ||
          (result.alreadySent
            ? "別日時入力のLINEは送信済みです。"
            : "別日時入力のLINEを送信しました。")
      );
    } catch (error) {
      console.error("別日時LINE依頼結果の確認エラー:", error);
      setMutationResultUnknown(true);
      setErrorMessage("");
    } finally {
      mutationRequestPendingRef.current = false;
      setRequestingAlternative(false);
    }
  }

  async function cancelReservation() {
    if (!reservationId || mutationRequestPendingRef.current) return;

    if (cancellationReason === "other" && !cancellationReasonText.trim()) {
      setErrorMessage("キャンセル理由を入力してください");
      return;
    }

    const lineConfirmation = sendCancellationLine
      ? "顧客へのキャンセルLINE送信を試みます。"
      : "顧客へキャンセルLINEは送信しません。";
    const confirmed = window.confirm(
      `この予約をキャンセルしますか？\n${lineConfirmation}`
    );

    if (!confirmed) return;

    mutationRequestPendingRef.current = true;
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(`/api/reservations/${reservationId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sendLine: sendCancellationLine,
          reason: cancellationReason,
          reasonText: cancellationReasonText,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | CancellationResult
        | null;

      if (!result) {
        setMutationResultUnknown(true);
        setErrorMessage("");
        return;
      }

      if (!response.ok || !result.ok) {
        setErrorMessage(result.error || "予約のキャンセルに失敗しました");
        return;
      }

      setStatus("キャンセル");
      setWasInitiallyCancelled(true);
      setSuccessMessage(
        result.line?.message ||
          (result.alreadyCancelled
            ? "予約は既にキャンセル済みです。LINEは再送していません。"
            : "予約をキャンセルしました。")
      );
    } catch (error) {
      console.error("予約キャンセル結果の確認エラー:", error);
      setMutationResultUnknown(true);
      setErrorMessage("");
    } finally {
      mutationRequestPendingRef.current = false;
      setSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!reservationId || mutationRequestPendingRef.current) return;

    if (status === "confirmed" && !wasInitiallyConfirmed) {
      await handleConfirmReservation();
      return;
    }

    if (
      isCancelledReservationStatus(status) &&
      !isExternalBlock &&
      !wasInitiallyCancelled
    ) {
      await cancelReservation();
      return;
    }

    const dateTime = validateRequiredFields();
    if (!dateTime) return;

    const memoForSave = buildMemoForSave(galleryReference, memo);

    mutationRequestPendingRef.current = true;
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        `/api/reservations/${reservationId}/staff-edit`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            salonId,
            customerId: isExternalBlock ? null : customerId,
            staffId,
            menu,
            startAt: dateTime.startAt,
            endAt: dateTime.endAt,
            status,
            memo: memoForSave || null,
          }),
        }
      );
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!result) {
        setMutationResultUnknown(true);
        setErrorMessage("");
        return;
      }

      if (!response.ok || !result.ok) {
        setErrorMessage(result.error || "予約の更新に失敗しました");
        return;
      }

      router.push(isExternalBlock ? "/reservations/calendar" : customerId ? `/customers/${customerId}` : "/reservations");
    } catch (error) {
      console.error("予約更新結果の確認エラー:", error);
      setMutationResultUnknown(true);
      setErrorMessage("");
    } finally {
      mutationRequestPendingRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!reservationId || mutationRequestPendingRef.current) return;

    const confirmed = window.confirm("この予約を削除しますか？");
    if (!confirmed) return;

    mutationRequestPendingRef.current = true;
    setDeleting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        `/api/reservations/${reservationId}/staff-edit`,
        { method: "DELETE" }
      );
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!result) {
        setMutationResultUnknown(true);
        setErrorMessage("");
        return;
      }

      if (!response.ok || !result.ok) {
        setErrorMessage(result.error || "予約の削除に失敗しました");
        return;
      }

      router.push(isExternalBlock ? "/reservations/calendar" : customerId ? `/customers/${customerId}` : "/reservations");
    } catch (error) {
      console.error("予約削除結果の確認エラー:", error);
      setMutationResultUnknown(true);
      setErrorMessage("");
    } finally {
      mutationRequestPendingRef.current = false;
      setDeleting(false);
    }
  }

  const backHref = isExternalBlock
    ? "/reservations/calendar"
    : customerId
    ? `/customers/${customerId}`
    : "/reservations";
  const isAlreadyConfirmed = status === "confirmed";
  const isMutating = saving || deleting || confirming || requestingAlternative;
  const mutationControlsDisabled = isMutating || mutationResultUnknown;

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 sm:p-6">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">
                {isExternalBlock ? "外部予約ブロック編集" : "予約編集ページ"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                {isExternalBlock
                  ? "HPB・ミニモ・休憩・店休日などのブロックを変更できます。"
                  : "ご予約内容の変更・削除・予約確定ができるページです。"}
              </p>
            </div>

            <Link
              href={backHref}
              className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600"
            >
              戻る
            </Link>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
            読み込み中...
          </section>
        ) : !pageDataLoaded ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {errorMessage || "予約情報の取得に失敗しました"}
            </div>
            <button
              type="button"
              onClick={loadPageData}
              className="mt-4 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white"
            >
              再試行
            </button>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            aria-busy={isMutating}
            className="space-y-4 rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm sm:p-6"
          >
            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
                {successMessage}
              </div>
            ) : null}

            {mutationResultUnknown ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                <p>
                  通信が途切れたため、予約操作の結果を確認できませんでした。同じ操作を繰り返さず、最新情報を再読み込みしてください。
                </p>
                <button
                  type="button"
                  onClick={() => void loadPageData()}
                  className="mt-3 w-full rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm font-bold text-amber-900"
                >
                  最新情報を再読み込み
                </button>
              </div>
            ) : null}

            <section className="rounded-[28px] border border-blue-100 bg-blue-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-bold text-blue-800">
                    現在の予約状態
                  </div>
                  <div className="mt-1 text-2xl font-black text-blue-900">
                    {getStatusLabel(status)}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-blue-700">
                    {isExternalBlock
                      ? `${externalBlockLabel}です。所要時間：${durationLabel}`
                      : "予約確定にすると、顧客マイページにも「予約確定」と表示されます。"}
                  </div>
                </div>

                {!isAlreadyConfirmed && status !== "キャンセル" ? (
                  <button
                    type="button"
                    onClick={handleConfirmReservation}
                    disabled={mutationControlsDisabled}
                    className="rounded-2xl bg-blue-600 px-5 py-4 text-sm font-bold text-white shadow-sm disabled:opacity-60"
                  >
                    {confirming ? "確定中..." : "予約確定にする"}
                  </button>
                ) : isAlreadyConfirmed ? (
                  <div className="flex flex-col items-stretch gap-2 sm:items-end">
                    <div className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-blue-700">
                      予約確定済み
                    </div>
                    {!isExternalBlock && !confirmationLineRetryLock ? (
                      <button
                        type="button"
                        onClick={retryConfirmationLine}
                        disabled={mutationControlsDisabled}
                        className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-blue-700 disabled:opacity-60"
                      >
                        {confirming ? "送信中..." : "確定LINEを再試行"}
                      </button>
                    ) : confirmationLineRetryLock ? (
                      <div
                        className={`max-w-sm rounded-2xl border px-4 py-3 text-xs font-bold leading-5 ${
                          confirmationLineRetryLock.kind === "sent"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                        }`}
                      >
                        {confirmationLineRetryLock.message}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-blue-700">
                    キャンセル中の予約です
                  </div>
                )}
              </div>
            </section>

            {status === "予約" && !isExternalBlock && customerId ? (
              <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-bold text-amber-900">
                      この日時では確定できない場合
                    </div>
                    <p className="mt-1 text-xs leading-5 text-amber-800">
                      LINE連携済みのお客様へお知らせし、この予約の別希望日時入力ページへ案内します。送信済みの場合は重複送信しません。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={requestAlternativeTime}
                    disabled={mutationControlsDisabled}
                    className="shrink-0 rounded-2xl bg-amber-600 px-5 py-4 text-sm font-bold text-white shadow-sm disabled:opacity-60"
                  >
                    {requestingAlternative
                      ? "LINE送信中..."
                      : "別日時をLINEで依頼"}
                  </button>
                </div>
              </section>
            ) : null}

            {galleryReference.hasGallery ? (
              <section className="rounded-[28px] border border-pink-100 bg-pink-50 p-4">
                <div className="text-sm font-bold text-pink-700">
                  Aily Gallery参考デザイン
                </div>

                {galleryReference.photoUrl ? (
                  <a
                    href={galleryReference.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="relative mt-3 block h-72 overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-sm"
                  >
                    <ReservationReferencePhoto
                      src={galleryReference.photoUrl}
                      sizes="(max-width: 768px) calc(100vw - 64px), 768px"
                    />
                  </a>
                ) : (
                  <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">
                    参考写真URLが保存されていません。
                  </div>
                )}

                <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs font-bold leading-5 text-pink-800">
                  {galleryReference.designId ? (
                    <div>参考デザインID：{galleryReference.designId}</div>
                  ) : null}

                  {galleryReference.menuName &&
                  !/^\d+$/.test(galleryReference.menuName.trim()) ? (
                    <div>参考メニュー：{galleryReference.menuName}</div>
                  ) : null}

                  {galleryReference.color ? (
                    <div>参考カラー：{galleryReference.color}</div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  サロン
                </label>
                <select
                  value={salonId}
                  onChange={(e) => handleSalonChange(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                >
                  <option value="">選択してください</option>
                  {salons.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || "名称未設定"}
                    </option>
                  ))}
                </select>
              </div>

              {isExternalBlock ? (
                <section className="rounded-[28px] border border-purple-100 bg-purple-50 p-4">
                  <div className="text-sm font-bold text-purple-800">
                    外部予約ブロック
                  </div>
                  <div className="mt-1 text-2xl font-black text-purple-900">
                    {externalBlockLabel}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-purple-700">
                    顧客に紐づかないブロックとして保存します。HPB・ミニモ・休憩・店休日などの重複防止用です。
                  </div>
                </section>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    顧客
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  >
                    <option value="">選択してください</option>
                    {filteredCustomers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || "名前未登録"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  担当スタッフ
                </label>
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                >
                  <option value="">選択してください</option>
                  {filteredStaffs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || "名前未登録"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  メニュー
                </label>
                <input
                  value={menu}
                  onChange={(e) => setMenu(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    日付
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    開始時間
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    終了時間
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  状態
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ReservationStatus)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                >
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  「予約確定」はデータ上は confirmed として保存され、顧客マイページでは予約確定と表示されます。
                </p>
              </div>

              {status === "キャンセル" &&
              !isExternalBlock &&
              !wasInitiallyCancelled ? (
                <div className="space-y-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      キャンセル通知
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      キャンセル確定後、LINE連携済みのお客様へ通知します。未連携や送信失敗の場合も、予約のキャンセルは取り消されません。
                    </p>
                  </div>

                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={sendCancellationLine}
                      onChange={(e) => setSendCancellationLine(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-rose-300 text-rose-600"
                    />
                    <span>顧客へキャンセルLINEを送信する</span>
                  </label>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      キャンセル理由
                    </label>
                    <select
                      value={cancellationReason}
                      onChange={(e) =>
                        setCancellationReason(e.target.value as CancellationReason)
                      }
                      className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm"
                    >
                      <option value="overlap">予約枠の重複</option>
                      <option value="customer_request">お客様のご都合</option>
                      <option value="salon_convenience">店舗の都合</option>
                      <option value="other">その他</option>
                    </select>
                  </div>

                  {cancellationReason === "other" ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        理由の詳細
                      </label>
                      <input
                        type="text"
                        value={cancellationReasonText}
                        onChange={(e) => setCancellationReasonText(e.target.value)}
                        maxLength={200}
                        placeholder="キャンセル理由を入力してください"
                        className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  メモ
                </label>
                <textarea
                  rows={5}
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="スタッフ用メモ"
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                />
                {galleryReference.hasGallery ? (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    参考写真URLは上に画像表示しています。保存時には内部メモとして残ります。
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="submit"
                disabled={mutationControlsDisabled}
                className="rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? "更新中..." : "更新する"}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={mutationControlsDisabled}
                className="rounded-2xl border border-rose-200 bg-white py-4 text-sm font-bold text-rose-600 disabled:opacity-60"
              >
                {deleting ? "削除中..." : isExternalBlock ? "ブロックを削除する" : "削除する"}
              </button>

              <Link
                href={backHref}
                className="rounded-2xl border border-rose-200 bg-white py-4 text-center text-sm font-bold text-slate-700"
              >
                キャンセル
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
