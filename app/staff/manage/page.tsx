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
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6 sm:py-10">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">スタッフ管理ページ</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                スタッフ名の追加や一覧確認ができる、店舗用の管理ページです。
              </p>
            </div>

            <Link
              href="/staff"
              className="inline-flex items-center justify-center rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
            >
              スタッフページへ
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">スタッフ追加</h2>
          <p className="mt-2 text-sm text-slate-500">
            まずは名前だけ追加できるシンプルな登録です。
          </p>

          <form onSubmit={handleAddStaff} className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                スタッフ名
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 田中 / 佐藤 / 山本"
                className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "追加中..." : "スタッフを追加"}
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">スタッフ一覧</h2>
              <p className="mt-1 text-sm text-slate-500">
                現在登録されているスタッフを確認できます。
              </p>
            </div>

            <div className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
              {staffs.length}名
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl bg-rose-50 p-4 text-sm text-slate-500">
              読み込み中...
            </div>
          ) : staffs.length === 0 ? (
            <div className="rounded-3xl bg-rose-50 p-4 text-sm text-slate-500">
              スタッフはまだ登録されていません
            </div>
          ) : (
            <div className="space-y-3">
              {staffs.map((staff) => (
                <div
                  key={staff.id}
                  className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm"
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