"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function UserNav() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;

  if (!session) {
    return (
      <button
        onClick={() => signIn("google")}
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        {session.user?.email}
      </span>
      <button
        onClick={() => signOut()}
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
