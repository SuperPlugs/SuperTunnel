import { NextRequest, NextResponse } from "next/server";
import { connectRequestSchema } from "@/lib/contracts";
import { isAuthorized, resolveServerConfig } from "@/lib/server-config";

const responseHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: responseHeaders });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: responseHeaders },
    );
  }

  const body = await request.json().catch(() => null);
  const parsedRequest = connectRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "Expected a SuperTunnel extension connection request" },
      { status: 400, headers: responseHeaders },
    );
  }

  const config = resolveServerConfig();
  if (!config.profile) {
    return NextResponse.json(
      { error: config.status.error ?? "Proxy profile is not configured" },
      { status: 503, headers: responseHeaders },
    );
  }

  return NextResponse.json(config.profile, { headers: responseHeaders });
}
