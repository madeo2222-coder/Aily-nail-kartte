import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        {
          error: "Missing Supabase environment variables",
          hasUrl: !!supabaseUrl,
          hasServiceRoleKey: !!supabaseServiceRoleKey,
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data, error } = await supabase
      .from("expense_import_rows")
      .select(
        `
        id,
        import_id,
        expense_date,
        amount,
        vendor_raw,
        description_raw,
        payment_method,
        receipt_status,
        review_status,
        duplicate_flag,
        matched_expense_id,
        excluded_flag,
        created_at
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase review error:", error);

      return NextResponse.json(
        {
          error: error.message ?? "Supabase query failed",
          details: error.details ?? null,
          hint: error.hint ?? null,
          code: error.code ?? null,
        },
        { status: 500 }
      );
    }

    const rows =
      data?.map((row: any) => ({
        id: row.id,
        import_id: row.import_id ?? null,
        expense_date: row.expense_date ?? null,
        amount:
          typeof row.amount === "number"
            ? row.amount
            : Number(row.amount ?? 0),
        vendor_raw: row.vendor_raw ?? null,
        description_raw: row.description_raw ?? null,
        payment_method: row.payment_method ?? null,
        receipt_status: row.receipt_status ?? null,
        review_status: row.review_status ?? null,
        duplicate_flag:
          typeof row.duplicate_flag === "boolean" ? row.duplicate_flag : false,
        matched_expense_id: row.matched_expense_id ?? null,
        excluded_flag:
          typeof row.excluded_flag === "boolean" ? row.excluded_flag : false,
      })) ?? [];

    return NextResponse.json({
      ok: true,
      rows,
    });
  } catch (error) {
    console.error("review list error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server error while fetching expense review rows",
      },
      { status: 500 }
    );
  }
}