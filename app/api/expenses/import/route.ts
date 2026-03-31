import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SourceType = "credit_card" | "paypay";

type ParsedRow = {
  expense_date: string | null;
  amount: number;
  vendor_raw: string | null;
  description_raw: string | null;
  payment_method: string | null;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, "")
    .replace(/[（）()]/g, "")
    .replace(/・/g, "")
    .toLowerCase();
}

function cleanValue(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/^"(.*)"$/, "$1").trim();
}

function decodeCsv(buffer: Buffer): string {
  const candidates = ["utf-8", "shift_jis", "shift-jis", "cp932"];

  for (const encoding of candidates) {
    try {
      const decoder = new TextDecoder(encoding as any);
      const text = decoder.decode(buffer);

      const looksGood =
        text.includes("利用日") ||
        text.includes("利用日/キャンセル日") ||
        text.includes("利用店名・商品名") ||
        text.includes("利用先") ||
        text.includes("利用金額") ||
        text.includes("明細No.") ||
        text.includes("支払日");

      if (looksGood) {
        return text;
      }
    } catch {
      // ignore
    }
  }

  return buffer.toString("utf8");
}

function parseDate(value: string | null): string | null {
  if (!value) return null;

  const normalized = value
    .replace(/\./g, "/")
    .replace(/-/g, "/")
    .replace(/\s+/g, "");

  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;

  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseAmount(value: string | null): number {
  if (!value) return 0;

  const normalized = value
    .replace(/[¥￥,\s]/g, "")
    .replace(/円/g, "")
    .trim();

  const numberValue = Number(normalized);
  if (Number.isNaN(numberValue)) return 0;

  return numberValue;
}

function isLikelyHeaderRow(cells: string[]): boolean {
  const normalized = cells.map((cell) => normalizeHeader(cell));

  const hasDate =
    normalized.includes("利用日") ||
    normalized.includes("日付") ||
    normalized.includes("利用日/キャンセル日") ||
    normalized.includes("利用日キャンセル日");

  const hasVendor =
    normalized.includes("利用先") ||
    normalized.includes("加盟店") ||
    normalized.includes("加盟店名") ||
    normalized.includes("利用店名商品名");

  const hasAmount =
    normalized.includes("利用金額") ||
    normalized.includes("金額") ||
    normalized.includes("ご利用金額");

  const hasMeisai =
    normalized.includes("明細no.") ||
    normalized.includes("明細no") ||
    normalized.includes("明細ｎｏ.") ||
    normalized.includes("明細ｎｏ");

  return (hasDate && hasVendor && hasAmount) || (hasMeisai && hasDate && hasAmount);
}

function findHeaderRowIndex(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 40); i += 1) {
    const cells = parseCsvLine(lines[i]);
    if (isLikelyHeaderRow(cells)) {
      return i;
    }
  }
  return -1;
}

function parseCsvText(csvText: string, sourceType: SourceType): ParsedRow[] {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) return [];

  const headerRowIndex = findHeaderRowIndex(lines);
  if (headerRowIndex === -1) {
    return [];
  }

  const rawHeaders = parseCsvLine(lines[headerRowIndex]).map((h) =>
    normalizeHeader(h)
  );

  const dateIndex = rawHeaders.findIndex(
    (h) =>
      h === "利用日" ||
      h === "日付" ||
      h === "利用日/キャンセル日" ||
      h === "利用日キャンセル日"
  );

  const vendorIndex = rawHeaders.findIndex(
    (h) =>
      h === "利用先" ||
      h === "加盟店" ||
      h === "加盟店名" ||
      h === "利用店名商品名"
  );

  const amountIndex = rawHeaders.findIndex(
    (h) => h === "利用金額" || h === "金額" || h === "ご利用金額"
  );

  const descriptionIndex = rawHeaders.findIndex(
    (h) =>
      h === "摘要" ||
      h === "内容" ||
      h === "利用内容" ||
      h === "利用店名商品名"
  );

  if (dateIndex === -1 || vendorIndex === -1 || amountIndex === -1) {
    return [];
  }

  const parsedRows: ParsedRow[] = [];

  for (let i = headerRowIndex + 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);

    const dateValue = cleanValue(values[dateIndex]);
    const vendorValue = cleanValue(values[vendorIndex]);
    const amountValue = cleanValue(values[amountIndex]);
    const descriptionValue =
      descriptionIndex >= 0 ? cleanValue(values[descriptionIndex]) : "";

    const expenseDate = parseDate(dateValue);
    const amount = parseAmount(amountValue);
    const vendor = vendorValue.trim();

    if (!expenseDate || amount <= 0 || !vendor) {
      continue;
    }

    // PayPayのチャージは経費候補から除外
    if (vendor === "チャージ") {
      continue;
    }

    parsedRows.push({
      expense_date: expenseDate,
      amount,
      vendor_raw: vendor,
      description_raw: descriptionValue || vendor,
      payment_method: sourceType,
    });
  }

  return parsedRows;
}

function buildDuplicateKey(row: ParsedRow): string {
  return [
    row.expense_date ?? "",
    String(row.amount),
    (row.vendor_raw ?? "").toLowerCase(),
  ].join("|");
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Supabase環境変数が不足しています" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const formData = await req.formData();
    const sourceType = formData.get("sourceType");
    const file = formData.get("file");

    if (sourceType !== "credit_card" && sourceType !== "paypay") {
      return NextResponse.json(
        { error: "取込元が不正です" },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSVファイルが選択されていません" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const csvText = decodeCsv(buffer);

    const parsedRows = parseCsvText(csvText, sourceType);

    if (parsedRows.length === 0) {
      return NextResponse.json(
        {
          error: "CSVから有効な明細を読み取れませんでした",
        },
        { status: 400 }
      );
    }

    const { data: importData, error: importError } = await supabase
      .from("expense_imports")
      .insert([
        {
          source_type: sourceType,
          file_name: file.name,
          row_count: parsedRows.length,
        },
      ])
      .select("id")
      .single();

    if (importError || !importData) {
      return NextResponse.json(
        {
          error: importError?.message || "取込親データの保存に失敗しました",
        },
        { status: 500 }
      );
    }

    const duplicateMap = new Map<string, number>();

    for (const row of parsedRows) {
      const key = buildDuplicateKey(row);
      duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1);
    }

    const rowsToInsert = parsedRows.map((row) => {
      const key = buildDuplicateKey(row);
      const isDuplicateInCsv = (duplicateMap.get(key) ?? 0) > 1;

      return {
        import_id: importData.id,
        expense_date: row.expense_date,
        amount: row.amount,
        vendor_raw: row.vendor_raw,
        description_raw: row.description_raw,
        payment_method: row.payment_method,
        receipt_status: "unchecked",
        review_status: isDuplicateInCsv ? "duplicate" : "unreviewed",
        duplicate_flag: isDuplicateInCsv,
        excluded_flag: false,
      };
    });

    const { error: rowsError } = await supabase
      .from("expense_import_rows")
      .insert(rowsToInsert);

    if (rowsError) {
      return NextResponse.json(
        { error: rowsError.message || "取込明細の保存に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      sourceType,
      rowCount: parsedRows.length,
      fileName: file.name,
    });
  } catch (error) {
    console.error("CSV import error:", error);

    return NextResponse.json(
      { error: "CSV取込中にサーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}