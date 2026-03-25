"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
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

    if (error) {
      console.error(error);
      return;
    }

    setLogs(data || []);
  }

  return (
    <div className="p-4">
      <h1 className="mb-6 text-2xl font-bold">LINE送信履歴</h1>

      {logs.length === 0 ? (
        <p>データなし</p>
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