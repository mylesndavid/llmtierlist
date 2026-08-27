import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/data";
import { signOut } from "@/lib/actions";
import UserMenu from "@/components/UserMenu";
import TrackVisit from "@/components/TrackVisit";
import MobileNav from "@/components/MobileNav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const SITE_DESCRIPTION =
  "Crowdsourced LLM rankings — see what people actually think of every model, vote, review, and build your own tier lists.";
const SITE_OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "The community LLM tier list" };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "LLM Tier List", template: "%s · LLM Tier List" },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: "LLM Tier List",
    description: SITE_DESCRIPTION,
    siteName: "LLM Tier List",
    images: [SITE_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "LLM Tier List",
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}>
        <header className="sticky top-0 z-40 border-b border-edge bg-black">
          <nav className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6">
            <MobileNav />
            <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="h-7 w-7" />
              llmtierlist<span className="text-muted">.com</span>
            </Link>
            <div className="hidden items-center gap-5 text-sm text-muted sm:flex">
              <Link href="/tiers" prefetch className="hover:text-foreground">Official tier list</Link>
              <Link href="/tierlists" prefetch className="hover:text-foreground">Community lists</Link>
              <Link href="/models" prefetch className="hover:text-foreground">Models</Link>
            </div>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <Link
                href="/tierlists/new"
                className="rounded-sm bg-foreground px-3 py-1.5 font-semibold text-black hover:bg-white"
              >
                Create
              </Link>
              {user ? (
                <UserMenu
                  username={user.username}
                  avatarUrl={user.avatar_url}
                  onboarded={user.onboarded}
                  signOutAction={signOut}
                />
              ) : (
                <Link href="/login" className="text-muted hover:text-foreground">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </header>
        <TrackVisit />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-edge py-6 text-center text-xs text-muted">
          llmtierlist.com — crowdsourced LLM rankings. Not affiliated with any AI lab.
        </footer>
      </body>
    </html>
  );
}
