import { NextRequest, NextResponse } from "next/server";
import { recognizeWithVLM } from "@/lib/vlm";
import { matchExpiry } from "@/lib/expiryDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hasHangul = (s: string) => /[가-힣]/.test(s);

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "image file is required (multipart field 'image')" },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const result = await recognizeWithVLM(buf);

    // 1) 라벨을 한국어로 정규화. ALIAS 사전(영어→한국어)만 사용하고
    //    유통기한/카테고리/보관법 등 DB 데이터는 응답에 포함하지 않음.
    //    (실제 유통기한은 저장 시점에 LLM에 위임 — addItem 참조)
    const normalized = result.items.map((it) => {
      const m = matchExpiry(it.label);
      const label = m.normalized_key || it.label;
      return {
        label,
        quantity: Math.max(1, Math.round(it.quantity || 1)),
        unit: it.unit || "개",
        confidence: it.confidence ?? 0.7,
      };
    });

    // 2) 한글이 전혀 없는 라벨은 제외 (영문/숫자 잔여물·잡음)
    const korean = normalized.filter((it) => hasHangul(it.label));
    const dropped = normalized.length - korean.length;

    // 3) 같은 라벨끼리 합산 (계란 + 계란 → 계란 ×2)
    const dedup = new Map<string, (typeof korean)[number]>();
    for (const it of korean) {
      const key = it.label.trim();
      const cur = dedup.get(key);
      if (cur) {
        cur.quantity += it.quantity;
        cur.confidence = Math.max(cur.confidence, it.confidence);
      } else {
        dedup.set(key, { ...it });
      }
    }
    const items = Array.from(dedup.values()).sort((a, b) => b.quantity - a.quantity);

    return NextResponse.json({
      model: result.model,
      raw: result.raw,
      items,
      dropped_non_korean: dropped,
      elapsed_ms: result.elapsed_ms,
      normalized_bytes: result.normalized_bytes,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
