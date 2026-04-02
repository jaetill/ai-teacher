import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createDoc } from "@/lib/drive";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const file = await createDoc(
    session.accessToken,
    "AI Teacher — Test Doc",
    "This file was created by AI Teacher.\n\nIf you can see this, Drive write access is working."
  );

  return NextResponse.json({ file });
}
