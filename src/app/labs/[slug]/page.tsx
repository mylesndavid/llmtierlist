import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser, getLab, getLabModels, getUserVotes } from "@/lib/data";
import ModelDirectory from "@/components/ModelDirectory";
import VendorLogo from "@/components/VendorLogo";
import { plainDescription } from "@/lib/tiers";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lab = await getLab(slug);
  if (!lab) return { title: "Lab not found" };
  return {
    title: `${lab.vendor} models`,
    description: `Every ${lab.vendor} model on llmtierlist.com — ranked, rated, and reviewed by the community.`,
  };
}

export default async function LabPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [lab, models, userVotes, user] = await Promise.all([
    getLab(slug),
    getLabModels(slug),
    getUserVotes(),
    getCurrentUser(),
  ]);
  if (!lab) notFound();

  const trimmed = models.map((m) => ({
    ...m,
    description: plainDescription(m.description).slice(0, 150),
  }));

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-4 border border-edge bg-surface p-5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-sm bg-surface-2 p-2.5">
          <VendorLogo vendorSlug={lab.vendor_slug} className="h-full w-full" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{lab.vendor}</h1>
          <p className="mt-1 text-xs text-muted">
            {lab.model_count} {lab.model_count === 1 ? "model" : "models"}
            {lab.open_count > 0 && <> · {lab.open_count} open weights</>}
            {lab.latest_release && (
              <>
                {" "}
                · latest{" "}
                {new Date(lab.latest_release + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`font-mono text-xl font-bold ${
              lab.net_score > 0
                ? "text-emerald-400"
                : lab.net_score < 0
                  ? "text-rose-400"
                  : "text-muted"
            }`}
          >
            {lab.net_score > 0 ? `+${lab.net_score}` : lab.net_score}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted">community score</div>
        </div>
      </section>

      <ModelDirectory models={trimmed} userVotes={userVotes} signedIn={!!user} />

      <Link href="/models" className="inline-block text-sm text-muted underline hover:text-foreground">
        ← All models
      </Link>
    </div>
  );
}
