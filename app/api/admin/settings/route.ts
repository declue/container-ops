// app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { validateSession, getAdminSettings, saveAdminSettings } from "@/lib/admin-settings";

async function authenticate(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.substring(7);
  return await validateSession(token);
}

export async function GET(req: NextRequest) {
  try {
    const isAuth = await authenticate(req);
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getAdminSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[Admin Settings GET] Error:", error);
    return NextResponse.json({ error: "Failed to get settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuth = await authenticate(req);
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await req.json();
    await saveAdminSettings(settings);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin Settings POST] Error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
