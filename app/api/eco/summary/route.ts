import { NextRequest, NextResponse } from "next/server";
import { ecoSummary } from "@/lib/inventory";
import { getUserId } from "@/lib/userScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uid = getUserId(req);
  return NextResponse.json(ecoSummary(uid));
}
