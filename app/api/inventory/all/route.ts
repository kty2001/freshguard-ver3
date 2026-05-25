import { NextRequest, NextResponse } from "next/server";
import { clearInventory, clearLogs } from "@/lib/inventory";
import { getUserId } from "@/lib/userScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/inventory/all?scope=inventory|logs|all
export async function DELETE(req: NextRequest) {
  const uid = getUserId(req);
  const scope = new URL(req.url).searchParams.get("scope") ?? "all";
  const cleared: string[] = [];
  if (scope === "inventory" || scope === "all") {
    clearInventory(uid);
    cleared.push("inventory");
  }
  if (scope === "logs" || scope === "all") {
    clearLogs(uid);
    cleared.push("consume_log");
  }
  return NextResponse.json({ ok: true, cleared });
}
