"use client";

import { useState } from "react";

export default function CustomerIntakePage() {
  const [form, setForm] = useState({
    name: "",
    kana: "",
    phone: "",
    email: "",
    birthday: "",
    instagram: "",
    emergencyContact: "",
    nailHistory: "",
    allergies: "",
    notes: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("復旧版のため、まだ保存処理は接続していません。ページ復旧は完了です。");
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-black">初回登録</h1>
          <p className="mt-2 text-sm text-gray-600">
            初回来店のお客様向け入力ページ（復旧版）
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm leading-6 text-amber-900">
            現在は404解消を最優先にした復旧版です。
            入力画面は表示されますが、保存機能はまだ接続していません。
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-black">
                お名前
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                type="text"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                placeholder="山田 花子"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black">
                ふりがな
              </label>
              <input
                name="kana"
                value={form.kana}
                onChange={handleChange}
                type="text"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                placeholder="やまだ はなこ"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black">
                電話番号
              </label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                type="tel"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                placeholder="09012345678"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black">
                メールアドレス
              </label>
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                type="email"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                placeholder="example@email.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black">
                生年月日
              </label>
              <input
                name="birthday"
                value={form.birthday}
                onChange={handleChange}
                type="date"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-black">
                Instagram
              </label>
              <input
                name="instagram"
                value={form.instagram}
                onChange={handleChange}
                type="text"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                placeholder="@aily_example"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-black">
                緊急連絡先
              </label>
              <input
                name="emergencyContact"
                value={form.emergencyContact}
                onChange={handleChange}
                type="text"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                placeholder="ご家族・ご本人以外の連絡先"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-black">
                ネイル履歴
              </label>
              <textarea
                name="nailHistory"
                value={form.nailHistory}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                placeholder="ジェル経験、オフの有無、過去の施術履歴など"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-black">
                アレルギー・注意事項
              </label>
              <textarea
                name="allergies"
                value={form.allergies}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                placeholder="皮膚アレルギー、体調面、施術時の注意事項など"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-black">
                備考
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                placeholder="希望デザイン、接客メモなど"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            登録内容を確認する
          </button>
        </form>
      </div>
    </main>
  );
}