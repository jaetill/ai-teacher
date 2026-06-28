import { getAccessToken } from "@/lib/auth-helpers";
import { createDoc } from "@/lib/drive";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const file = await createDoc(
    accessToken,
    "AI Teacher — Test Doc",
    "This file was created by AI Teacher.\n\nIf you can see this, Drive write access is working."
  );

  return NextResponse.json({ file });
}
