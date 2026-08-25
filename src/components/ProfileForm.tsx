"use client";

import { useRef, useState, useTransition } from "react";
import { updateProfile } from "@/lib/actions";
import Avatar from "./Avatar";

interface Props {
  mode: "create" | "edit";
  initialUsername: string;
  initialDisplayName: string;
  initialBio: string;
  currentAvatarUrl: string | null;
  next?: string;
}

/** Center-crop and downscale an image file to a 256px JPEG data URI. */
async function fileToAvatar(file: File): Promise<string> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = url;
  });
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  URL.revokeObjectURL(url);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function ProfileForm({
  mode,
  initialUsername,
  initialDisplayName,
  initialBio,
  currentAvatarUrl,
  next,
}: Props) {
  const [username, setUsername] = useState(initialUsername);
  const [avatarData, setAvatarData] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function submit(formData: FormData) {
    formData.set("avatar_data", avatarData);
    if (next) formData.set("next", next);
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={submit} className="space-y-5">
      <div className="flex items-center gap-4">
        {avatarData ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarData} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <Avatar src={currentAvatarUrl} name={username || "?"} size={80} />
        )}
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-sm border border-edge bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            {currentAvatarUrl || avatarData ? "Change photo" : "Upload photo"}
          </button>
          <p className="text-xs text-muted">Square-cropped, resized to 256px.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setAvatarData(await fileToAvatar(file));
              } catch {
                setError("Couldn't read that image.");
              }
            }}
          />
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-sm text-muted">Username</span>
        <div className="flex items-center overflow-hidden rounded-sm border border-edge bg-surface focus-within:border-muted">
          <span className="pl-3 text-sm text-muted">llmtierlist.com/u/</span>
          <input
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            pattern="[a-z0-9_]{3,20}"
            required
            maxLength={20}
            className="min-w-0 flex-1 bg-transparent px-1 py-2 outline-none"
          />
        </div>
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-muted">Display name</span>
        <input
          name="display_name"
          defaultValue={initialDisplayName}
          maxLength={60}
          placeholder="How your name appears on reviews and lists"
          className="w-full rounded-sm border border-edge bg-surface px-3 py-2 outline-none placeholder:text-muted focus:border-muted"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-muted">Bio</span>
        <textarea
          name="bio"
          defaultValue={initialBio}
          rows={2}
          maxLength={280}
          placeholder="Optional — a line about you and your takes"
          className="w-full rounded-sm border border-edge bg-surface px-3 py-2 outline-none placeholder:text-muted focus:border-muted"
        />
      </label>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-sm bg-foreground px-5 py-2 font-semibold text-black hover:bg-white disabled:opacity-40"
      >
        {pending ? "Saving…" : mode === "create" ? "Create profile" : "Save changes"}
      </button>
    </form>
  );
}
