import { NextResponse } from "next/server";
import { ecoSummary } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(ecoSummary());
}
