"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getReservationStatusLabel } from "@/lib/reservation-status";
import {
  getCustomerReservationRequestLineLock,
  readCustomerReservationRequestRetry,
  readCustomerReservationRequestLineLock,
  saveCustomerReservationRequestRetry,
  saveCustomerReservationRequestLineLock,
  shouldKeepCustomerReservationRequestRetry,
  type CustomerReservationRequestAction,
  type CustomerReservationRequestLineLock,
  type CustomerReservationRequestRetry,
} from "@/lib/customer-reservation-request-line-retry";

type ReservationDetail = {
  id: string;
  customerId: string;
  menu: string;
  memo: string;
  status: string;
  staffId: string;
  staffName: string;
  salonId: string;
  source: string;
  startAt: string;
  endAt: string;
  requestRevision: string;
  externalReservation: boolean;
  canDirectEdit: boolean;
  canDirectCancel: boolean;
  canRequestChange: boolean;
  canRequestCancel: boolean;
};

type StaffRow = {
  id: string;
  name: string | null;
};

type DetailResponse = {
  ok: boolean;
  reservation?: ReservationDetail;
  error?: string;
};

type SessionResponse = {
  authenticated?: boolean;
};

type StaffResponse = {
  ok?: boolean;
  staffs?: StaffRow[];
  error?: string;
};

const timeOptions = [
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
];

function getTodayText() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function addDaysText(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function getJstInputParts(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: "",
      time: "",
    };
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  return {
    date: `${map.get("year")}-${map.get("month")}-${map.get("day")}`,
    time: `${map.get("hour")}:${map.get("minute")}`,
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getStatusLabel(status: string) {
  const label = getReservationStatusLabel(status, "未設定");
  return label === "完了" ? "来店完了" : label;
}

function getStatusClass(status: string) {
  const label = getReservationStatusLabel(status, "未設定");

  if (label === "予約申請中" || label === "予約受付") {
    return "bg-amber-100 text-amber-700";
  }

  if (label === "予約確定") {
    return "bg-blue-100 text-blue-700";
  }

  if (label === "完了") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (label === "キャンセル") {
    return "bg-slate-200 text-slate-600";
  }

  return "bg-slate-100 text-slate-700";
}

export default function CustomerReservationDetailPage() {
  const params = useParams<{ id: string }>();
  const reservationId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const actionPendingRef = useRef(false);
  const [reservation, setReservation] =
    useState<ReservationDetail | null>(null);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [message, setMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [refreshErrorMessage, setRefreshErrorMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [signedOut, setSignedOut] = useState(false);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [menu, setMenu] = useState("");
  const [staffId, setStaffId] = useState("");
  const [memo, setMemo] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("90");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestLineLocks, setRequestLineLocks] = useState<
    Partial<
      Record<
        CustomerReservationRequestAction,
        CustomerReservationRequestLineLock
      >
    >
  >({});
  const [requestLineRetries, setRequestLineRetries] = useState<
    Partial<
      Record<CustomerReservationRequestAction, CustomerReservationRequestRetry>
    >
  >({});
  const currentRequestLineRetries = useMemo(() => {
    const revision = reservation?.requestRevision;
    if (!revision) return {};

    return Object.fromEntries(
      Object.entries(requestLineRetries).filter(
        ([, retry]) => retry?.expectedRequestRevision === revision
      )
    ) as Partial<
      Record<CustomerReservationRequestAction, CustomerReservationRequestRetry>
    >;
  }, [requestLineRetries, reservation?.requestRevision]);

  const todayText = useMemo(() => getTodayText(), []);
  const maxDateText = useMemo(() => addDaysText(todayText, 30), [todayText]);

  const fetchReservation = useCallback(async (
    { preserveCurrent = false }: { preserveCurrent?: boolean } = {}
  ) => {
    if (!preserveCurrent) {
      setLoading(true);
      setReservation(null);
      setStaffs([]);
    }

    setErrorMessage("");
    setRefreshErrorMessage("");
    setSignedOut(false);

    const showReadFailure = (fallbackMessage: string) => {
      if (preserveCurrent) {
        setRefreshErrorMessage(
          "予約操作は完了しましたが、最新の予約情報を再取得できませんでした。画面を再読み込みしてください。"
        );
        return;
      }

      setErrorMessage(fallbackMessage);
    };

    try {
      const [reservationResponse, sessionResponse] = await Promise.all([
        fetch(`/api/customer-reservations/${reservationId}`, {
          cache: "no-store",
        }),
        fetch("/api/line-login/me", {
          cache: "no-store",
        }),
      ]);

      const reservationJson =
        (await reservationResponse.json()) as DetailResponse;
      const sessionJson = (await sessionResponse.json()) as SessionResponse;

      if (!sessionResponse.ok) {
        setReservation(null);
        setStaffs([]);
        setErrorMessage("ログイン状態の確認に失敗しました");
        return;
      }

      if (!sessionJson.authenticated) {
        setReservation(null);
        setStaffs([]);
        setErrorMessage("予約内容を確認するにはLINEログインが必要です");
        setSignedOut(true);
        return;
      }

      if (!reservationResponse.ok || !reservationJson.ok) {
        showReadFailure(
          reservationJson.error || "予約情報の取得に失敗しました"
        );
        return;
      }

      const nextReservation = reservationJson.reservation || null;

      if (!nextReservation) {
        showReadFailure("予約情報が見つかりません");
        return;
      }

      const staffResult = await fetch("/api/customer-reservations/staffs", {
        cache: "no-store",
      });
      const staffJson = (await staffResult.json()) as StaffResponse;

      if (!staffResult.ok || !staffJson.ok) {
        showReadFailure(
          staffJson.error || "担当スタッフ情報の取得に失敗しました"
        );
        return;
      }

      const parts = getJstInputParts(nextReservation.startAt);
      const start = new Date(nextReservation.startAt);
      const end = new Date(nextReservation.endAt);
      const minutes = Math.round((end.getTime() - start.getTime()) / 60000);

      setDate(parts.date);
      setTime(parts.time);
      setMenu(nextReservation.menu);
      setStaffId(nextReservation.staffId || "");
      setMemo(nextReservation.memo || "");
      setDurationMinutes(
        Number.isFinite(minutes) && minutes > 0 ? String(minutes) : "90"
      );
      setStaffs(staffJson.staffs || []);
      setReservation(nextReservation);
      setRefreshErrorMessage("");
    } catch (error) {
      console.error(error);
      showReadFailure("予約情報の読み込みに失敗しました");
    } finally {
      if (!preserveCurrent) {
        setLoading(false);
      }
    }
  }, [reservationId]);

  useEffect(() => {
    if (!reservationId) return;
    void Promise.resolve().then(() => fetchReservation());
  }, [reservationId, fetchReservation]);

  useEffect(() => {
    if (!reservationId || !reservation?.requestRevision) return;

    const nextLocks: Partial<
      Record<
        CustomerReservationRequestAction,
        CustomerReservationRequestLineLock
      >
    > = {};
    const nextRetries: Partial<
      Record<CustomerReservationRequestAction, CustomerReservationRequestRetry>
    > = {};

    for (const action of [
      "request_change",
      "request_cancel",
    ] as const) {
      const lock = readCustomerReservationRequestLineLock(
        window.localStorage,
        reservationId,
        action,
        reservation.requestRevision
      );
      if (lock) nextLocks[action] = lock;
      const retry = readCustomerReservationRequestRetry(
        window.localStorage,
        reservationId,
        action,
        reservation.requestRevision
      );
      if (retry) nextRetries[action] = retry;
    }

    setRequestLineLocks(nextLocks);
    setRequestLineRetries(nextRetries);
    const retryMessage =
      nextRetries.request_change?.requestMessage ??
      nextRetries.request_cancel?.requestMessage;
    setRequestMessage(retryMessage ?? "");
  }, [reservationId, reservation?.requestRevision]);

  async function runAction(body: Record<string, unknown>) {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    setSaving(true);
    setMessage("");
    setWarningMessage("");
    setRefreshErrorMessage("");
    setErrorMessage("");
    const requestAction: CustomerReservationRequestAction | null =
      body.action === "request_change" || body.action === "request_cancel"
        ? body.action
        : null;
    const requestRetry = requestAction
      ? {
          action: requestAction,
          requestMessage: String(body.requestMessage || "").trim(),
          expectedRequestRevision: String(
            body.expectedRequestRevision || ""
          ).trim(),
        }
      : null;

    if (requestAction && requestRetry) {
      saveCustomerReservationRequestRetry(
        window.localStorage,
        reservationId,
        requestRetry,
        requestAction
      );
      setRequestLineRetries((current) => ({
        ...current,
        [requestAction]: requestRetry,
      }));
    }

    try {
      const response = await fetch(
        `/api/customer-reservations/${reservationId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const json = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        error?: string;
        notificationWarning?: string;
        retryable?: boolean;
        deliveryStatus?: string;
      } | null;

      if (requestAction && json) {
        const lock = getCustomerReservationRequestLineLock(
          json,
          requestAction
        );

        if (lock) {
          saveCustomerReservationRequestLineLock(
            window.localStorage,
            reservationId,
            lock,
            requestRetry?.expectedRequestRevision || ""
          );
          setRequestLineLocks((current) => ({
            ...current,
            [requestAction]: lock,
          }));
        }

        if (!shouldKeepCustomerReservationRequestRetry(json)) {
          saveCustomerReservationRequestRetry(
            window.localStorage,
            reservationId,
            null,
            requestAction
          );
          setRequestLineRetries((current) => {
            const next = { ...current };
            delete next[requestAction];
            return next;
          });
        }
      }

      if (!json) {
        setRefreshErrorMessage(
          requestAction
            ? "店舗へのLINE送信結果を確認できませんでした。保存した同じ内容で安全に再試行できます。"
            : "通信が途切れたため、予約操作の結果を確認できませんでした。同じ操作を繰り返さず、最新情報を再読み込みしてください。"
        );
        return;
      }

      if (!response.ok || !json.ok) {
        setErrorMessage(json.error || "予約操作に失敗しました");
        return;
      }

      setMessage(json.message || "更新しました");
      setWarningMessage(json.notificationWarning || "");
      await fetchReservation({ preserveCurrent: true });
    } catch (error) {
      console.error(error);
      if (requestAction) {
        const lock = getCustomerReservationRequestLineLock(
          null,
          requestAction
        );
        saveCustomerReservationRequestLineLock(
          window.localStorage,
          reservationId,
          lock,
          requestRetry?.expectedRequestRevision || ""
        );
        setRequestLineLocks((current) => ({
          ...current,
          [requestAction]: lock,
        }));
      }
      setRefreshErrorMessage(
        requestAction
          ? "店舗へのLINE送信結果を確認できませんでした。保存した同じ内容で安全に再試行できます。"
          : "通信が途切れたため、予約操作の結果を確認できませんでした。同じ操作を繰り返さず、最新情報を再読み込みしてください。"
      );
    } finally {
      actionPendingRef.current = false;
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!reservation?.requestRevision) {
      setErrorMessage("予約内容を確認できません。最新情報を再読み込みしてください");
      return;
    }

    await runAction({
      action: "update",
      date,
      time,
      menu,
      staffId,
      memo,
      durationMinutes: Number(durationMinutes),
      expectedRequestRevision: reservation.requestRevision,
    });
  }

  async function handleCancel() {
    if (!reservation?.requestRevision) {
      setErrorMessage("予約内容を確認できません。最新情報を再読み込みしてください");
      return;
    }

    const confirmed = window.confirm(
      "この予約希望を取り消しますか？"
    );

    if (!confirmed) return;

    await runAction({
      action: "cancel",
      expectedRequestRevision: reservation.requestRevision,
    });
  }

  function restoreRequestLineLock(
    action: CustomerReservationRequestAction
  ) {
    if (!reservation?.requestRevision) return false;

    const lock = readCustomerReservationRequestLineLock(
      window.localStorage,
      reservationId,
      action,
      reservation.requestRevision
    );

    if (!lock) return false;

    setRequestLineLocks((current) => ({
      ...current,
      [action]: lock,
    }));
    setErrorMessage("");
    return true;
  }

  async function handleRequestChange() {
    if (restoreRequestLineLock("request_change")) return;
    const requestRevision = reservation?.requestRevision;
    if (!requestRevision) {
      setErrorMessage("予約内容を確認できません。最新情報を再読み込みしてください");
      return;
    }
    if (
      readCustomerReservationRequestRetry(
        window.localStorage,
        reservationId,
        "request_cancel",
        requestRevision
      ) || currentRequestLineRetries.request_cancel
    ) {
      setErrorMessage(
        "先に保存済みのキャンセル希望を再試行してください。別の依頼内容は送信していません。"
      );
      return;
    }

    const retry =
      readCustomerReservationRequestRetry(
        window.localStorage,
        reservationId,
        "request_change",
        requestRevision
      ) || currentRequestLineRetries.request_change;
    const nextRequestMessage = retry?.requestMessage ?? requestMessage.trim();
    const expectedRequestRevision =
      retry?.expectedRequestRevision ?? requestRevision;

    if (!nextRequestMessage) {
      setErrorMessage("変更したい内容を入力してください");
      return;
    }
    if (!expectedRequestRevision) {
      setErrorMessage("予約内容を確認できません。最新情報を再読み込みしてください");
      return;
    }

    await runAction({
      action: "request_change",
      requestMessage: nextRequestMessage,
      expectedRequestRevision,
    });
  }

  async function handleRequestCancel() {
    if (restoreRequestLineLock("request_cancel")) return;
    const requestRevision = reservation?.requestRevision;
    if (!requestRevision) {
      setErrorMessage("予約内容を確認できません。最新情報を再読み込みしてください");
      return;
    }
    if (
      readCustomerReservationRequestRetry(
        window.localStorage,
        reservationId,
        "request_change",
        requestRevision
      ) || currentRequestLineRetries.request_change
    ) {
      setErrorMessage(
        "先に保存済みの変更希望を再試行してください。別の依頼内容は送信していません。"
      );
      return;
    }

    const retry =
      readCustomerReservationRequestRetry(
        window.localStorage,
        reservationId,
        "request_cancel",
        requestRevision
      ) || currentRequestLineRetries.request_cancel;
    const expectedRequestRevision =
      retry?.expectedRequestRevision ?? requestRevision;

    if (!expectedRequestRevision) {
      setErrorMessage("予約内容を確認できません。最新情報を再読み込みしてください");
      return;
    }

    const confirmed = window.confirm(
      retry
        ? "保存済みの同じキャンセル希望を再試行しますか？"
        : "店舗へキャンセル希望を送りますか？"
    );

    if (!confirmed) return;

    await runAction({
      action: "request_cancel",
      requestMessage: retry?.requestMessage ?? requestMessage.trim(),
      expectedRequestRevision,
    });
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 py-6">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-sm text-slate-600">読み込み中...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!reservation) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md space-y-4 px-4 py-6">
          <div
            role="alert"
            className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm"
          >
            <h1 className="text-xl font-bold text-slate-900">予約確認</h1>
            <p className="mt-3 text-sm leading-6 text-rose-600">
              {errorMessage || "予約情報が見つかりません"}
            </p>

            {signedOut ? (
              <Link
                href={`/customer-app/login?next=${encodeURIComponent(
                  `/customer-app/reservations/${reservationId}`
                )}`}
                className="mt-4 block w-full rounded-2xl bg-green-500 px-4 py-3 text-center text-sm font-bold text-white"
              >
                LINEでログインして予約を確認
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void fetchReservation()}
                className="mt-4 w-full rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
              >
                再試行
              </button>
            )}
          </div>

          <Link
            href="/customer-app/history"
            className="block rounded-2xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white"
          >
            履歴へ戻る
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 p-5 text-white shadow">
          <p className="text-xs font-bold tracking-[0.2em] text-white/80">
            AILY MY PAGE
          </p>

          <h1 className="mt-2 text-2xl font-bold">予約内容の確認</h1>

          <p className="mt-3 text-sm leading-6 text-white/90">
            ご予約の状態に応じて、変更・取消・店舗への希望送信ができます。
          </p>
        </section>

        {message ? (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            {message}
          </section>
        ) : null}

        {warningMessage ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            {warningMessage}
          </section>
        ) : null}

        {refreshErrorMessage ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            <p>{refreshErrorMessage}</p>
            <button
              type="button"
              onClick={() => void fetchReservation({ preserveCurrent: true })}
              disabled={saving}
              className="mt-3 w-full rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm font-bold text-amber-900 disabled:opacity-50"
            >
              最新情報を再読み込み
            </button>
          </section>
        ) : null}

        {errorMessage ? (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {errorMessage}
          </section>
        ) : null}

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-bold text-slate-900">
              {reservation.menu || "メニュー未設定"}
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusClass(
                reservation.status
              )}`}
            >
              {getStatusLabel(reservation.status)}
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">現在の予約日時</div>
              <div className="mt-1 text-base font-bold text-slate-900">
                {formatDateTime(reservation.startAt)}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">担当スタッフ</div>
              <div className="mt-1 text-base font-bold text-slate-900">
                {reservation.staffName}
              </div>
            </div>
          </div>
        </section>

        {reservation.externalReservation ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <h2 className="text-base font-bold text-amber-900">
              予約元サービスからお手続きください
            </h2>

            <p className="mt-2 text-sm leading-6 text-amber-800">
              この予約はHOT PEPPER Beautyまたはミニモから登録されています。
              変更・キャンセルは予約元サービスからお願いいたします。
            </p>
          </section>
        ) : null}

        {reservation.canDirectEdit ? (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">
              予約希望を変更
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              予約確定前のため、お客様ご自身で変更できます。
            </p>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  希望日
                </span>

                <input
                  type="date"
                  value={date}
                  min={todayText}
                  max={maxDateText}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-2xl border px-4 py-3 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  希望時間
                </span>

                <select
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                >
                  {timeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  メニュー
                </span>

                <textarea
                  value={menu}
                  onChange={(event) => setMenu(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border px-4 py-3 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  担当スタッフ
                </span>

                <select
                  value={staffId}
                  onChange={(event) => setStaffId(event.target.value)}
                  className="w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                >
                  <option value="">指名なし</option>

                  {staffs.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name || "名前未設定"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  所要時間
                </span>

                <input
                  type="number"
                  min={30}
                  max={360}
                  step={5}
                  value={durationMinutes}
                  onChange={(event) =>
                    setDurationMinutes(event.target.value)
                  }
                  className="w-full rounded-2xl border px-4 py-3 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  ご要望・備考
                </span>

                <textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  rows={5}
                  className="w-full rounded-2xl border px-4 py-3 text-sm"
                />
              </label>

              <button
                type="button"
                onClick={handleUpdate}
                disabled={saving || Boolean(refreshErrorMessage)}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? "変更中..." : "この内容に変更する"}
              </button>
            </div>
          </section>
        ) : null}

        {reservation.canDirectCancel ? (
          <section className="rounded-3xl border border-rose-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">
              予約希望を取り消す
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              予約確定前の申請を取り消します。
            </p>

            <button
              type="button"
              onClick={handleCancel}
              disabled={saving || Boolean(refreshErrorMessage)}
              className="mt-4 w-full rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 disabled:opacity-50"
            >
              予約希望を取り消す
            </button>
          </section>
        ) : null}

        {reservation.canRequestChange ||
        reservation.canRequestCancel ? (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">
              店舗へ希望を送る
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              確定済み予約は直接変更されません。ご希望を店舗へ送信し、店舗からの連絡をお待ちください。
            </p>

            <textarea
              value={requestMessage}
              onChange={(event) => setRequestMessage(event.target.value)}
              disabled={Boolean(
                currentRequestLineRetries.request_change ||
                  currentRequestLineRetries.request_cancel
              )}
              rows={5}
              placeholder="例：7月20日の14時へ変更希望です"
              className="mt-4 w-full rounded-2xl border px-4 py-3 text-sm"
            />

            {currentRequestLineRetries.request_change ||
            currentRequestLineRetries.request_cancel ? (
              <p className="mt-2 text-sm font-bold text-amber-700">
                前回の送信結果を確認できなかったため、再試行では保存済みの同じ内容を使用します。
              </p>
            ) : null}

            <div className="mt-3 grid grid-cols-1 gap-2">
              {reservation.canRequestChange ? (
                requestLineLocks.request_change ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                      requestLineLocks.request_change.kind === "history_check"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {requestLineLocks.request_change.message}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestChange}
                    disabled={
                      saving ||
                      Boolean(currentRequestLineRetries.request_cancel) ||
                      (Boolean(refreshErrorMessage) &&
                        !currentRequestLineRetries.request_change)
                    }
                    className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {currentRequestLineRetries.request_change
                      ? "同じ変更希望を再試行"
                      : "変更希望を店舗へ送る"}
                  </button>
                )
              ) : null}

              {reservation.canRequestCancel ? (
                requestLineLocks.request_cancel ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                      requestLineLocks.request_cancel.kind === "history_check"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {requestLineLocks.request_cancel.message}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestCancel}
                    disabled={
                      saving ||
                      Boolean(currentRequestLineRetries.request_change) ||
                      (Boolean(refreshErrorMessage) &&
                        !currentRequestLineRetries.request_cancel)
                    }
                    className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 disabled:opacity-50"
                  >
                    {currentRequestLineRetries.request_cancel
                      ? "同じキャンセル希望を再試行"
                      : "キャンセル希望を店舗へ送る"}
                  </button>
                )
              ) : null}
            </div>
          </section>
        ) : null}

        <Link
          href="/customer-app/history"
          className="block rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700"
        >
          予約・来店履歴へ戻る
        </Link>
      </div>
    </main>
  );
}
