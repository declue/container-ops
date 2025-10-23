// app/api/admin/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, generateSessionToken } from "@/lib/auth";
import { createSession } from "@/lib/admin-settings";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const isValid = await verifyPassword(password);

    if (!isValid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = generateSessionToken();
    await createSession(token);

    return NextResponse.json({ token, success: true });
  } catch (error) {
    console.error("[Admin Login] Error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
