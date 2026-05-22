import { NextRequest, NextResponse } from "next/server";
import { suggestExpiry } from "@/lib/expirySuggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const r = await suggestExpiry(name);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// GET ?name=... 도 지원 (URL bookmark용)
export async function GET(req: NextRequest) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!name.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const r = await suggestExpiry(name);
  return NextResponse.json(r);
}
