import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/auth-helpers";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const accessToken = await getAccessToken(req);
  return NextResponse.json({
    user: session.user?.email,
    hasAccessToken: !!accessToken,
  });
}
