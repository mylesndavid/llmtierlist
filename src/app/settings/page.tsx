import { redirect } from "next/navigation";
import { getOwnProfile } from "@/lib/data";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profile settings" };

export default async function SettingsPage() {
  const profile = await getOwnProfile();
  if (!profile) redirect("/login");

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <h1 className="text-2xl font-bold">Profile settings</h1>
      <ProfileForm
        mode="edit"
        initialUsername={profile.username}
        initialDisplayName={profile.display_name ?? ""}
        initialBio={profile.bio}
        currentAvatarUrl={profile.avatar_url}
      />
    </div>
  );
}
