import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function toSafeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getMonthRange(month: string) {
  const [year, m] = month.split("/");

  const start = new Date(Number(year), Number(m) - 1, 1);
  const end = new Date(Number(year), Number(m), 1);

  const format = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  return {
    from: format(start),
    to: format(end),
  };
}

export async function POST(req: Request) {
  try {
    const { month } = await req.json();

    if (!month) {
      return NextResponse.json({ error: "month required" }, { status: 400 });
    }

    const { from, to } = getMonthRange(month);

    const { data: visits, error: visitsError } = await supabase
      .from("visits")
      .select("*")
      .gte("visit_date", from)
      .lt("visit_date", to);

    if (visitsError) {
      return NextResponse.json(
        { error: `visits error: ${visitsError.message}` },
        { status: 500 }
      );
    }

    const { data: expenses, error: expensesError } = await supabase
      .from("expenses")
      .select("*")
      .gte("expense_date", from)
      .lt("expense_date", to);

    if (expensesError) {
      return NextResponse.json(
        { error: `expenses error: ${expensesError.message}` },
        { status: 500 }
      );
    }

    const safeVisits = visits ?? [];
    const safeExpenses = expenses ?? [];

    const totalSales = safeVisits.reduce(
      (sum, v) => sum + toSafeNumber(v.price),
      0
    );

    const totalExpenses = safeExpenses.reduce(
      (sum, e) => sum + toSafeNumber(e.amount),
      0
    );

    const visitCount = safeVisits.length;
    const expenseCount = safeExpenses.length;
    const profit = totalSales - totalExpenses;
    const avgUnitPrice = visitCount > 0 ? totalSales / visitCount : 0;

    const categoryMap = new Map<string, number>();

    safeExpenses.forEach((e) => {
      const rawCategory = e.category;
      const category =
        typeof rawCategory === "string" && rawCategory.trim().length > 0
          ? rawCategory.trim()
          : "未分類";

      const amount = toSafeNumber(e.amount);
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + amount);
    });

    const categoryRows = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percent: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      success: true,
      data: {
        month,
        totalSales,
        totalExpenses,
        profit,
        visitCount,
        expenseCount,
        avgUnitPrice,
        categoryRows,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}