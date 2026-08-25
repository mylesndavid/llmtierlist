import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/data";
import { signOut } from "@/lib/actions";
import Avatar from "@/components/Avatar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "LLM Tier List", template: "%s · LLM Tier List" },
  description:
    "Crowdsourced LLM rankings — vote, review, and build your own AI model tier lists.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}>
        <header className="sticky top-0 z-40 border-b border-edge bg-black">
          <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="h-7 w-7" />
              LLM<span className="text-muted">TierList</span>
            </Link>
            <div className="hidden items-center gap-5 text-sm text-muted sm:flex">
              <Link href="/models" className="hover:text-foreground">Models</Link>
              <Link href="/tiers" className="hover:text-foreground">Community Tiers</Link>
              <Link href="/tierlists" className="hover:text-foreground">Tier Lists</Link>
            </div>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <Link
                href="/tierlists/new"
                className="rounded-sm bg-foreground px-3 py-1.5 font-semibold text-black hover:bg-white"
              >
                Create a Tier List
              </Link>
              {user ? (
                <div className="flex items-center gap-3">
                  <Link href="/me/tierlists" className="text-muted hover:text-foreground">
                    My Lists
                  </Link>
                  <Link
                    href={user.onboarded ? `/u/${user.username}` : "/welcome"}
                    title={`@${user.username}`}
                    className="rounded-full ring-1 ring-edge transition hover:ring-muted"
                  >
                    <Avatar src={user.avatar_url} name={user.username} size={28} />
                  </Link>
                  <form action={signOut}>
                    <button className="text-muted hover:text-foreground" type="submit">
                      Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <Link href="/login" className="text-muted hover:text-foreground">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-edge py-6 text-center text-xs text-muted">
          llmtierlist.com — crowdsourced LLM rankings. Not affiliated with any AI lab.
        </footer>
      </body>
    </html>
  );
}
