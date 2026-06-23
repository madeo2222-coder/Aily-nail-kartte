"use client";

type Props = {
  requestId: string;
};

export default function CompleteButton({ requestId }: Props) {
  async function handleClick() {
    const ok = confirm("この相談を完了にしますか？");
    if (!ok) return;

    const response = await fetch(
      `/api/inbound-nail-tip-requests/${requestId}/complete`,
      {
        method: "POST",
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      alert(data.error || "更新失敗");
      return;
    }

    alert("完了に更新しました");
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-3 w-full rounded-xl bg-slate-700 px-4 py-3 font-bold text-white"
    >
      完了にする
    </button>
  );
}