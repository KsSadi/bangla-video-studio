"use client";

import { useRef, useState } from "react";
import type { AssetItem } from "@/lib/settings";
import { Collapsible, btn, field } from "./ui";

type Props = {
  jobId: string | null;
  assets: AssetItem[];
  notes: string;
  onAssets: (a: AssetItem[]) => void;
  onNotes: (n: string) => void;
  disabled?: boolean;
};

/** Optional B-roll: upload screenshots/clips (saved to the project's public/assets/) with timestamp instructions. */
export function MediaPanel({ jobId, assets, notes, onAssets, onNotes, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const upload = async (files: FileList | null) => {
    if (!files?.length || !jobId) return;
    setBusy(true);
    setErr("");
    const body = new FormData();
    body.append("jobId", jobId);
    for (const f of Array.from(files)) body.append("files", f);
    const res = await fetch("/api/assets", { method: "POST", body }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res?.ok) return setErr(data?.error ?? "Upload failed.");
    // keep instructions the user already typed; the server only knows the files
    onAssets((data.assets as AssetItem[]).map((a) => assets.find((x) => x.file === a.file) ?? a));
  };
  const remove = async (file: string) => {
    if (!jobId) return;
    const res = await fetch(`/api/assets?id=${jobId}&file=${encodeURIComponent(file)}`, { method: "DELETE" });
    if (res.ok) onAssets(assets.filter((a) => a.file !== file));
  };

  return (
    <Collapsible title="Extra Media / B-Roll Assets (Optional)" badge={assets.length ? `${assets.length} file${assets.length > 1 ? "s" : ""}` : "off"}>
      <p className="mb-3 text-xs text-muted">
        Add screenshots, images or short clips and say when to show them (for example <em>“Show screenshot1.png at 0:25”</em>). Claude embeds each one in an animated frame at that moment. With no files, this step is skipped.
      </p>
      {!jobId && <p className="mb-3 text-sm text-accent">Load a voice file first (Step 1); assets are stored inside the project.</p>}
      <input ref={input} type="file" multiple accept="image/*,.mp4,.webm,.mov" className="sr-only" id="asset-input" disabled={!jobId || disabled || busy} onChange={(e) => void upload(e.target.files)} />
      <label htmlFor="asset-input" className={`${btn} inline-block cursor-pointer ${!jobId || disabled ? "pointer-events-none opacity-40" : ""}`}>{busy ? "Uploading…" : "+ Add images / clips"}</label>
      {err && <p role="alert" className="mt-2 text-sm text-red-300">{err}</p>}

      {assets.length > 0 && (
        <ul className="mt-3 space-y-2">
          {assets.map((a, i) => (
            <li key={a.file} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink p-2">
              {a.kind === "image" && jobId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/assets?id=${jobId}&file=${encodeURIComponent(a.file)}`} alt="" className="size-12 rounded object-cover" />
              ) : (
                <span className="grid size-12 place-items-center rounded bg-raised text-lg" aria-hidden>🎞</span>
              )}
              <code className="w-40 truncate font-mono text-xs text-muted" title={`public/assets/${a.file}`}>{a.file}</code>
              <input
                value={a.instruction}
                maxLength={400}
                onChange={(e) => onAssets(assets.map((x, j) => (j === i ? { ...x, instruction: e.target.value } : x)))}
                placeholder={`Show ${a.file} at 0:25 for 4 seconds`}
                aria-label={`Instruction for ${a.file}`}
                className={`${field} min-w-48 flex-1`}
              />
              <button type="button" className={btn} onClick={() => void remove(a.file)} aria-label={`Remove ${a.file}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-semibold">General notes for the assets (optional)</span>
        <textarea rows={2} value={notes} maxLength={2000} onChange={(e) => onNotes(e.target.value)} placeholder="e.g. use phone mockups for the app screenshots" className={field} />
      </label>
    </Collapsible>
  );
}
