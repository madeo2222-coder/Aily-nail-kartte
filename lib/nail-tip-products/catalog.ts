export type NailTipProduct = {
  code: string;
  name: string;
  price: number;
  stone: string;
  fortune: string;
};

export const NAIL_TIP_PRODUCTS = [
  {
    code: "ruby_love",
    name: "ルビー開運ネイルチップ",
    price: 19800,
    stone: "ルビー",
    fortune: "恋愛運・魅力運",
  },
  {
    code: "sapphire_work",
    name: "サファイア仕事運ネイルチップ",
    price: 19800,
    stone: "サファイア",
    fortune: "仕事運・成功運",
  },
  {
    code: "citrine_money",
    name: "シトリン金運ネイルチップ",
    price: 19800,
    stone: "シトリン",
    fortune: "金運・商売運",
  },
  {
    code: "diamond_premium",
    name: "ダイヤモンドプレミアムネイルチップ",
    price: 29800,
    stone: "ダイヤモンド",
    fortune: "総合運・特別運",
  },
] as const satisfies readonly NailTipProduct[];

export function getNailTipProduct(code: string): NailTipProduct | undefined {
  return NAIL_TIP_PRODUCTS.find((product) => product.code === code);
}
