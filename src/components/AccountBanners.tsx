import Link from "next/link";
import { getCurrentUser } from "@/lib/data";

/**
 * Sign-in error (the auth callback sends failures to /?error=signin) and the
 * finish-your-profile prompt. Shown at the top of the home and community pages.
 */
export default async function AccountBanners({ error }: { error?: string }) {
  const user = await getCurrentUser();
  return (
    <>
      {error === "signin" && (
        <div className="border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          Sign-in didn&apos;t complete — please{" "}
          <Link href="/login" className="underline">try again</Link>. If it keeps
          failing, the sign-in codes expire quickly, so go through in one sitting.
        </div>
      )}
      {user && !user.onboarded && (
        <div className="flex items-center justify-between gap-3 border border-edge bg-surface px-4 py-3 text-sm">
          <span>You&apos;re signed in — finish setting up your profile to vote and publish tier lists.</span>
          <Link
            href="/welcome"
            className="shrink-0 rounded-sm bg-foreground px-3 py-1.5 font-semibold text-black hover:bg-white"
          >
            Create profile
          </Link>
        </div>
      )}
    </>
  );
}
