import { d1Query } from "@/lib/d1";

/** Serves a user's uploaded avatar (stored as a data URI in D1). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const rows = await d1Query<{ avatar_blob: string | null }>(
    "select avatar_blob from users where username = ?",
    [username]
  );
  const blob = rows[0]?.avatar_blob;
  if (!blob) return new Response("Not found", { status: 404 });

  const base64 = blob.slice(blob.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=300",
    },
  });
}
