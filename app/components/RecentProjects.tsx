"use client";

import { useEffect, useState } from "react";
import type { ProjectSummary } from "@/lib/store";
import { btn } from "./ui";

/** Drawer listing auto-saved projects (projects/<name>/). Opening one restores audio, subtitles, settings and versions. */
export function RecentProjects({ currentId, onOpen, refreshKey }: { currentId: string | null; onOpen: (id: string) => void; refreshKey: number }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setList(d.projects ?? []))
      .catch(() => {});
  }, [open, refreshKey]);

  return (
    <div className="rounded-2xl border border-line bg-panel">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold">
        <span aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span> Recent Projects
        <span className="ml-auto text-xs font-normal text-muted">auto-saved in projects/</span>
      </button>
      {open && (
        <div className="border-t border-line p-4">
          {list.length === 0 ? (
            <p className="text-sm text-muted">No saved projects yet. Every session you start is saved automatically.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {list.map((p) => (
                <li key={p.id} className={`flex items-center gap-3 rounded-lg border bg-raised p-3 ${p.id === currentId ? "border-accent" : "border-line"}`}>
                  <div className="min-w-0 flex-1">
                    <div lang="bn" className="truncate font-semibold">{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.updatedAt ? new Date(p.updatedAt).toLocaleString() : ""} · {p.versions} version{p.versions === 1 ? "" : "s"}
                      {p.thumbnail ? " · thumbnail" : ""}
                    </div>
                  </div>
                  <button type="button" className={btn} onClick={() => onOpen(p.id)}>{p.id === currentId ? "Current" : "Open"}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
