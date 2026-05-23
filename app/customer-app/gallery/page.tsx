"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type VisitPhotoRow = {
  id: string;
  visit_id: string;
  salon_id: string | null;
  image_url: string | null;
  photo_type: string | null;
  created_at: string | null;
};

type VisitRow = {
  id: string;
  visit_date: string | null;
  menu_name: string | null;
  menu: string | null;
  color: string | null;
  memo: string | null;
};

type GalleryItem = {
  id: string;
  visitId: string;
  imageUrl: string;
  menuName: string;
  color: string;
  visitMonth: string;
  createdAt: string | null;
};

const navItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "gallery", label: "ギャラリー", icon: "💅", href: "/customer-app/gallery" },
  { key: "diagnosis", label: "診断", icon: "✨", href: "/customer-app/sanmeigaku" },
  { key: "mypage", label: "マイ", icon: "👤", href: "/customer-app/mypage" },
];

function formatMonth(value: string | null) {
  if (!value) return "施術月未登録";

  const normalized = value.trim().replace(/\//g, "-");
  const matched = normalized.match(/^(\d{4})-(\d{2})/);

  if (matched) {
    return `${matched[1]}年${Number(matched[2])}月`;
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return "施術月未登録";
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function getDisplayMenu(visit: VisitRow | undefined) {
  if (!visit) return "デザイン";
  if (visit.menu_name?.trim()) return visit.menu_name;
  if (visit.menu?.trim()) return visit.menu;
  return "デザイン";
}

function getDisplayColor(visit: VisitRow | undefined) {
  if (!visit) return "";
  if (visit.color?.trim()) return visit.color.trim();
  return "";
}

export default function CustomerAppGalleryPage() {
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<VisitPhotoRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchGallery() {
      setLoading(true);
      setMessage("");

      try {
        const { data: photoData, error: photoError } = await supabase
          .from("visit_photos")
          .select("id, visit_id, salon_id, image_url, photo_type, created_at")
          .not("image_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(80);

        if (photoError) {
          console.error("visit_photos取得エラー:", photoError);
          setPhotos([]);
          setVisits([]);
          setMessage("ギャラリー写真の取得に失敗しました。");
          setLoading(false);
          return;
        }

        const nextPhotos = ((photoData || []) as VisitPhotoRow[]).filter(
          (photo) => photo.image_url && photo.visit_id
        );

        setPhotos(nextPhotos);

        const visitIds = Array.from(
          new Set(nextPhotos.map((photo) => photo.visit_id).filter(Boolean))
        );

        if (visitIds.length === 0) {
          setVisits([]);
          setLoading(false);
          return;
        }

        const { data: visitData, error: visitError } = await supabase
          .from("visits")
          .select("id, visit_date, menu_name, menu, color, memo")
          .in("id", visitIds);

        if (visitError) {
          console.error("visits取得エラー:", visitError);
          setVisits([]);
        } else {
          setVisits((visitData || []) as VisitRow[]);
        }
      } catch (error) {
        console.error("gallery取得エラー:", error);
        setMessage("ギャラリーの取得中にエラーが発生しました。");
      } finally {
        setLoading(false);
      }
    }

    fetchGallery();
  }, []);

  const visitMap = useMemo(() => {
    const map = new Map<string, VisitRow>();

    visits.forEach((visit) => {
      map.set(visit.id, visit);
    });

    return map;
  }, [visits]);

  const galleryItems = useMemo<GalleryItem[]>(() => {
    return photos
      .map((photo) => {
        const visit = visitMap.get(photo.visit_id);

        if (!photo.image_url) {
          return null;
        }

        return {
          id: photo.id,
          visitId: photo.visit_id,
          imageUrl: photo.image_url,
          menuName: getDisplayMenu(visit),
          color: getDisplayColor(visit),
          visitMonth: formatMonth(visit?.visit_date || photo.created_at),
          createdAt: photo.created_at,
        };
      })
      .filter((item): item is GalleryItem => Boolean(item));
  }, [photos, visitMap]);

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY GALLERY
          </div>

          <h1 className="mt-2 text-2xl font-bold leading-tight">
            Aily Gallery
          </h1>

          <p className="mt-3 text-sm leading-6 text-white/90">
            施術後のネイルデザインを一覧で見られます。次回予約の参考にしてください。
          </p>

          <Link
            href="/customer-app/reserve"
            className="mt-4 block rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-rose-500"
          >
            予約する
          </Link>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-bold text-slate-900">
                デザイン一覧
              </div>
              <div className="mt-1 text-xs text-slate-500">
                顧客名などの個人情報は表示しません。
              </div>
            </div>

            <div className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-600">
              {galleryItems.length}枚
            </div>
          </div>
        </section>

        {message ? (
          <section className="rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-700 shadow-sm">
            {message}
          </section>
        ) : null}

        {loading ? (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">読み込み中...</div>
          </section>
        ) : galleryItems.length === 0 ? (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">
              まだギャラリーに表示できる写真がありません。
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-2 gap-3">
            {galleryItems.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-3xl border bg-white shadow-sm"
              >
                <a href={item.imageUrl} target="_blank" rel="noreferrer">
                  <img
                    src={item.imageUrl}
                    alt="Aily Gallery 施術デザイン"
                    className="h-44 w-full object-cover"
                  />
                </a>

                <div className="space-y-2 p-3">
                  <div className="text-sm font-bold leading-5 text-slate-900">
                    {item.menuName}
                  </div>

                  {item.color ? (
                    <div className="text-xs leading-5 text-slate-500">
                      カラー：{item.color}
                    </div>
                  ) : null}

                  <div className="text-xs text-slate-400">
                    {item.visitMonth}
                  </div>

                  <Link
                    href={`/customer-app/reserve?design=${item.visitId}`}
                    className="block rounded-2xl bg-slate-900 px-3 py-2 text-center text-xs font-bold text-white"
                  >
                    このデザインで予約
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {navItems.map((item) => {
            const isActive = item.key === "gallery";

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium transition ${
                  isActive
                    ? "bg-rose-50 text-rose-500"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="mt-1 leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </main>
  );
}