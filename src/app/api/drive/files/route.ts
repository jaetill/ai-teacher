import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listFiles } from "@/lib/drive";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const files = await listFiles(session.accessToken);
  return NextResponse.json({ files });
}
