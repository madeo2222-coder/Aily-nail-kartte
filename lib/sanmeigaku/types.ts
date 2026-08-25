export const CALCULATION_VERSION = "fixed-mvp-v1" as const;

export const GENDER_VALUES = [
  "female",
  "male",
  "other",
  "prefer_not_to_say",
] as const;

export const REQUESTED_FORTUNE_VALUES = [
  "恋愛運",
  "仕事運",
  "金運",
  "美容運",
  "人間関係運",
  "全体運",
] as const;

export const PREFERRED_MOOD_VALUES = [
  "上品",
  "可愛い",
  "大人っぽい",
  "華やか",
  "ナチュラル",
  "個性的",
] as const;

export type Gender = (typeof GENDER_VALUES)[number];
export type RequestedFortune = (typeof REQUESTED_FORTUNE_VALUES)[number];
export type PreferredMood = (typeof PREFERRED_MOOD_VALUES)[number];

export type FixedDiagnosisInput = {
  name: string;
  birthDate: string;
  gender: Gender | null;
  requestedFortune: RequestedFortune;
  preferredMood: PreferredMood;
};

export type FixedDiagnosisRecommendation = {
  luckyColor: string;
  luckyStone: string;
  nailTheme: string;
  message: string;
};

export type FixedDiagnosisCalculationResult = {
  schemaVersion: 1;
  calculationVersion: typeof CALCULATION_VERSION;
  classification: "entertainment_nail_suggestion";
  inputUsage: {
    name: true;
    birthDate: true;
    requestedFortune: true;
    preferredMood: true;
    gender: false;
  };
  recommendation: FixedDiagnosisRecommendation;
};

export type FixedDiagnosis = {
  input: FixedDiagnosisInput;
  result: FixedDiagnosisCalculationResult;
};

export type DiagnosisApiResult = {
  id: string;
  name: string;
  birthDate: string;
  gender: Gender | null;
  requestedFortune: RequestedFortune;
  preferredMood: PreferredMood;
  calculationVersion: string;
  luckyColor: string;
  luckyStone: string;
  nailTheme: string;
  message: string;
  createdAt: string | null;
};
