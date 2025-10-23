// app/api/admin/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/admin-settings";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const isValid = await validateSession(token);

    if (!isValid) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("[Admin Verify] Error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
