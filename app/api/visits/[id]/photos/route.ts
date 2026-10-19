import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { authenticateStaffApi } from "@/lib/server/staffApiAuthentication";

export const dynamic = "force-dynamic";

const VISIT_PHOTO_BUCKET = "visit-photos";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_FILENAME_PATTERN =
  /^photo-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PhotoInput = {
  imageUrl: string;
  photoType: "after";
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function parsePhotoUrl(value: unknown, visitId: string, supabaseUrl: string) {
  if (typeof value !== "string") return null;

  try {
    const photoUrl = new URL(value);
    const projectUrl = new URL(supabaseUrl);
    const decodedPath = decodeURIComponent(photoUrl.pathname);
    const prefix = `/storage/v1/object/public/${VISIT_PHOTO_BUCKET}/${visitId}/`;
    const filename = decodedPath.startsWith(prefix)
      ? decodedPath.slice(prefix.length)
      : "";

    if (
      photoUrl.origin !== projectUrl.origin ||
      photoUrl.search ||
      photoUrl.hash ||
      !PHOTO_FILENAME_PATTERN.test(filename)
    ) {
      return null;
    }

    return photoUrl.toString();
  } catch {
    return null;
  }
}

function parseBody(value: unknown, visitId: string, supabaseUrl: string) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("salonId" in value) ||
    typeof value.salonId !== "string" ||
    !UUID_PATTERN.test(value.salonId) ||
    !("photos" in value) ||
    !Array.isArray(value.photos) ||
    value.photos.length < 1 ||
    value.photos.length > 10
  ) {
    return null;
  }

  const photos: PhotoInput[] = [];
  const seenUrls = new Set<string>();

  for (const photo of value.photos) {
    if (
      typeof photo !== "object" ||
      photo === null ||
      !("imageUrl" in photo) ||
      !("photoType" in photo) ||
      photo.photoType !== "after"
    ) {
      return null;
    }

    const imageUrl = parsePhotoUrl(photo.imageUrl, visitId, supabaseUrl);
    if (!imageUrl || seenUrls.has(imageUrl)) return null;

    seenUrls.add(imageUrl);
    photos.push({ imageUrl, photoType: "after" });
  }

  return { salonId: value.salonId, photos };
}

export async function POST(request: Request, context: RouteContext) {
  const { id: visitId } = await context.params;
  if (!UUID_PATTERN.test(visitId)) {
    return errorResponse("来店情報を確認できません。", 400);
  }

  const authentication = await authenticateStaffApi({
    allowedRoles: ["owner", "staff"],
    legacyAllowed: true,
    salonContextRequired: false,
  });

  if (!authentication.ok) {
    return errorResponse(authentication.error, authentication.status);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseUrl || !supabaseAdmin) {
    return errorResponse("写真情報を保存できませんでした。", 500);
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return errorResponse("写真情報を確認できません。", 400);
  }

  const parsedBody = parseBody(requestBody, visitId, supabaseUrl);
  if (!parsedBody) {
    return errorResponse("写真情報を確認できません。", 400);
  }

  const principalSalonId =
    authentication.principal.authenticationMode === "supabase"
      ? authentication.principal.salonId
      : null;

  if (principalSalonId && parsedBody.salonId !== principalSalonId) {
    return errorResponse("この操作を行う権限がありません。", 403);
  }

  try {
    let visitQuery = supabaseAdmin
      .from("visits")
      .select("id, salon_id")
      .eq("id", visitId);

    if (principalSalonId) {
      visitQuery = visitQuery.eq("salon_id", principalSalonId);
    }

    const visitResult = await visitQuery.limit(2);
    const visits = visitResult.data || [];

    if (
      visitResult.error ||
      visits.length !== 1 ||
      visits[0].id !== visitId ||
      visits[0].salon_id !== parsedBody.salonId
    ) {
      return errorResponse("来店情報を確認できません。", 404);
    }

    const photoRows = parsedBody.photos.map((photo) => ({
      visit_id: visitId,
      salon_id: parsedBody.salonId,
      image_url: photo.imageUrl,
      photo_type: photo.photoType,
    }));
    const photoResult = await supabaseAdmin.from("visit_photos").insert(photoRows);

    if (photoResult.error) {
      return errorResponse("写真情報を保存できませんでした。", 500);
    }

    return NextResponse.json(
      { ok: true, photoCount: photoRows.length },
      { status: 201 },
    );
  } catch {
    return errorResponse("写真情報を保存できませんでした。", 500);
  }
}
