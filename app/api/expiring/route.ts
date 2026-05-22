import { NextRequest, NextResponse } from "next/server";
import { daysUntil, expiringSoon } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const threshold = Number(searchParams.get("days") ?? "3");
  const items = expiringSoon(threshold).map((i) => ({
    ...i,
    days_left: daysUntil(i.expires_at),
  }));
  return NextResponse.json({ items, threshold });
}
