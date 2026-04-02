import Link from "next/link";

const modules = [
  {
    href: "/copilot",
    name: "Teacher Copilot",
    description: "Rubrics, lesson plans, differentiated materials, parent emails",
    available: true,
  },
  {
    href: "/curriculum",
    name: "Curriculum Compiler",
    description: "Unit maps, lesson sequences, and pacing guides from standards",
    available: true,
  },
  {
    href: "/differentiation",
    name: "Differentiation Engine",
    description: "Leveled assignment versions for ELL, SPED, and above/below grade",
    available: false,
  },
  {
    href: "/performance",
    name: "Performance Ingestion",
    description: "Quiz scores, exit tickets, and writing sample analysis",
    available: false,
  },
  {
    href: "/communications",
    name: "Communication Engine",
    description: "Draft parent and admin communications from student data",
    available: false,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
          AI Teacher
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-10">
          Planning intelligence and daily operations
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
