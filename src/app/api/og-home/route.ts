import { renderHomeOgPng } from "@/lib/og";

/**
 * Generator for the static site-wide OG image. Run locally and save the
 * output to public/og.png whenever the community seed changes:
 *   curl -s localhost:3000/api/og-home -o public/og.png
 */
export async function GET() {
  const png = await renderHomeOgPng();
  return new Response(png as unknown as BodyInit, {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
