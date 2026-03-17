"use client";

import { useState } from "react";

type Props = {
  photos: string[];
};

export default function PhotoGallery({ photos }: Props) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  if (!photos || photos.length === 0) {
    return (
      <p style={{ marginTop: 8, color: "#6b7280", fontSize: "14px" }}>
        写真なし
      </p>
    );
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {photos.map((url, index) => (
          <button
            key={`${url}-${index}`}
            type="button"
            onClick={() => setSelectedUrl(url)}
            className="shrink-0"
          >
            <img
              src={url}
              alt={`ネイル写真 ${index + 1}`}
              className="h-24 w-24 rounded-xl object-cover border border-gray-200"
            />
          </button>
        ))}
      </div>

      {selectedUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedUrl(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-2 top-2 rounded-full bg-white px-3 py-1 text-sm font-bold text-black shadow"
              onClick={() => setSelectedUrl(null)}
            >
              ×
            </button>

            <img
              src={selectedUrl}
              alt="拡大写真"
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}