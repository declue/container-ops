// app/api/admin/cache/route.ts
import { NextRequest, NextResponse } from "next/server";
import { validateSession, clearMetricsCache } from "@/lib/admin-settings";

async function authenticate(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.substring(7);
  return await validateSession(token);
}

export async function DELETE(req: NextRequest) {
  try {
    const isAuth = await authenticate(req);
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deletedCount = await clearMetricsCache();

    return NextResponse.json({ success: true, deletedCount });
  } catch (error) {
    console.error("[Admin Cache DELETE] Error:", error);
    return NextResponse.json({ error: "Failed to clear cache" }, { status: 500 });
  }
}
