import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const ITEMS_PATH = path.join(DATA_DIR, "inventory.json");
const LOG_PATH = path.join(DATA_DIR, "consume_log.json");

// DELETE /api/inventory/all?scope=inventory|logs|all
export async function DELETE(req: NextRequest) {
  const scope = new URL(req.url).searchParams.get("scope") ?? "all";
  let cleared: string[] = [];
  if (scope === "inventory" || scope === "all") {
    if (fs.existsSync(ITEMS_PATH)) fs.writeFileSync(ITEMS_PATH, "[]", "utf8");
    cleared.push("inventory");
  }
  if (scope === "logs" || scope === "all") {
    if (fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "[]", "utf8");
    cleared.push("consume_log");
  }
  return NextResponse.json({ ok: true, cleared });
}
