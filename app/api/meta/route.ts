import { NextResponse } from "next/server";
import { loadExpiryDb } from "@/lib/expiryDb";
import { readItems, readLogs } from "@/lib/inventory";
import { VLM_BASE, health } from "@/lib/vlmServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = loadExpiryDb();
  const items = readItems();
  const logs = readLogs();
  const h = await health();
  return NextResponse.json({
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
