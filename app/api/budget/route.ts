import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readBudget } from "@/lib/inventory";
import type { BudgetEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUDGET_PATH = path.join(process.cwd(), "data", "budget.json");

export async function GET() {
  const entries = readBudget();
  const total = entries.reduce((s, e) => s + e.amount_krw, 0);
  return NextResponse.json({ entries, total });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const amount = Number(body?.amount_krw);
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: "amount_krw must be > 0" }, { status: 400 });
  const entries = readBudget();
  const entry: BudgetEntry = {
    id: randomUUID(),
    name,
    amount_krw: Math.round(amount),
    added_at: new Date().toISOString(),
    item_id: typeof body?.item_id === "string" ? body.item_id : undefined,
    memo: typeof body?.memo === "string" ? body.memo : undefined,
  };
  entries.push(entry);
  fs.writeFileSync(BUDGET_PATH, JSON.stringify(entries, null, 2), "utf8");
  return NextResponse.json({ entry });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const entries = readBudget().filter((e) => e.id !== id);
  fs.writeFileSync(BUDGET_PATH, JSON.stringify(entries, null, 2), "utf8");
  return NextResponse.json({ ok: true });
}
