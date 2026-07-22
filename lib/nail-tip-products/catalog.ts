export type NailTipProduct = {
  code: string;
  name: string;
  startingPrice: number;
  stone: string;
  fortune: string;
};

export const NAIL_TIP_PRODUCTS = [
  {
    code: "ruby_love",
    name: "ルビー開運ネイルチップ",
    startingPrice: 10000,
    stone: "ルビー",
    fortune: "恋愛運・魅力運",
  },
  {
    code: "sapphire_work",
    name: "サファイア仕事運ネイルチップ",
    startingPrice: 10000,
    stone: "サファイア",
    fortune: "仕事運・成功運",
  },
  {
    code: "citrine_money",
    name: "シトリン金運ネイルチップ",
    startingPrice: 10000,
    stone: "シトリン",
    fortune: "金運・商売運",
  },
  {
    code: "diamond_premium",
    name: "ダイヤモンドプレミアムネイルチップ",
    startingPrice: 10000,
    stone: "ダイヤモンド",
    fortune: "総合運・特別運",
  },
] as const satisfies readonly NailTipProduct[];

export function getNailTipProduct(code: string): NailTipProduct | undefined {
  return NAIL_TIP_PRODUCTS.find((product) => product.code === code);
}
