// app/api/settings/route.ts
// Public endpoint to get visibility settings (no auth required)
import { NextResponse } from "next/server";
import { getAdminSettings } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getAdminSettings();
    // Only return visibility settings to public
    return NextResponse.json(settings.visibility);
  } catch (error) {
    console.error("[Settings] Error:", error);
    // Return default settings on error
    return NextResponse.json({
      showProcessList: true,
      showCpuChart: true,
      showMemoryChart: true,
      showStorageChart: true,
      showTopProcesses: true,
      showDebugInfo: true,
    });
  }
}
