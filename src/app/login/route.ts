import { NextResponse } from "next/server";
import { authorizationUrl } from "@/lib/auth";

/** Sends the user straight to WorkOS AuthKit's hosted sign-in page. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/";
  return NextResponse.redirect(authorizationUrl(next));
}
