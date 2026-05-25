import { NextRequest, NextResponse } from "next/server";
import { issueCode, isValidPhone, normalizePhone, devCodeEnabled } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rawPhone = String(body?.phone ?? "");
  if (!isValidPhone(rawPhone)) {
    return NextResponse.json({ ok: false, error: "전화번호 형식이 올바르지 않습니다" }, { status: 400 });
  }
  const phone = normalizePhone(rawPhone);
  const { code, expires_at } = issueCode(phone);

  // 실제 SMS 게이트웨이 연동 전까지는 dev_code로 클라이언트에 직접 내려준다.
  // 운영 환경에서는 sendSms(phone, code) 같은 호출로 교체할 것.
  console.log(`[auth] code for ${phone}: ${code}`);

  const payload: Record<string, unknown> = { ok: true, phone, expires_at };
  if (devCodeEnabled()) payload.dev_code = code;
  return NextResponse.json(payload);
}
