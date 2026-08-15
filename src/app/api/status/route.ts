import { NextResponse } from "next/server";
import { resolveServerConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(resolveServerConfig().status, {
    headers: { "Cache-Control": "no-store" },
  });
}
