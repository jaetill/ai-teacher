import { getAccessToken } from "@/lib/auth-helpers";
import { listFiles } from "@/lib/drive";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const files = await listFiles(accessToken);
  return NextResponse.json({ files });
}
