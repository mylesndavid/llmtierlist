import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/data";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Create your profile" };

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next }, profile] = await Promise.all([searchParams, getOwnProfile()]);
  if (!profile) redirect("/login");
  if (profile.onboarded) redirect(`/u/${profile.username}`);

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <div>
        <h1 className="text-2xl font-bold">Create your profile</h1>
        <p className="mt-1 text-sm text-muted">
          Claim a username so people can find your tier lists. Your sign-in
          photo is used by default — swap it any time.
        </p>
      </div>
      <ProfileForm
        mode="create"
        initialUsername={profile.username}
        initialDisplayName={profile.display_name ?? ""}
        initialBio={profile.bio}
        currentAvatarUrl={profile.avatar_url}
        next={next}
      />
    </div>
  );
}
