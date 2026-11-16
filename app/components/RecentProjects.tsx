"use client";

import { useEffect, useState } from "react";
import type { ProjectSummary } from "@/lib/store";

/** Drawer listing auto-saved projects (projects/<name>/). Opening one restores audio, subtitles, settings and versions. */
export function RecentProjects({ currentId, onOpen, refreshKey }: { currentId: string | null; onOpen: (id: string) => void; refreshKey: number }) {
  const [list, setList] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    void fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setList(d.projects ?? []))
      .catch(() => {});
  }, [refreshKey]);

  return (
    <div>
      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Recent projects</h3>
      {list.length === 0 ? (
        <p className="px-1 text-xs text-muted">No saved projects yet. Every session is auto-saved.</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onOpen(p.id)} className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${p.id === currentId ? "border-accent/60 bg-accent/10" : "border-transparent hover:bg-raised"}`}>
                <div lang="bn" className="truncate text-sm font-semibold">{p.name}</div>
                <div className="truncate text-[11px] text-muted">
                  {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : ""} · {p.versions} version{p.versions === 1 ? "" : "s"}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
