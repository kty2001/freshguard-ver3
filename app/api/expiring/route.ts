import { NextRequest, NextResponse } from "next/server";
import { daysUntil, expiringSoon } from "@/lib/inventory";
import { getUserId } from "@/lib/userScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function expiryMessage(name: string, daysLeft: number): string {
  if (daysLeft < 0) return `${name}의 유통기한이 ${Math.abs(daysLeft)}일 지났습니다.`;
  if (daysLeft === 0) return `${name}의 유통기한이 오늘까지입니다.`;
  return `${name}의 유통기한이 ${daysLeft}일 남았습니다.`;
}

export async function GET(req: NextRequest) {
  const uid = getUserId(req);
  const { searchParams } = new URL(req.url);
  const threshold = Number(searchParams.get("days") ?? "3");
  const items = expiringSoon(threshold, uid).map((i) => {
    const days_left = daysUntil(i.expires_at);
    const name = i.matched_db_key ?? i.display_name;
    return {
      ...i,
      days_left,
      message: expiryMessage(name, days_left),
    };
  });
  return NextResponse.json({ items, threshold });
}
