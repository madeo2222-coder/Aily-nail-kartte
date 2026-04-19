"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type StaffRow = {
  id: string;
  name: string | null;
  role?: string | null;
  salon_id?: string | null;
  user_id?: string | null;
  created_at?: string | null;
};

export default function StaffManagePage() {
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchStaffs();
  }, []);

  async function fetchStaffs() {
    setLoading(true);

    const { data, error } = await supabase
      .from("staffs")
      .select("id, name, role, salon_id, user_id, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("staffs fetch error:", error);
      alert("スタッフ一覧の取得に失敗しました");
      setStaffs([]);
      setLoading(false);
      return;
    }

    setStaffs((data as StaffRow[]) || []);
    setLoading(false);
  }

  async function handleAddStaff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      alert("スタッフ名を入力してください");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("staffs").insert([
      {
        name: trimmedName,
      },
    ]);

    setSaving(false);

    if (error) {
      console.error("staff insert error:", error);
      alert(`スタッフ追加に失敗しました: ${error.message}`);
      return;
    }

    alert("スタッフを追加しました");
    setName("");
    await fetchStaffs();
  }

  async function handleDeleteStaff(id: string, staffName: string) {
    const ok = window.confirm(`「${staffName}」を削除しますか？`);
    if (!ok) return;

    setDeletingId(id);

    const { error } = await supabase.from("staffs").delete().eq("id", id);

    setDeletingId(null);

    if (error) {
      console.error("staff delete error:", error);
      alert(`スタッフ削除に失敗しました: ${error.message}`);
      return;
    }

    alert("スタッフを削除しました");
    await fetchStaffs();
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6 sm:py-10">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-orange-500">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-3xl font-bold text-gray-900">
                スタッフ管理
              </h1>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                スタッフ名の追加と一覧確認ができます。
                予約やダッシュボードの担当者表示に使う土台です。
              </p>
            </div>

            <Link
              href="/staff"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              スタッフ入口へ戻る
            </Link>
          </div>
        </div>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h2 className="text-lg font-bold text-gray-900">スタッフ追加</h2>
          <p className="mt-2 text-sm text-gray-600">
            まずは名前だけ追加できる最小構成です。
          </p>

          <form onSubmit={handleAddStaff} className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                スタッフ名
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 田中 / 佐藤 / 山本"
                className="w-full rounded-2xl border px-4 py-3"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "追加中..." : "スタッフを追加"}
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">スタッフ一覧</h2>
              <p className="mt-1 text-sm text-gray-600">
                現在登録されているスタッフです。
              </p>
            </div>

            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {staffs.length}名
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              読み込み中...
            </div>
          ) : staffs.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              スタッフはまだ登録されていません
            </div>
          ) : (
            <div className="space-y-3">
              {staffs.map((staff) => (
                <div
                  key={staff.id}
                  className="rounded-2xl border bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-base font-bold text-slate-900">
                        {staff.name || "名前未設定"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        ID: {staff.id}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteStaff(staff.id, staff.name || "名前未設定")
                      }
                      disabled={deletingId === staff.id}
                      className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-600 disabled:opacity-50"
                    >
                      {deletingId === staff.id ? "削除中..." : "削除"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}