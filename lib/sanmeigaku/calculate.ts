import {
  CALCULATION_VERSION,
  GENDER_VALUES,
  PREFERRED_MOOD_VALUES,
  REQUESTED_FORTUNE_VALUES,
  type FixedDiagnosis,
  type FixedDiagnosisInput,
  type Gender,
  type PreferredMood,
  type RequestedFortune,
} from "@/lib/sanmeigaku/types";
import { buildFixedRecommendation } from "@/lib/sanmeigaku/recommend";

const MIN_BIRTH_DATE = "1900-01-01";

export class DiagnosisValidationError extends Error {}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isMember<T extends string>(
  value: string,
  values: readonly T[]
): value is T {
  return values.some((item) => item === value);
}

function validateBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DiagnosisValidationError("生年月日を正しく入力してください");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isRealDate || value < MIN_BIRTH_DATE) {
    throw new DiagnosisValidationError(
      "生年月日は1900年1月1日以降の実在する日付を入力してください"
    );
  }

  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const todayMap = new Map(
    todayParts.map((part) => [part.type, part.value])
  );
  const today = `${todayMap.get("year")}-${todayMap.get("month")}-${todayMap.get("day")}`;

  if (value > today) {
    throw new DiagnosisValidationError("未来の生年月日は入力できません");
  }
}

export function parseFixedDiagnosisInput(body: unknown): FixedDiagnosisInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DiagnosisValidationError("入力内容を確認してください");
  }

  const record = body as Record<string, unknown>;
  const name = normalizeText(record.name);
  const birthDate = normalizeText(record.birthDate);
  const genderValue = normalizeText(record.gender);
  const requestedFortuneValue = normalizeText(record.requestedFortune);
  const preferredMoodValue = normalizeText(record.preferredMood);

  if (name.length < 1 || name.length > 100) {
    throw new DiagnosisValidationError("お名前は100文字以内で入力してください");
  }

  validateBirthDate(birthDate);

  if (genderValue && !isMember(genderValue, GENDER_VALUES)) {
    throw new DiagnosisValidationError("性別の選択内容を確認してください");
  }

  if (!isMember(requestedFortuneValue, REQUESTED_FORTUNE_VALUES)) {
    throw new DiagnosisValidationError("上げたい運気の選択内容を確認してください");
  }

  if (!isMember(preferredMoodValue, PREFERRED_MOOD_VALUES)) {
    throw new DiagnosisValidationError("好きな雰囲気の選択内容を確認してください");
  }

  return {
    name,
    birthDate,
    gender: (genderValue || null) as Gender | null,
    requestedFortune: requestedFortuneValue as RequestedFortune,
    preferredMood: preferredMoodValue as PreferredMood,
  };
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function calculateFixedDiagnosis(
  input: FixedDiagnosisInput
): FixedDiagnosis {
  // Gender is intentionally excluded from fixed-mvp-v1. A future, validated
  // calculation version can use it without changing the stored input format.
  const canonicalInput = [
    CALCULATION_VERSION,
    input.name,
    input.birthDate,
    input.requestedFortune,
    input.preferredMood,
  ].join("\u001f");
  const stableIndex = stableHash(canonicalInput);
  const recommendation = buildFixedRecommendation(
    input.name,
    input.requestedFortune,
    input.preferredMood,
    stableIndex
  );

  return {
    input,
    result: {
      schemaVersion: 1,
      calculationVersion: CALCULATION_VERSION,
      classification: "entertainment_nail_suggestion",
      inputUsage: {
        name: true,
        birthDate: true,
        requestedFortune: true,
        preferredMood: true,
        gender: false,
      },
      recommendation,
    },
  };
}
