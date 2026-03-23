"use client";

import Link from "next/link";

export default function ReceivablesPage() {
  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">未収一覧</h1>
        <Link
          href="/sales-payments"
          className="bg-black text-white px-4 py-3 rounded-2xl text-lg font-bold"
        >
          会計登録
        </Link>
      </div>

      <div className="border-[3px] border-black rounded-2xl p-6 bg-white">
        <p className="text-xl font-bold mb-3">現在この機能は停止中です</p>
        <p className="text-lg mb-2">
          Aily Nail Studio はキャッシュレス中心運用のため、
          未収管理は今は使用していません。
        </p>
        <p className="text-lg text-gray-600">
          今後必要になった時に再実装します。
        </p>
      </div>
    </div>
  );
}