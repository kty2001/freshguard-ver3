import { NextRequest, NextResponse } from "next/server";
import { consumeItem } from "@/lib/inventory";
import type { RemoveKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asKind(v: any): RemoveKind {
  if (v === "disposed" || v === "mistake") return v;
  return "eaten";
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id: string | undefined = body?.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const kind = asKind(body?.kind);
  const weight_g = typeof body?.weight_g === "number" ? body.weight_g : undefined;
  const log = consumeItem(id, kind, weight_g);
  if (kind === "mistake") return NextResponse.json({ ok: true, kind });
  if (!log)
    return NextResponse.json(
      { error: "item not found or already consumed" },
      { status: 404 }
    );
  return NextResponse.json({ log, kind });
}
