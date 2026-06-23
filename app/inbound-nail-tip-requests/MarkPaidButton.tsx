"use client";

type Props = {
  requestId: string;
};

export default function MarkPaidButton({ requestId }: Props) {
  async function handleClick() {
    const ok = confirm("この相談を支払済みにしますか？");
    if (!ok) return;

    const response = await fetch(
      `/api/inbound-nail-tip-requests/${requestId}/mark-paid`,
      {
        method: "POST",
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      alert(data.error || "更新失敗");
      return;
    }

    alert("支払済みに更新しました");
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
    >
      支払済みにする
    </button>
  );
}