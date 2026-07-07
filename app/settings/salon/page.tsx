"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Salon = {
  id: string;
  name: string | null;
  google_review_url: string | null;
  instagram_url: string | null;
  hpb_url: string | null;
  minimo_url: string | null;
  line_url: string | null;
};

export default function SalonSettingsPage() {
  const [salon, setSalon] = useState<Salon | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSalon() {
      setLoading(true);

      const { data, error } = await supabase
        .from("salons")
        .select(
          "id, name, google_review_url, instagram_url, hpb_url, minimo_url, line_url"
        )
        .limit(1)
        .maybeSingle();

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      setSalon(data as Salon | null);
      setLoading(false);
    }

    loadSalon();
  }, []);

  function updateField(key: keyof Salon, value: string) {
    if (!salon) return;
    setSalon({ ...salon, [key]: value });
  }

  async function handleSave() {
    if (!salon) return;

    setSaving(true);

    const { error } = await supabase
      .from("salons")
      .update({
        name: salon.name || null,
        google_review_url: salon.google_review_url || null,
        instagram_url: salon.instagram_url || null,
        hpb_url: salon.hpb_url || null,
        minimo_url: salon.minimo_url || null,
        line_url: salon.line_url || null,
      })
      .eq("id", salon.id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("店舗設定を保存しました");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-rose-50/40 p-4">
        <div className="mx-auto max-w-[760px]">読み込み中...</div>
      </main>
    );
  }

  if (!salon) {
    return (
      <main className="min-h-screen bg-rose-50/40 p-4">
        <div className="mx-auto max-w-[760px] rounded-3xl bg-white p-5">
          店舗情報が見つかりません。
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto w-full max-w-[760px] space-y-4 p-4 pb-24">
        <section className="rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            NAILY AIDOL
          </p>
          <h1 className="mt-2 text-2xl font-bold">店舗設定</h1>
          <p className="mt-2 text-sm leading-6 text-white/90">
            Google口コミURLや各予約サイトのリンクを管理します。
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="rounded-2xl border bg-white px-4 py-3 text-sm font-bold text-rose-600 shadow-sm"
          >
            ホームへ
          </Link>
          <Link
            href="/reservations/calendar"
            className="rounded-2xl border bg-white px-4 py-3 text-sm font-bold text-rose-600 shadow-sm"
          >
            予約カレンダーへ
          </Link>
        </div>

        <section className="space-y-4 rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
          <Field
            label="店舗名"
            value={salon.name || ""}
            onChange={(value) => updateField("name", value)}
            placeholder="Aily Nail Studio"
          />

          <Field
            label="Google口コミURL"
            value={salon.google_review_url || ""}
            onChange={(value) => updateField("google_review_url", value)}
            placeholder="https://g.page/..."
          />

          <Field
            label="Instagram URL"
            value={salon.instagram_url || ""}
            onChange={(value) => updateField("instagram_url", value)}
            placeholder="https://www.instagram.com/..."
          />

          <Field
            label="Hot Pepper Beauty URL"
            value={salon.hpb_url || ""}
            onChange={(value) => updateField("hpb_url", value)}
            placeholder="https://beauty.hotpepper.jp/..."
          />

          <Field
            label="ミニモ URL"
            value={salon.minimo_url || ""}
            onChange={(value) => updateField("minimo_url", value)}
            placeholder="https://minimodel.jp/..."
          />

          <Field
            label="LINE公式 URL"
            value={salon.line_url || ""}
            onChange={(value) => updateField("line_url", value)}
            placeholder="https://lin.ee/..."
          />

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="mt-2 w-full rounded-2xl bg-slate-950 px-4 py-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存する"}
          </button>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-bold text-slate-800">{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-rose-100 bg-rose-50/30 px-4 py-3 text-sm outline-none focus:border-rose-300"
      />
    </label>
  );
}