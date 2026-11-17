"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LayoutTemplate, Mic, PenLine, Trash2, X } from "lucide-react";
import type { StudioSettings } from "@/lib/settings";
import type { TemplateSummary } from "@/lib/templates";
import { btn, btnPrimary } from "./ui";

type Props = {
  selectedId: string;
  /** Apply the template's workflow settings and make it the active template (null clears it). */
  onUse: (id: string | null, settings?: Partial<StudioSettings>) => void;
  refreshKey: number;
  onGoTo: (tab: "upload" | "script") => void;
  disabled?: boolean;
  onList?: (list: TemplateSummary[]) => void;
};

/** "My Templates": pick a saved video structure, then add a new Bengali voice (upload or script) to generate the same proven structure. */
export function TemplatesTab({ selectedId, onUse, refreshKey, onGoTo, disabled, onList }: Props) {
  const [list, setList] = useState<TemplateSummary[]>([]);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    const d = await fetch("/api/templates", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.templates) {
      setList(d.templates as TemplateSummary[]);
      onList?.(d.templates as TemplateSummary[]);
    }
  }, [onList]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const use = async (t: TemplateSummary) => {
    setBusyId(t.id);
    const d = await fetch(`/api/templates?id=${t.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setBusyId("");
    if (d?.template) onUse(t.id, d.template.settings);
  };
  const remove = async (t: TemplateSummary) => {
    if (!confirm(`Delete the template "${t.name}"?`)) return;
    const d = await fetch(`/api/templates?id=${t.id}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (d?.templates) {
      setList(d.templates);
      onList?.(d.templates);
    }
    if (selectedId === t.id) onUse(null);
  };

  const active = list.find((t) => t.id === selectedId);

  return (
    <div role="tabpanel" className="space-y-4">
      <p className="text-sm text-muted">
        A template is the <b>structure</b> of a finished video: scene pacing, look, camera, subtitle design, music and brand settings (never its audio, subtitles or text). Pick one, add a new Bengali voice, and the new video follows the same proven structure without rebuilding it. Finish a video, then use <b>Save as reusable template</b> in Step 6.
      </p>

      {active && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm">
          <LayoutTemplate className="size-5 text-accent-strong" />
          <span className="min-w-0 flex-1">
            <b lang="bn">{active.name}</b> is active: the next video follows its {active.scenes} scenes. Now add the voice:
          </span>
          <button type="button" className={btn} onClick={() => onGoTo("upload")}><Mic className="size-4" /> Upload voice / .srt</button>
          <button type="button" className={btn} onClick={() => onGoTo("script")}><PenLine className="size-4" /> Write a script</button>
          <button type="button" className={btn} onClick={() => onUse(null)} aria-label="Clear template"><X className="size-4" /></button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">No templates yet. Make a video you like, then press <b>Save as reusable template</b> under the preview in Step 6.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((t) => {
            const on = t.id === selectedId;
            return (
              <li key={t.id} className={`rounded-xl border bg-panel p-3 transition ${on ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "border-line"}`}>
                <div className="flex items-center gap-2">
                  <span lang="bn" className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                  <div className="flex">
                    {t.colors.slice(0, 4).map((c, i) => (
                      <span key={i} className="-ml-1 size-4 rounded-full ring-2 ring-panel first:ml-0" style={{ background: c }} />
                    ))}
                  </div>
                </div>
                {/* scene pacing as a proportional timeline */}
                <div className="mt-2 flex h-3 w-full gap-px overflow-hidden rounded-full bg-ink" aria-label={`${t.scenes} scenes`}>
                  {t.ratios.map(([a, b], i) => (
                    <span key={i} style={{ flex: Math.max(0.01, b - a), background: t.colors[i % Math.max(1, t.colors.length)] ?? "var(--color-accent)" }} className="opacity-90" />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted">
                  <span className="rounded-full bg-ink px-2 py-0.5">{t.scenes} scenes · ~{t.avgSceneSec}s each</span>
                  <span className="rounded-full bg-ink px-2 py-0.5">{t.mode}</span>
                  <span className="rounded-full bg-ink px-2 py-0.5">captions {t.captions}</span>
                  {t.bgm !== "none" && <span className="rounded-full bg-ink px-2 py-0.5">♪ {t.bgm}</span>}
                  {t.style && <span className="rounded-full bg-ink px-2 py-0.5">style {t.style}</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" className={on ? btnPrimary : btn} disabled={disabled || busyId === t.id} onClick={() => (on ? onUse(null) : void use(t))}>
                    {on ? <><Check className="size-4" strokeWidth={3} /> Using this template</> : busyId === t.id ? "Loading…" : "Use this template"}
                  </button>
                  <button type="button" className={btn} onClick={() => void remove(t)} aria-label={`Delete template ${t.name}`}><Trash2 className="size-4" /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
