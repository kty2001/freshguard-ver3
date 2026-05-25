import { NextRequest, NextResponse } from "next/server";
import { isValidPhone, normalizePhone, verifyCode } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rawPhone = String(body?.phone ?? "");
  const code = String(body?.code ?? "").trim();
  if (!isValidPhone(rawPhone)) {
    return NextResponse.json({ ok: false, error: "전화번호 형식이 올바르지 않습니다" }, { status: 400 });
  }
  if (!/^\d{4,8}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "코드 형식이 올바르지 않습니다" }, { status: 400 });
  }
  const phone = normalizePhone(rawPhone);
  const result = verifyCode(phone, code);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 401 });
  }

  // 인증 성공 → 서버 측 데이터 스코프용 쿠키 셋(WebView가 이 응답을 받아도 좋지만,
  // 안드로이드 래퍼는 자체적으로 CookieManager 로 셋한 뒤 WebView를 로드한다).
  const res = NextResponse.json({ ok: true, phone });
  res.cookies.set("fg_user", phone, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90일
  });
  return res;
}
