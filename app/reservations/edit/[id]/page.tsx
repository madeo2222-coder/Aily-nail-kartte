"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

const STATUS_OPTIONS = ["予約", "来店", "完了", "キャンセル"] as const;

function normalizeSupabaseDateTime(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  // すでに Z や +00:00 などタイムゾーン情報がある場合はそのまま使う
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Supabase の timestamp without time zone で
  // "2026-05-31 02:00:00" のように返ってきた場合はUTCとして読む
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

function normalizeStatus(value: string | null) {
  if (!value) return "予約";

  if (value === "pending") return "予約";
  if (value === "requested") return "予約";
  if (value === "confirmed") return "予約";
  if (value === "completed") return "完了";
  if (value === "cancelled") return "キャンセル";

  if (value === "予約受付") return "予約";
  if (value === "予約申請中") return "予約";
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

export default function EditReservationPage() {
  const router = useRouter();
  const params = useParams();

  const reservationId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
  const [status, setStatus] =
    useState<"予約" | "来店" | "完了" | "キャンセル">("予約");
  const [memo, setMemo] = useState("");
  const [galleryReference, setGalleryReference] = useState<GalleryReference>({
    hasGallery: false,
    designId: "",
    photoUrl: "",
    menuName: "",
    color: "",
  });

  async function loadPageData() {
    if (!reservationId) {
      setErrorMessage("予約IDが取得できませんでした");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const [reservationRes, salonsRes, customersRes, staffsRes] =
      await Promise.all([
        supabase
          .from("reservations")
          .select(
            "id, salon_id, customer_id, staff_id, menu, start_at, end_at, status, memo"
          )
          .eq("id", reservationId)
          .single(),
        supabase
          .from("salons")
          .select("id, name")
          .order("created_at", { ascending: true }),
        supabase
          .from("customers")
          .select("id, name, salon_id")
          .order("name", { ascending: true }),
        supabase
          .from("staffs")
          .select("id, name, salon_id")
          .order("created_at", { ascending: true }),
      ]);

    if (
      reservationRes.error ||
      !reservationRes.data ||
      salonsRes.error ||
      customersRes.error ||
      staffsRes.error
    ) {
      setErrorMessage("予約情報の取得に失敗しました");
      setLoading(false);
      return;
    }

    const reservation = reservationRes.data as ReservationDetail;
    const rawMemo = reservation.memo ?? "";
    const nextGalleryReference = extractGalleryReference(rawMemo);

    setSalons((salonsRes.data ?? []) as Salon[]);
    setAllCustomers((customersRes.data ?? []) as Customer[]);
    setAllStaffs((staffsRes.data ?? []) as Staff[]);

    setSalonId(reservation.salon_id ?? "");
    setCustomerId(reservation.customer_id ?? "");
    setStaffId(reservation.staff_id ?? "");
    setMenu(reservation.menu ?? "");
    setDate(extractDate(reservation.start_at));
    setStartTime(extractTime(reservation.start_at));
    setEndTime(extractTime(reservation.end_at));
    setStatus(
      normalizeStatus(reservation.status) as
        | "予約"
        | "来店"
        | "完了"
        | "キャンセル"
    );
    setGalleryReference(nextGalleryReference);
    setMemo(removeGalleryReferenceLines(rawMemo));

    setLoading(false);
  }

  useEffect(() => {
    loadPageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  const filteredCustomers = useMemo(() => {
    return allCustomers.filter((item) =>
      salonId ? item.salon_id === salonId : true
    );
  }, [allCustomers, salonId]);

  const filteredStaffs = useMemo(() => {
    return allStaffs.filter((item) =>
      salonId ? item.salon_id === salonId : true
    );
  }, [allStaffs, salonId]);

  function handleSalonChange(nextSalonId: string) {
    setSalonId(nextSalonId);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!reservationId) return;

    if (!salonId || !customerId || !staffId || !date || !startTime || !endTime) {
      setErrorMessage("必要項目を入力してください");
      return;
    }

    const startAt = buildDateTime(date, startTime);
    const endAt = buildDateTime(date, endTime);

    if (!startAt || !endAt || startAt >= endAt) {
      setErrorMessage("日時を正しく入力してください");
      return;
    }

    const memoForSave = buildMemoForSave(galleryReference, memo);

    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("reservations")
      .update({
        salon_id: salonId,
        customer_id: customerId,
        staff_id: staffId,
        menu: menu || null,
        start_at: startAt,
        end_at: endAt,
        status,
        memo: memoForSave || null,
      })
      .eq("id", reservationId);

    setSaving(false);

    if (error) {
      setErrorMessage("予約の更新に失敗しました");
      return;
    }

    router.push(customerId ? `/customers/${customerId}` : "/reservations");
  }

  async function handleDelete() {
    if (!reservationId) return;

    const confirmed = window.confirm("この予約を削除しますか？");
    if (!confirmed) return;

    setDeleting(true);

    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("id", reservationId);

    setDeleting(false);

    if (error) {
      setErrorMessage("予約の削除に失敗しました");
      return;
    }

    router.push(customerId ? `/customers/${customerId}` : "/reservations");
  }

  const backHref = customerId ? `/customers/${customerId}` : "/reservations";

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 sm:p-6">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">予約編集ページ</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                ご予約内容の変更・削除ができるページです。
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
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm sm:p-6"
          >
            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {errorMessage}
              </div>
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
                    className="mt-3 block overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-sm"
                  >
                    <img
                      src={galleryReference.photoUrl}
                      alt="Aily Gallery参考デザイン"
                      className="h-72 w-full object-cover"
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
                  onChange={(e) =>
                    setStatus(
                      e.target.value as
                        | "予約"
                        | "来店"
                        | "完了"
                        | "キャンセル"
                    )
                  }
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                >
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

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
                disabled={saving}
                className="rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? "更新中..." : "更新する"}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-2xl border border-rose-200 bg-white py-4 text-sm font-bold text-rose-600 disabled:opacity-60"
              >
                {deleting ? "削除中..." : "削除する"}
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