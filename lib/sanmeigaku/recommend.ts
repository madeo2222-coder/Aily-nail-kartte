import type {
  FixedDiagnosisRecommendation,
  PreferredMood,
  RequestedFortune,
} from "@/lib/sanmeigaku/types";

const COLORS = [
  "ローズピンク",
  "シャンパンゴールド",
  "ラベンダー",
  "ミルキーホワイト",
  "コーラルオレンジ",
  "ペールブルー",
] as const;

const STONES = [
  "天然ダイヤモンド",
  "ローズクォーツ",
  "シトリン",
  "アメジスト",
  "ムーンストーン",
  "クリスタル",
] as const;

const THEMES = [
  "やわらかいグラデーションに小粒ストーンを合わせたネイル",
  "透明感のあるワンカラーにワンポイントを添えた上品ネイル",
  "肌なじみカラーにポイントビジューを置いた大人可愛いネイル",
  "ラメを控えめに重ねた、明るい印象のきれいめネイル",
  "指先が明るく見えるカラーに天然石風アートを入れたネイル",
  "落ち着いたベースカラーに光を集めるストーンを合わせたネイル",
] as const;

function pick<T>(items: readonly T[], index: number) {
  return items[index % items.length];
}

export function buildFixedRecommendation(
  name: string,
  requestedFortune: RequestedFortune,
  preferredMood: PreferredMood,
  stableIndex: number
): FixedDiagnosisRecommendation {
  const luckyColor = pick(COLORS, stableIndex);
  const luckyStone = pick(STONES, stableIndex + 2);
  const nailTheme = pick(THEMES, stableIndex + 4);

  return {
    luckyColor,
    luckyStone,
    nailTheme,
    message: `${name}様の「${requestedFortune}」と「${preferredMood}」というご希望に合わせた簡易ネイル提案です。${luckyColor}と${luckyStone}を取り入れた${nailTheme}を、次のデザイン選びの参考としてお楽しみください。`,
  };
}
