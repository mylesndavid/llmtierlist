"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";

interface Props {
  username: string;
  avatarUrl: string | null;
  onboarded: boolean;
  signOutAction: () => Promise<void>;
}

export default function UserMenu({ username, avatarUrl, onboarded, signOutAction }: Props) {
  const [open, setOpen] = useState(false);

  const item =
    "block w-full px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-foreground";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="block rounded-full ring-1 ring-edge transition hover:ring-muted"
        aria-label="Account menu"
      >
        <Avatar src={avatarUrl} name={username} size={30} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-sm border border-edge bg-surface py-1 shadow-xl shadow-black/50">
            <div className="border-b border-edge px-3 py-2 text-sm font-semibold">
              @{username}
            </div>
            <Link
              href={onboarded ? `/u/${username}` : "/welcome"}
              className={item}
              onClick={() => setOpen(false)}
            >
              Profile
            </Link>
            <Link href="/me/tierlists" className={item} onClick={() => setOpen(false)}>
              My tier lists
            </Link>
            <Link href="/settings" className={item} onClick={() => setOpen(false)}>
              Settings
            </Link>
            <div className="my-1 border-t border-edge" />
            <form action={signOutAction}>
              <button type="submit" className={item}>
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
