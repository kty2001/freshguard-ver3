import { NextRequest, NextResponse } from "next/server";
import { isValidPhone, normalizePhone } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 전화번호만으로 로그인 — 인증번호 검증 없이 전화번호를 user id 로 받아 쿠키 발급.
// 데이터 스코프는 lib/inventory.ts 가 fg_user 쿠키 값을 키로 data/users/<phone>/ 하위에 분리한다.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rawPhone = String(body?.phone ?? "");
  if (!isValidPhone(rawPhone)) {
    return NextResponse.json(
      { ok: false, error: "전화번호 형식이 올바르지 않습니다" },
      { status: 400 }
    );
  }
  const phone = normalizePhone(rawPhone);

  const res = NextResponse.json({ ok: true, phone });
  res.cookies.set("fg_user", phone, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90일
  });
  return res;
}
