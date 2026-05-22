import { NextRequest, NextResponse } from "next/server";
import { addItem, daysUntil, readItems, removeItem } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = readItems()
    .map((i) => ({ ...i, days_left: daysUntil(i.expires_at) }))
    .sort((a, b) => a.days_left - b.days_left);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // body: { items: [{display_name, quantity?, unit?, manual_expiry_days?, manual?}] } or single
  const inputs = Array.isArray(body.items)
    ? body.items
    : [body];

  const created = [];
  for (const inp of inputs) {
    if (!inp.display_name || typeof inp.display_name !== "string") continue;
    created.push(addItem(inp));
  }
  return NextResponse.json({ created });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = removeItem(id);
  return NextResponse.json({ ok });
}
