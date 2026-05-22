import { NextRequest, NextResponse } from "next/server";
import { daysUntil, expiringSoon } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 휴대폰 푸시 알림에서도 그대로 사용할 한국어 문구.
// 예: "사과의 유통기한이 2일 남았습니다."
export function expiryMessage(name: string, daysLeft: number): string {
  if (daysLeft < 0) return `${name}의 유통기한이 ${Math.abs(daysLeft)}일 지났습니다.`;
  if (daysLeft === 0) return `${name}의 유통기한이 오늘까지입니다.`;
  return `${name}의 유통기한이 ${daysLeft}일 남았습니다.`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const threshold = Number(searchParams.get("days") ?? "3");
  const items = expiringSoon(threshold).map((i) => {
    const days_left = daysUntil(i.expires_at);
    const name = i.matched_db_key ?? i.display_name;
    return {
      ...i,
      days_left,
      // 같은 문구가 팝업·푸시 알림 양쪽에서 동일하게 노출됨.
      message: expiryMessage(name, days_left),
    };
  });
  return NextResponse.json({ items, threshold });
}
