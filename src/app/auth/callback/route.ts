import { NextResponse } from "next/server";
import { createSession, handleCallback } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const next = state && state.startsWith("/") ? state : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=auth`);
  }
  try {
    const user = await handleCallback(code);
    await createSession(user);
    if (!user.onboarded) {
      return NextResponse.redirect(
        `${origin}/welcome?next=${encodeURIComponent(next)}`
      );
    }
    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error("Auth callback failed:", err instanceof Error ? err.stack : String(err));
    return NextResponse.redirect(`${origin}/?error=signin`);
  }
}
