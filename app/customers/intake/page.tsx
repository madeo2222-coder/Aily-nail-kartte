"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CustomerIntakePage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) {
      setMessage("名前は必須です");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("customers").insert([
      {
        name: name.trim(),
        phone: phone.trim() || null,
      },
    ]);

    if (error) {
      console.error("customer intake error:", error);
      setMessage("登録に失敗しました");
      setLoading(false);
      return;
    }

    setMessage("登録完了しました");
    setName("");
    setPhone("");
    setLoading(false);
  };

  return (
    <main style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
        初回登録
      </h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        初回来店のお客様情報を登録します
      </p>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 16,
          padding: 16,
          background: "#fff",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 700,
            }}
          >
            名前
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="お名前を入力"
            style={{
              width: "100%",
              padding: 12,
              border: "1px solid #ccc",
              borderRadius: 10,
              fontSize: 16,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 700,
            }}
          >
            電話番号
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="電話番号を入力"
            style={{
              width: "100%",
              padding: 12,
              border: "1px solid #ccc",
              borderRadius: 10,
              fontSize: 16,
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            border: "none",
            background: "#111",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {loading ? "登録中..." : "登録する"}
        </button>

        {message ? (
          <p style={{ marginTop: 16, color: "#333" }}>{message}</p>
        ) : null}
      </div>
    </main>
  );
}