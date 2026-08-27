import { redirect } from "next/navigation";
import { getBaseModelsWithStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata = { title: "Compare models" };

/** Canonicalise to /compare/<a>-vs-<b>, honouring ?a= / ?b= from older links. */
export default async function CompareEntry({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const [{ a, b }, models] = await Promise.all([searchParams, getBaseModelsWithStats()]);
  const ranked = [...models].sort(
    (x, y) =>
      y.stats.net_score - x.stats.net_score ||
      (y.release_date ?? "").localeCompare(x.release_date ?? "")
  );
  const bySlug = new Map(models.map((m) => [m.slug, m]));
  const first = (a && bySlug.get(a)?.slug) ?? ranked[0]?.slug;
  const second =
    (b && bySlug.get(b)?.slug) ?? ranked.find((m) => m.slug !== first)?.slug ?? ranked[1]?.slug;
  redirect(`/compare/${first}-vs-${second}`);
}
