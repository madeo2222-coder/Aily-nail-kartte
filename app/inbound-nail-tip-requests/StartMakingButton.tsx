"use client";

type Props = {
  requestId: string;
};

export default function StartMakingButton({ requestId }: Props) {
  async function handleClick() {
    const ok = confirm("制作中に変更しますか？");
    if (!ok) return;

    const response = await fetch(
      `/api/inbound-nail-tip-requests/${requestId}/start-making`,
      {
        method: "POST",
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      alert(data.error || "更新失敗");
      return;
    }

    alert("制作中に更新しました");
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-3 w-full rounded-xl bg-purple-600 px-4 py-3 font-bold text-white"
    >
      制作開始にする
    </button>
  );
}