export default function PaymentUrlForm() {
  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="text-sm font-bold text-amber-800">
        カード決済は現在準備中です
      </div>
      <p className="mt-2 text-sm leading-6 text-amber-900">
        見積メールには決済URLは含まれません。お支払い方法についてはAily Nail Studioへお問い合わせください。
      </p>
    </div>
  );
}
