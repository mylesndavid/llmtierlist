import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { d1Query } from "./d1";
import type { SessionUser } from "./types";

const COOKIE = "ltl_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET!);
}

export function authorizationUrl(next = "/"): string {
  const params = new URLSearchParams({
    client_id: process.env.WORKOS_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    response_type: "code",
    provider: "authkit",
    state: next,
  });
  return `https://api.workos.com/user_management/authorize?${params}`;
}

interface WorkOSUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
}

/** Exchange an AuthKit code, upsert the user row, and return the session user. */
export async function handleCallback(code: string): Promise<SessionUser> {
  const res = await fetch("https://api.workos.com/user_management/authenticate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WORKOS_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.WORKOS_CLIENT_ID!,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!res.ok) {
    throw new Error(`WorkOS authenticate failed: ${res.status} ${await res.text()}`);
  }
  const { user }: { user: WorkOSUser } = await res.json();

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || null;

  const existing = await d1Query<{ username: string }>(
    "select username from users where id = ?",
    [user.id]
  );
  let username: string;
  if (existing.length > 0) {
    username = existing[0].username;
    await d1Query(
      "update users set email = ?, display_name = ?, avatar_url = ? where id = ?",
      [user.email, displayName, user.profile_picture_url, user.id]
    );
  } else {
    const base =
      user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") || "user";
    username = base;
    for (let i = 1; ; i++) {
      const taken = await d1Query("select 1 from users where username = ?", [username]);
      if (taken.length === 0) break;
      username = `${base}${i}`;
    }
    await d1Query(
      "insert into users (id, email, username, display_name, avatar_url) values (?, ?, ?, ?, ?)",
      [user.id, user.email, username, displayName, user.profile_picture_url]
    );
  }

  return {
    id: user.id,
    email: user.email,
    username,
    display_name: displayName,
    avatar_url: user.profile_picture_url,
  };
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.user as SessionUser;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
