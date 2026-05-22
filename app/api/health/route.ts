import { NextResponse } from "next/server";
import { health } from "@/lib/vlmServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ver3: 휴대폰에서 VLM 서버까지의 라우팅이 살아있는지 확인하기 위한 헬스 엔드포인트.
export async function GET() {
  const h = await health();
  return NextResponse.json(h, {
    status: h.reachable && h.ok ? 200 : 503,
  });
}
