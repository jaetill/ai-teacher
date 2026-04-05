"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { PoolMaterial } from "@/types/curriculum-editor";

const TYPE_COLORS: Record<string, string> = {
  worksheet: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  handout: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  rubric: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  presentation: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  reading: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  answer_key: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  supplementary: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  other: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

function DraggableMaterial({ material, onDetach }: { material: PoolMaterial; onDetach?: (attachmentId: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool-${material.id}`,
    data: { type: "pool-material", materialId: material.id },
  });

  const isAttached = material.attachment !== null;
  const typeColor = TYPE_COLORS[material.materialType] ?? TYPE_COLORS.other;

  return (
    <div
      ref={setNodeRef}
      className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 group transition-colors ${
        isDragging
          ? "opacity-30"
          : isAttached
            ? "opacity-50 hover:opacity-80"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-zinc-300 dark:text-zinc-500 hover:text-zinc-500 dark:hover:text-zinc-300 shrink-0 mt-0.5 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
          <rect x="2" y="1" width="3.5" height="1.5" rx="0.5" />
          <rect x="8.5" y="1" width="3.5" height="1.5" rx="0.5" />
          <rect x="2" y="4.5" width="3.5" height="1.5" rx="0.5" />
          <rect x="8.5" y="4.5" width="3.5" height="1.5" rx="0.5" />
          <rect x="2" y="8" width="3.5" height="1.5" rx="0.5" />
          <rect x="8.5" y="8" width="3.5" height="1.5" rx="0.5" />
        </svg>
      </button>

      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-zinc-800 dark:text-zinc-100 leading-snug">
          {material.driveWebUrl ? (
            <a
              href={material.driveWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {material.title}
            </a>
          ) : (
            material.title
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${typeColor}`}>
            {material.materialType.replace(/_/g, " ")}
          </span>
          {isAttached && (
            <span className="text-[10px] text-zinc-400">linked</span>
          )}
        </div>
      </div>

      {/* Unlink button — far right, away from drag handle */}
      {isAttached && onDetach && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDetach(material.attachment!.id);
          }}
          className="shrink-0 mt-1 p-1 rounded text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100"
          title="Unlink from current lesson/unit"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}

type Props = {
  materials: PoolMaterial[];
  onDetachMaterial?: (attachmentId: string) => void;
};

export default function ContentPool({ materials, onDetachMaterial }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [showAttached, setShowAttached] = useState(true);
  const [search, setSearch] = useState("");

  const types = [...new Set(materials.map((m) => m.materialType))].sort();

  const filtered = materials.filter((m) => {
    if (filter !== "all" && m.materialType !== filter) return false;
    if (!showAttached && m.attachment) return false;
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const unattachedCount = materials.filter((m) => !m.attachment).length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-400">
            <path d="M14.5 13.5h-13A1.5 1.5 0 010 12V4a1.5 1.5 0 011.5-1.5h4.586a1 1 0 01.707.293L8.5 4.5h6A1.5 1.5 0 0116 6v6a1.5 1.5 0 01-1.5 1.5z" />
          </svg>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Content Pool
          </h3>
        </div>
        <p className="text-xs text-zinc-400 mt-1 ml-6">
          {materials.length} files &middot;{" "}
          <span className={unattachedCount > 0 ? "text-amber-500" : ""}>
            {unattachedCount} unlinked
          </span>
        </p>
      </div>

      {/* Search + Filters */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files..."
          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
        />
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 focus:outline-none"
          >
            <option value="all">All types ({materials.length})</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")} ({materials.filter((m) => m.materialType === t).length})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={!showAttached}
              onChange={(e) => setShowAttached(!e.target.checked)}
              className="rounded border-zinc-300 dark:border-zinc-600"
            />
            Unlinked only
          </label>
        </div>
      </div>

      {/* Material list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {filtered.length > 0 ? (
          filtered.map((material) => (
            <DraggableMaterial key={material.id} material={material} onDetach={onDetachMaterial} />
          ))
        ) : (
          <div className="text-center py-8">
            <p className="text-xs text-zinc-400">
              {search ? "No files match your search" : "No files match filters"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
