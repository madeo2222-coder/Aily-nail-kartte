"use client";

type Props = {
  requestId: string;
};

export default function SendQuoteButton({ requestId }: Props) {
  async function handleSend() {
    const ok = confirm("見積メールを送信しますか？");
    if (!ok) return;

    const response = await fetch(
      `/api/inbound-nail-tip-requests/${requestId}/send-quote`,
      {
        method: "POST",
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      alert(data.error || "送信失敗");
      return;
    }

    alert("見積メールを送信しました");
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={handleSend}
      className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white"
    >
      見積メール送信
    </button>
  );
}