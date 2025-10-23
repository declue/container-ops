// app/api/admin/reset-password/route.ts
import { NextResponse } from "next/server";
import { redis, ensureRedisConnection } from "@/lib/redis";
import { generatePassword } from "@/lib/auth";

const ADMIN_PASSWORD_KEY = 'admin:password';

export async function POST() {
  try {
    // Check if ADMIN_PASSWORD is set in environment
    if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim()) {
      return NextResponse.json(
        { error: "Cannot reset password when ADMIN_PASSWORD environment variable is set" },
        { status: 400 }
      );
    }

    // Generate new password
    const newPassword = generatePassword();

    // Store in Redis
    await ensureRedisConnection();
    await redis.set(ADMIN_PASSWORD_KEY, newPassword);

    console.log('\n' + '='.repeat(60));
    console.log('🔄  ADMIN PASSWORD RESET');
    console.log('='.repeat(60));
    console.log(`New Admin Password: ${newPassword}`);
    console.log('='.repeat(60) + '\n');

    return NextResponse.json({
      success: true,
      message: "Password reset successful. Check server logs for new password."
    });
  } catch (error) {
    console.error("[Admin Reset Password] Error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
