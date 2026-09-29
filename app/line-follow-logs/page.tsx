"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Log = {
  id: string;
  created_at: string;
  log_type: string;
  message_pattern: string;
  signature_type: string;
  message_body: string;
  customers?: {
    name: string;
  };
};

export default function LineFollowLogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const requestIdRef = useRef(0);

  const fetchLogs = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("line_follow_logs")
        .select(
          `
          *,
          customers (
            name
          )
        `
        )
        .order("created_at", { ascending: false });

      if (requestId !== requestIdRef.current) return;

      if (error) throw error;

      setLogs(data || []);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      console.error(error);
      setLogs([]);
      setErrorMessage(
        "LINE送信履歴を取得できませんでした。通信状態を確認して再試行してください。"
      );
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchLogs);

    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchLogs]);

  return (
    <div className="p-4">
      <h1 className="mb-6 text-2xl font-bold">LINE送信履歴</h1>

      {loading ? (
        <p>読み込み中...</p>
      ) : errorMessage ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
        >
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => void fetchLogs()}
            className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 font-medium"
          >
            再試行
          </button>
        </div>
      ) : logs.length === 0 ? (
        <p>送信履歴はありません</p>
      ) : (
        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="border p-4 rounded-xl">
              <p className="text-sm text-gray-500">
                {new Date(log.created_at).toLocaleString()}
              </p>

              <p className="font-bold text-lg">
                {log.customers?.name || "不明"}
              </p>

              <p className="text-sm">
                種類：
                {log.log_type === "copy" ? "コピー" : "LINE送信"}
              </p>

              <p className="text-sm">
                パターン：{log.message_pattern}
              </p>

              <p className="text-sm mb-2">
                署名：{log.signature_type}
              </p>

              <div className="text-xs bg-gray-100 p-2 rounded">
                {log.message_body}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
