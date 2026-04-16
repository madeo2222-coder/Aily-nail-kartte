"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CustomerForm() {
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) return;

    const { error } = await supabase.from("customers").insert([
      {
        name: trimmedName,
      },
    ]);

    if (error) {
      console.error("顧客登録エラー:", error);
      alert("顧客登録に失敗しました");
      return;
    }

    alert("顧客を登録しました");
    setName("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          顧客名
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 山田 花子"
          className="w-full rounded-xl border px-3 py-2"
        />
      </div>

      <button
        type="submit"
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
      >
        顧客を登録
      </button>
    </form>
  );
}