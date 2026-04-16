import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type PaymentRow = {
  id: string;
  visit_id: string;
  payment_method: string | null;
  amount: number | null;
  sort_order: number | null;
};

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

function normalizePaymentMethod(value: unknown) {
  if (typeof value !== "string") return "未設定";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "未設定";
}

function isCashlessMethod(method: string) {
  if (method === "現金") return false;
  if (method === "ホットペッパーポイント") return false;
  return true;
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

    const visitIds = safeVisits
      .map((visit) => String(visit.id ?? ""))
      .filter((id) => id.length > 0);

    let paymentMethodRows: {
      paymentMethod: string;
      amount: number;
      percent: number;
      type: "cash" | "cashless" | "point" | "other";
    }[] = [];

    let cashSales = 0;
    let cashlessSales = 0;
    let pointSales = 0;

    if (visitIds.length > 0) {
      const { data: paymentData, error: paymentError } = await supabase
        .from("visit_payments")
        .select("id, visit_id, payment_method, amount, sort_order")
        .in("visit_id", visitIds)
        .order("sort_order", { ascending: true });

      if (paymentError) {
        return NextResponse.json(
          { error: `visit_payments error: ${paymentError.message}` },
          { status: 500 }
        );
      }

      const paymentRows = (paymentData ?? []) as PaymentRow[];
      const paymentMap = new Map<string, number>();

      paymentRows.forEach((row) => {
        const method = normalizePaymentMethod(row.payment_method);
        const amount = toSafeNumber(row.amount);
        paymentMap.set(method, (paymentMap.get(method) ?? 0) + amount);
      });

      const paymentTotal = Array.from(paymentMap.values()).reduce(
        (sum, amount) => sum + amount,
        0
      );

      paymentMethodRows = Array.from(paymentMap.entries())
        .map(([paymentMethod, amount]) => {
          let type: "cash" | "cashless" | "point" | "other" = "other";

          if (paymentMethod === "現金") {
            type = "cash";
            cashSales += amount;
          } else if (paymentMethod === "ホットペッパーポイント") {
            type = "point";
            pointSales += amount;
          } else if (isCashlessMethod(paymentMethod)) {
            type = "cashless";
            cashlessSales += amount;
          }

          return {
            paymentMethod,
            amount,
            percent: paymentTotal > 0 ? (amount / paymentTotal) * 100 : 0,
            type,
          };
        })
        .sort((a, b) => b.amount - a.amount);
    }

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
        cashSales,
        cashlessSales,
        pointSales,
        paymentMethodRows,
      },
    });
  } catch (error) {
    console.error("generate-report route error:", error);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}