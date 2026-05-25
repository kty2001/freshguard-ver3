import { NextRequest, NextResponse } from "next/server";
import { loadExpiryDb } from "@/lib/expiryDb";
import { readItems, readLogs } from "@/lib/inventory";
import { getUserId } from "@/lib/userScope";
import { VLM_BASE, health } from "@/lib/vlmServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uid = getUserId(req);
  const db = loadExpiryDb();
  const items = readItems(uid);
  const logs = readLogs(uid);
  const h = await health();
  return NextResponse.json({
    user_id: uid,
    vlm_server_url: VLM_BASE,
    vlm_reachable: h.reachable,
    vlm_ok: h.ok,
    vlm_model: h.model ?? "unknown",
    vlm_detail: h.detail,
    db_items: db.length,
    db_categories: Array.from(new Set(db.map((r) => r.category))),
    inventory_total: items.length,
    inventory_active: items.filter((i) => !i.is_consumed).length,
    consume_log_count: logs.length,
  });
}
