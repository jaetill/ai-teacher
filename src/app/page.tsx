import Link from "next/link";

const modules = [
  {
    href: "/curriculum",
    name: "Curriculum Compiler",
    description: "Courses, units, lessons, and standards — organized by year and quarter",
    available: true,
  },
  {
    href: "/import",
    name: "Import Materials",
    description: "Import files from Google Drive or your computer with AI-powered classification",
    available: true,
  },
  {
    href: "/differentiation",
    name: "Differentiation Engine",
    description: "Adapt any assignment or reading for a specific student need",
    available: true,
  },
  {
    href: "/communications",
    name: "Communication Engine",
    description: "Draft parent and admin emails from a quick situation description",
    available: true,
  },
  {
    href: "/performance",
    name: "Performance Ingestion",
    description: "Quiz scores, exit tickets, and writing sample analysis",
    available: false,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <p className="text-zinc-500 dark:text-zinc-400 mb-10">
          Planning intelligence and daily operations.
          <span className="text-zinc-400 dark:text-zinc-500">
            {" "}Use the Copilot button in the nav bar to ask questions from any page.
          </span>
        </p>

        <div className="flex flex-col gap-3">
          {modules.map((mod) => (
            <div key={mod.href}>
              {mod.available ? (
                <Link
                  href={mod.href}
                  className="block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                >
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {mod.name}
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {mod.description}
                  </div>
                </Link>
              ) : (
                <div className="rounded-xl border border-zinc-100 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-900/50 px-5 py-4 opacity-50 cursor-not-allowed">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {mod.name}
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      coming soon
                    </span>
                  </div>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {mod.description}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
