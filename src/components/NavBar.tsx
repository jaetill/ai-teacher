"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UserNav from "./UserNav";
import { useCopilot } from "./CopilotProvider";

const NAV_ITEMS = [
  { href: "/curriculum", label: "Curriculum" },
  { href: "/differentiation", label: "Differentiation" },
  { href: "/communications", label: "Communications" },
  { href: "/upload", label: "Upload" },
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
