"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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
  if (status === "requested") return "予約申請中";
  if (status === "confirmed") return "予約確定";
  if (status === "completed") return "来店完了";
  if (status === "cancelled" || status === "キャンセル") {
    return "キャンセル";
  }

  return status || "未設定";
}

function getStatusClass(status: string) {
  if (status === "requested") {
    return "bg-amber-100 text-amber-700";
  }

  if (status === "confirmed") {
    return "bg-blue-100 text-blue-700";
  }

  if (status === "completed") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "cancelled" || status === "キャンセル") {
    return "bg-slate-200 text-slate-600";
  }

  return "bg-slate-100 text-slate-700";
}

export default function CustomerReservationDetailPage() {
  const params = useParams<{ id: string }>();
  const reservationId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reservation, setReservation] =
    useState<ReservationDetail | null>(null);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [menu, setMenu] = useState("");
  const [staffId, setStaffId] = useState("");
  const [memo, setMemo] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("90");
  const [requestMessage, setRequestMessage] = useState("");

  const todayText = useMemo(() => getTodayText(), []);
  const maxDateText = useMemo(() => addDaysText(todayText, 30), [todayText]);

  async function fetchReservation() {
    setLoading(true);
    setErrorMessage("");

    try {
      const [reservationResponse, staffResponse] = await Promise.all([
        fetch(`/api/customer-reservations/${reservationId}`, {
          cache: "no-store",
        }),
        fetch("/api/line-login/me", {
          cache: "no-store",
        }),
      ]);

      const reservationJson =
        (await reservationResponse.json()) as DetailResponse;

      if (!reservationResponse.ok || !reservationJson.ok) {
        setErrorMessage(
          reservationJson.error || "予約情報の取得に失敗しました"
        );
        setReservation(null);
        return;
      }

      const nextReservation = reservationJson.reservation || null;
      setReservation(nextReservation);

      if (nextReservation) {
        const parts = getJstInputParts(nextReservation.startAt);

        setDate(parts.date);
        setTime(parts.time);
        setMenu(nextReservation.menu);
        setStaffId(nextReservation.staffId || "");
        setMemo(nextReservation.memo || "");

        const start = new Date(nextReservation.startAt);
        const end = new Date(nextReservation.endAt);
        const minutes = Math.round(
          (end.getTime() - start.getTime()) / 60000
        );

        setDurationMinutes(
          Number.isFinite(minutes) && minutes > 0
            ? String(minutes)
            : "90"
        );
      }

      void staffResponse;

      const staffResult = await fetch("/api/customer-reservations/staffs", {
        cache: "no-store",
      });

      if (staffResult.ok) {
        const staffJson = (await staffResult.json()) as {
          ok?: boolean;
          staffs?: StaffRow[];
        };

        setStaffs(staffJson.staffs || []);
      } else {
        setStaffs([]);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("予約情報の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!reservationId) return;
    void fetchReservation();
  }, [reservationId]);

  async function runAction(body: Record<string, unknown>) {
    setSaving(true);
    setMessage("");
    setErrorMessage("");

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

      const json = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !json.ok) {
        setErrorMessage(json.error || "予約操作に失敗しました");
        return;
      }

      setMessage(json.message || "更新しました");
      await fetchReservation();
    } catch (error) {
      console.error(error);
      setErrorMessage("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    await runAction({
      action: "update",
      date,
      time,
      menu,
      staffId,
      memo,
      durationMinutes: Number(durationMinutes),
    });
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      "この予約希望を取り消しますか？"
    );

    if (!confirmed) return;

    await runAction({
      action: "cancel",
    });
  }

  async function handleRequestChange() {
    if (!requestMessage.trim()) {
      setErrorMessage("変更したい内容を入力してください");
      return;
    }

    await runAction({
      action: "request_change",
      requestMessage,
    });
  }

  async function handleRequestCancel() {
    const confirmed = window.confirm(
      "店舗へキャンセル希望を送りますか？"
    );

    if (!confirmed) return;

    await runAction({
      action: "request_cancel",
      requestMessage,
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
          <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">予約確認</h1>
            <p className="mt-3 text-sm leading-6 text-rose-600">
              {errorMessage || "予約情報が見つかりません"}
            </p>
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
                disabled={saving}
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
              disabled={saving}
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
              rows={5}
              placeholder="例：7月20日の14時へ変更希望です"
              className="mt-4 w-full rounded-2xl border px-4 py-3 text-sm"
            />

            <div className="mt-3 grid grid-cols-1 gap-2">
              {reservation.canRequestChange ? (
                <button
                  type="button"
                  onClick={handleRequestChange}
                  disabled={saving}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  変更希望を店舗へ送る
                </button>
              ) : null}

              {reservation.canRequestCancel ? (
                <button
                  type="button"
                  onClick={handleRequestCancel}
                  disabled={saving}
                  className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 disabled:opacity-50"
                >
                  キャンセル希望を店舗へ送る
                </button>
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