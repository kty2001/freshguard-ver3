import { NextRequest, NextResponse } from "next/server";
import { recognizeWithVLM } from "@/lib/vlm";
import { matchExpiry } from "@/lib/expiryDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const enriched = result.items.map((it) => {
      const m = matchExpiry(it.label);
      return {
        ...it,
        matched: m.matched,
        db_food_name: m.row?.food_name ?? null,
        expiry_days_default: m.row?.expiry_days_default ?? null,
        category: m.row?.category ?? null,
        storage_type: m.row?.storage_type ?? null,
      };
    });

    return NextResponse.json({
      model: result.model,
      raw: result.raw,
      items: enriched,
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
