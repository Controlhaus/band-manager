import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Health check (§15.6): returns 200 after a DB round-trip, 503 otherwise. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
