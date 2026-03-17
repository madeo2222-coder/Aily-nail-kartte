"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function CustomerForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [lineName, setLineName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [allergy, setAllergy] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!name.trim()) {
      alert("名前を入力してください。");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("customers").insert([
      {
        name: name.trim(),
        phone: phone.trim() || null,
        line_name: lineName.trim() || null,
        birthday: birthday || null,
        allergy: allergy.trim() || null,
        notes: notes.trim() || null,
      },
    ]);

    setLoading(false);

    if (error) {
      console.error("顧客登録エラー:", error);
      alert(`登録に失敗しました: ${error.message}`);
      return;
    }

    alert("顧客を登録しました。");
    window.location.href = "/list";
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div
        style={{
          background: "#fee2e2",
          color: "#b91c1c",
          padding: "10px 12px",
          borderRadius: "12px",
          fontSize: "14px",
          fontWeight: 700,
        }}
      >
        NEW FORM ACTIVE
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label style={labelStyle}>名前</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="山田花子"
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label style={labelStyle}>電話番号</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="09012345678"
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label style={labelStyle}>LINE名</label>
        <input
          value={lineName}
          onChange={(e) => setLineName(e.target.value)}
          placeholder="LINEでの表示名"
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label style={labelStyle}>誕生日</label>
        <input
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label style={labelStyle}>アレルギー</label>
        <input
          value={allergy}
          onChange={(e) => setAllergy(e.target.value)}
          placeholder="例: アセトン、金属、魚 など"
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label style={labelStyle}>メモ</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="好み、注意点、接客メモなど"
          rows={4}
          style={textareaStyle}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          background: "#0f172a",
          color: "#ffffff",
          border: "none",
          borderRadius: "12px",
          padding: "14px 18px",
          fontSize: "16px",
          fontWeight: 700,
          cursor: "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "登録中..." : "登録する"}
      </button>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#111827",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "16px",
  background: "#ffffff",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "16px",
  background: "#ffffff",
  resize: "vertical",
};