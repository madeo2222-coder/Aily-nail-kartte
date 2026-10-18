export const VISIT_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const VISIT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

type VisitPhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

export type ValidatedVisitPhoto = {
  file: File;
  contentType: VisitPhotoMimeType;
  extension: "jpg" | "png" | "webp";
};

const MIME_DETAILS: Record<VisitPhotoMimeType, { extension: ValidatedVisitPhoto["extension"] }> = {
  "image/jpeg": { extension: "jpg" },
  "image/png": { extension: "png" },
  "image/webp": { extension: "webp" },
};

function isAllowedMimeType(value: string): value is VisitPhotoMimeType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function hasPrefix(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

function getMimeTypeFromBytes(bytes: Uint8Array): VisitPhotoMimeType | null {
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) && hasPrefix(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp";
  }
  return null;
}

function toValidatedPhoto(file: File, contentType: VisitPhotoMimeType): ValidatedVisitPhoto {
  return { file, contentType, extension: MIME_DETAILS[contentType].extension };
}

export function validateVisitPhotoMetadata(file: File): ValidatedVisitPhoto {
  if (!isAllowedMimeType(file.type)) {
    throw new Error("写真はJPEG・PNG・WebP形式のみ選択できます。");
  }
  if (file.size <= 0) {
    throw new Error("空の写真ファイルは選択できません。");
  }
  if (file.size > VISIT_PHOTO_MAX_BYTES) {
    throw new Error("写真は1枚5MB以下にしてください。");
  }
  return toValidatedPhoto(file, file.type);
}

export async function validateVisitPhotoFile(file: File): Promise<ValidatedVisitPhoto> {
  validateVisitPhotoMetadata(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = getMimeTypeFromBytes(bytes);
  if (!contentType) {
    throw new Error("写真の内容を確認できませんでした。JPEG・PNG・WebPの画像を選択してください。");
  }
  return toValidatedPhoto(file, contentType);
}

export function createVisitPhotoPath(visitId: string, extension: ValidatedVisitPhoto["extension"]) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitId)) {
    throw new Error("写真の保存先を確認できませんでした。");
  }
  return `${visitId}/photo-${crypto.randomUUID()}.${extension}`;
}
