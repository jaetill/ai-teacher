"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UserNav from "./UserNav";
import { useCopilot } from "./CopilotProvider";

// `comingSoon` items render greyed out and inert (Jason 2026-07-31): the
// modules are scaffolded but not finished (#163), and a teacher clicking into
// a half-built screen learns the wrong thing about the app. Flip the flag off
// when the module is ready — the route itself is untouched, so it stays
// reachable by URL for our own testing.
const NAV_ITEMS: { href: string; label: string; comingSoon?: boolean }[] = [
  { href: "/curriculum", label: "Curriculum" },
  { href: "/calendar", label: "Calendar" },
  { href: "/standards", label: "Standards" },
  { href: "/search", label: "Search" },
  { href: "/glossary", label: "Glossary" },
  { href: "/differentiation", label: "Differentiation", comingSoon: true },
  { href: "/communications", label: "Communications", comingSoon: true },
  { href: "/import", label: "Import" },
];

export default function NavBar() {
  const pathname = usePathname();
  const { isOpen, toggle } = useCopilot();

  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-3 shrink-0 z-50 relative">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            AI Teacher
          </Link>
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              if (item.comingSoon) {
                return (
                  <span
                    key={item.href}
                    aria-disabled="true"
                    title="Not built yet — coming soon"
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-300 dark:text-zinc-700 cursor-not-allowed select-none"
                  >
                    {item.label}
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={toggle}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isOpen
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
            >
              Copilot
            </button>
          </div>
        </div>
        <UserNav />
      </div>
    </nav>
  );
}
