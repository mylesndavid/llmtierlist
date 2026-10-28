/** Site nav, used by the desktop header (layout.tsx) and MobileNav. */
export const NAV_LINKS: Array<{ href: string; label: string; prefetch?: boolean }> = [
  { href: "/", label: "Home", prefetch: true },
  { href: "/new", label: "New" },
  { href: "/buzz", label: "Buzz" },
  { href: "/community", label: "Community", prefetch: true },
  { href: "/tierlists", label: "Community lists", prefetch: true },
  { href: "/models", label: "Models", prefetch: true },
  { href: "/compare", label: "Compare" },
  { href: "/people", label: "People" },
];
