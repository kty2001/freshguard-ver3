import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readBudget, writeBudget } from "@/lib/inventory";
import { getUserId } from "@/lib/userScope";
import type { BudgetEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uid = getUserId(req);
  const entries = readBudget(uid);
  const total = entries.reduce((s, e) => s + e.amount_krw, 0);
  return NextResponse.json({ entries, total });
}

export async function POST(req: NextRequest) {
  const uid = getUserId(req);
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const amount = Number(body?.amount_krw);
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: "amount_krw must be > 0" }, { status: 400 });
  const entries = readBudget(uid);
  const entry: BudgetEntry = {
    id: randomUUID(),
    name,
    amount_krw: Math.round(amount),
    added_at: new Date().toISOString(),
    item_id: typeof body?.item_id === "string" ? body.item_id : undefined,
    memo: typeof body?.memo === "string" ? body.memo : undefined,
  };
  entries.push(entry);
  writeBudget(entries, uid);
  return NextResponse.json({ entry });
}

export async function DELETE(req: NextRequest) {
  const uid = getUserId(req);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const entries = readBudget(uid).filter((e) => e.id !== id);
  writeBudget(entries, uid);
  return NextResponse.json({ ok: true });
}
