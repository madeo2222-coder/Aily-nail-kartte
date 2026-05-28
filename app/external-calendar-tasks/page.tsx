"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ReservationRow = {
  id: string;
  customer_id: string | null;
  staff_id: string | null;
  menu: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  memo: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
};

type TaskItem = {
  id: string;
  customerName: string;
  staffName: string;
  menuName: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  dateLabel: string;
  timeLabel: string;
  durationLabel: string;
  hpbText: string;
  minimoText: string;
};

type DoneMap = Record<
  string,
  {
    hpb?: boolean;
    minimo?: boolean;
  }
>;

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

function formatJstDate(value: string | null) {
  const normalized = normalizeSupabaseDateTime(value);
  if (!normalized) return "日付未設定";

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "日付未設定";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatJstTime(value: string | null) {
  const normalized = normalizeSupabaseDateTime(value);
  if (!normalized) return "未設定";

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "未設定";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getDurationLabel(startAt: string | null, endAt: string | null) {
  const normalizedStart = normalizeSupabaseDateTime(startAt);
  const normalizedEnd = normalizeSupabaseDateTime(endAt);

  if (!normalizedStart || !normalizedEnd) return "未設定";

  const start = new Date(normalizedStart);
  const end = new Date(normalizedEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "未設定";
  }

  const diffMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

  if (!Number.isFinite(diffMinutes) || diffMinutes <= 0) return "未設定";

  const hour = Math.floor(diffMinutes / 60);
  const minute = diffMinutes % 60;

  if (hour <= 0) return `${minute}分`;
  if (minute === 0) return `${hour}時間`;

  return `${hour}時間${minute}分`;
}

function isCancelledStatus(status: string | null | undefined) {
  return status === "キャンセル" || status === "cancelled";
}

function isExternalBlock(row: ReservationRow) {
  if (!row.customer_id) return true;

  const checkText = `${row.menu || ""}\n${row.memo || ""}`;

  return (
    checkText.includes("ホットペッパー") ||
    checkText.includes("HPB") ||
    checkText.includes("ミニモ") ||
    checkText.includes("休憩") ||
    checkText.includes("店休日") ||
    checkText.includes("ブロック")
  );
}

function buildCopyText({
  channel,
  dateLabel,
  timeLabel,
  durationLabel,
  customerName,
  staffName,
  menuName,
}: {
  channel: "HPB" | "ミニモ";
  dateLabel: string;
  timeLabel: string;
  durationLabel: string;
  customerName: string;
  staffName: string;
  menuName: string;
}) {
  return `Naily AiDOL予約あり
媒体：${channel}
日時：${dateLabel} ${timeLabel}
所要時間：${durationLabel}
担当：${staffName}
顧客：${customerName}
内容：${menuName}
外部カレンダー側はこの時間をブロックしてください。`;
}

export default function ExternalCalendarTasksPage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [doneMap, setDoneMap] = useState<DoneMap>({});
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("naily_external_calendar_done");
    if (saved) {
      try {
        setDoneMap(JSON.parse(saved) as DoneMap);
      } catch {
        setDoneMap({});
      }
    }

    fetchTasks();
  }, []);

  async function fetchTasks() {
    setLoading(true);

    const [reservationsResult, customersResult, staffsResult] = await Promise.all([
      supabase
        .from("reservations")
        .select("id, customer_id, staff_id, menu, start_at, end_at, status, memo")
        .order("start_at", { ascending: true }),
      supabase.from("customers").select("id, name"),
      supabase.from("staffs").select("id, name"),
    ]);

    const reservations = (reservationsResult.data || []) as ReservationRow[];
    const customers = (customersResult.data || []) as CustomerRow[];
    const staffs = (staffsResult.data || []) as StaffRow[];

    const customerMap = new Map(
      customers.map((customer) => [customer.id, customer.name || "顧客名未設定"])
    );

    const staffMap = new Map(
      staffs.map((staff) => [staff.id, staff.name || "未設定"])
    );

    const now = new Date();

    const nextTasks = reservations
      .filter((row) => {
        if (!row.customer_id) return false;
        if (!row.start_at) return false;
        if (isCancelledStatus(row.status)) return false;
        if (isExternalBlock(row)) return false;

        const normalized = normalizeSupabaseDateTime(row.start_at);
        if (!normalized) return false;

        const start = new Date(normalized);
        if (Number.isNaN(start.getTime())) return false;

        return start >= now;
      })
      .map((row) => {
        const customerName = row.customer_id
          ? customerMap.get(row.customer_id) || "顧客名未設定"
          : "顧客名未設定";

        const staffName = row.staff_id
          ? staffMap.get(row.staff_id) || "未設定"
          : "未設定";

        const menuName = row.menu || "メニュー未設定";
        const dateLabel = formatJstDate(row.start_at);
        const startTime = formatJstTime(row.start_at);
        const endTime = formatJstTime(row.end_at);
        const timeLabel = `${startTime}〜${endTime}`;
        const durationLabel = getDurationLabel(row.start_at, row.end_at);

        return {
          id: row.id,
          customerName,
          staffName,
          menuName,
          status: row.status || "予約",
          startAt: row.start_at,
          endAt: row.end_at,
          dateLabel,
          timeLabel,
          durationLabel,
          hpbText: buildCopyText({
            channel: "HPB",
            dateLabel,
            timeLabel,
            durationLabel,
            customerName,
            staffName,
            menuName,
          }),
          minimoText: buildCopyText({
            channel: "ミニモ",
            dateLabel,
            timeLabel,
            durationLabel,
            customerName,
            staffName,
            menuName,
          }),
        };
      });

    setTasks(nextTasks);
    setLoading(false);
  }

  const pendingTasks = useMemo(() => {
    return tasks.filter((task) => {
      const done = doneMap[task.id] || {};
      return !done.hpb || !done.minimo;
    });
  }, [tasks, doneMap]);

  function updateDone(taskId: string, key: "hpb" | "minimo", value: boolean) {
    const next = {
      ...doneMap,
      [taskId]: {
        ...(doneMap[taskId] || {}),
        [key]: value,
      },
    };

    setDoneMap(next);
    window.localStorage.setItem("naily_external_calendar_done", JSON.stringify(next));
  }

  async function copyText(taskId: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(taskId);

    window.setTimeout(() => {
      setCopiedId("");
    }, 1500);
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-5xl space-y-4 p-4 pb-24 sm:p-6">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-purple-800 to-rose-500 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/70">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">
                外部カレンダー反映タスク
              </h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                Naily AiDOLで入った予約を、HPB・ミニモ側にブロック登録するための確認ページです。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/settings/external-connections"
                className="rounded-2xl border border-white/40 bg-white/15 px-4 py-3 text-sm font-bold text-white backdrop-blur"
              >
                外部連携管理へ
              </Link>

              <Link
                href="/reservations/calendar"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-purple-700 shadow"
              >
                カレンダーへ
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl bg-rose-50 p-4">
              <div className="text-sm font-bold text-rose-500">反映待ち</div>
              <div className="mt-2 text-3xl font-black text-slate-900">
                {pendingTasks.length}件
              </div>
            </div>

            <div className="rounded-3xl bg-purple-50 p-4">
              <div className="text-sm font-bold text-purple-500">対象予約</div>
              <div className="mt-2 text-3xl font-black text-slate-900">
                {tasks.length}件
              </div>
            </div>

            <div className="rounded-3xl bg-emerald-50 p-4">
              <div className="text-sm font-bold text-emerald-600">運用</div>
              <div className="mt-2 text-base font-bold leading-7 text-slate-900">
                HPB・ミニモへ手動ブロック登録
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
            読み込み中...
          </section>
        ) : tasks.length === 0 ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-6 text-sm text-slate-500 shadow-sm">
            外部カレンダーへ反映が必要な予約はありません。
          </section>
        ) : (
          <section className="space-y-4">
            {tasks.map((task) => {
              const done = doneMap[task.id] || {};
              const isDoneAll = Boolean(done.hpb && done.minimo);

              return (
                <div
                  key={task.id}
                  className={`rounded-[28px] border p-4 shadow-sm sm:p-6 ${
                    isDoneAll
                      ? "border-emerald-100 bg-emerald-50/70"
                      : "border-rose-100 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900">
                        {task.dateLabel} {task.timeLabel}
                      </div>
                      <div className="mt-2 grid gap-1 text-sm text-slate-600">
                        <div>担当：{task.staffName}</div>
                        <div>顧客：{task.customerName}</div>
                        <div>内容：{task.menuName}</div>
                        <div>所要時間：{task.durationLabel}</div>
                      </div>
                    </div>

                    <div
                      className={`rounded-full px-4 py-2 text-xs font-bold ${
                        isDoneAll
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {isDoneAll ? "反映済み" : "反映待ち"}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-3xl border border-orange-100 bg-orange-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-orange-800">
                          HPB用
                        </div>
                        <label className="flex items-center gap-2 text-sm font-bold text-orange-800">
                          <input
                            type="checkbox"
                            checked={Boolean(done.hpb)}
                            onChange={(e) => updateDone(task.id, "hpb", e.target.checked)}
                          />
                          反映済み
                        </label>
                      </div>

                      <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-xs leading-5 text-slate-700">
                        {task.hpbText}
                      </pre>

                      <button
                        type="button"
                        onClick={() => copyText(`${task.id}-hpb`, task.hpbText)}
                        className="mt-3 w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white"
                      >
                        {copiedId === `${task.id}-hpb`
                          ? "コピーしました"
                          : "HPB用をコピー"}
                      </button>
                    </div>

                    <div className="rounded-3xl border border-purple-100 bg-purple-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-purple-800">
                          ミニモ用
                        </div>
                        <label className="flex items-center gap-2 text-sm font-bold text-purple-800">
                          <input
                            type="checkbox"
                            checked={Boolean(done.minimo)}
                            onChange={(e) =>
                              updateDone(task.id, "minimo", e.target.checked)
                            }
                          />
                          反映済み
                        </label>
                      </div>

                      <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-xs leading-5 text-slate-700">
                        {task.minimoText}
                      </pre>

                      <button
                        type="button"
                        onClick={() =>
                          copyText(`${task.id}-minimo`, task.minimoText)
                        }
                        className="mt-3 w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-bold text-white"
                      >
                        {copiedId === `${task.id}-minimo`
                          ? "コピーしました"
                          : "ミニモ用をコピー"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
