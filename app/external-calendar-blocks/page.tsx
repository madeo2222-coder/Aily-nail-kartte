"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type StaffRow = {
  id: string;
  name: string | null;
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
  "18:30",
  "19:00",
];

export default function ExternalCalendarBlocksPage() {
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [staffsLoading, setStaffsLoading] = useState(true);
  const [staffsError, setStaffsError] = useState("");
  const staffRequestVersionRef = useRef(0);

  const [source, setSource] = useState("HPB");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [contractorStaffName, setContractorStaffName] = useState("");

  const selectedStaff = staffs.find((staff) => staff.id === staffId);
  const isContractorBooking = selectedStaff?.name?.trim() === "業務委託";

  const loadStaffs = useCallback(async () => {
    const requestVersion = staffRequestVersionRef.current + 1;
    staffRequestVersionRef.current = requestVersion;
    setStaffsLoading(true);
    setStaffsError("");

    try {
      const { data, error } = await supabase
        .from("staffs")
        .select("id,name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      if (requestVersion === staffRequestVersionRef.current) {
        setStaffs((data || []) as StaffRow[]);
      }
    } catch (error) {
      console.error("スタッフ取得エラー:", error);
      if (requestVersion === staffRequestVersionRef.current) {
        setStaffs([]);
        setStaffsError("スタッフ情報の取得に失敗しました。");
      }
    } finally {
      if (requestVersion === staffRequestVersionRef.current) {
        setStaffsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadStaffs();

    return () => {
      staffRequestVersionRef.current += 1;
    };
  }, [loadStaffs]);

  async function handleSave() {
    if (!staffId) {
      alert("担当スタッフを選択してください");
      return;
    }

    if (!date) {
      alert("日付を選択してください");
      return;
    }

    if (isContractorBooking && (!title.trim() || !contractorStaffName.trim())) {
      alert("お客さま名と施術スタッフ名を入力してください");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/external-calendar-blocks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: isContractorBooking ? "業務委託" : source,
          staffId,
          date,
          startTime,
          endTime,
          title,
          memo: isContractorBooking
            ? `施術スタッフ：${contractorStaffName.trim()}`
            : memo,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "登録に失敗しました");
      }

      alert("外部予約ブロックを登録しました");

      setTitle("");
      setMemo("");
      setContractorStaffName("");
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "登録中にエラーが発生しました"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-4 pb-24">
      <h1 className="mb-6 text-2xl font-bold">
        外部予約ブロック登録
      </h1>

      {staffsLoading ? (
        <section className="rounded-2xl border bg-white p-4 text-sm text-slate-500">
          スタッフ情報を読み込み中...
        </section>
      ) : staffsError ? (
        <section
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
        >
          <div className="text-sm font-bold text-rose-800">{staffsError}</div>
          <button
            type="button"
            onClick={loadStaffs}
            className="mt-4 w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white"
          >
            再試行
          </button>
        </section>
      ) : staffs.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          有効なスタッフが登録されていません。スタッフ設定を確認してください。
        </section>
      ) : (
        <div className="space-y-4 rounded-2xl border bg-white p-4">
        {!isContractorBooking ? (
          <div>
            <label className="mb-2 block text-sm font-medium">
              予約元
            </label>

            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-xl border p-3"
            >
              <option>HPB</option>
              <option>ミニモ</option>
              <option>電話</option>
              <option>その他</option>
            </select>
          </div>
        ) : (
          <div className="rounded-xl bg-violet-50 px-3 py-2 text-sm font-bold text-violet-800">
            業務委託の予定としてカレンダーへ登録します。
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium">
            担当スタッフ
          </label>

          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="w-full rounded-xl border p-3"
          >
            <option value="">選択してください</option>

            {staffs.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name || "未設定"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            日付
          </label>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border p-3"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-sm font-medium">
              開始
            </label>

            <select
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-xl border p-3"
            >
              {timeOptions.map((time) => (
                <option key={time}>{time}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              終了
            </label>

            <select
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-xl border p-3"
            >
              {timeOptions.map((time) => (
                <option key={time}>{time}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            {isContractorBooking ? "お客さま名" : "タイトル"}
          </label>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isContractorBooking ? "例：山田 花子" : "例：HPB予約"}
            className="w-full rounded-xl border p-3"
          />
        </div>

        {isContractorBooking ? (
          <div>
            <label className="mb-2 block text-sm font-medium">
              施術スタッフ名
            </label>

            <input
              type="text"
              value={contractorStaffName}
              onChange={(e) => setContractorStaffName(e.target.value)}
              placeholder="例：田中 美咲"
              className="w-full rounded-xl border p-3"
            />
          </div>
        ) : (
          <div>
            <label className="mb-2 block text-sm font-medium">
              メモ
            </label>

            <textarea
              rows={4}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full rounded-xl border p-3"
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white"
        >
          {saving ? "登録中..." : "ブロック登録"}
        </button>
        </div>
      )}
    </main>
  );
}
