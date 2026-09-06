import { NextResponse } from "next/server";
import { appName, appUrl } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: appName.toLowerCase(),
    version: "0.1.0",
    phase: 1,
    appUrl,
    time: new Date().toISOString(),
  });
}
