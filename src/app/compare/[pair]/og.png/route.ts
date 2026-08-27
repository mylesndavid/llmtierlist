import { renderComparePng } from "@/lib/og";

/** Unfurl image for a comparison deep link. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pair: string }> }
) {
  const { pair } = await params;
  const [a, b] = decodeURIComponent(pair).split("-vs-");
  if (!a || !b) return new Response("Not found", { status: 404 });

  const png = await renderComparePng(a, b);
  if (!png) return new Response("Not found", { status: 404 });

  return new Response(png as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=900",
    },
  });
}
