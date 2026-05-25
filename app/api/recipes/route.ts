import { NextRequest, NextResponse } from "next/server";
import { suggestMenus } from "@/lib/recipe";
import { expiringSoon, readItems } from "@/lib/inventory";
import { getUserId } from "@/lib/userScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const uid = getUserId(req);
    const body = await req.json().catch(() => ({}));
    const threshold = Number(body.threshold ?? 3);
    const allergies = Array.isArray(body.allergies) ? body.allergies : [];
    // RE-05: 사용자가 체크한 임박 재료만 must_use로 전달.
    const must_use: string[] = Array.isArray(body.must_use)
      ? body.must_use.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
      : [];

    const all = readItems(uid).filter((i) => !i.is_consumed);
    const expiring = expiringSoon(threshold, uid);

    if (all.length === 0) {
      return NextResponse.json(
        { error: "재고가 비어 있습니다. 먼저 식재료를 등록하세요." },
        { status: 400 }
      );
    }

    const result = await suggestMenus({ expiring, all, allergies, must_use });

    return NextResponse.json({
      suggestions: result.suggestions,
      model: result.model,
      elapsed_ms: result.elapsed_ms,
      raw: result.raw,
      expiring_count: expiring.length,
      must_use,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
