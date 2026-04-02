import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({
    user: session.user?.email,
    hasAccessToken: !!session.accessToken,
  });
}
