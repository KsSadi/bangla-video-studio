"use client";

import { useState } from "react";
import type { RevisionInfo, SeoPack, VersionInfo } from "@/lib/settings";
import { CopyButton, btn, btnPrimary, field } from "./ui";

const CHIPS = [
  "০:১৫ সেকেন্ডে ক্যারেক্টারটাকে বড় করো",
  "Zoom in more on the login button",
  "অ্যানিমেশন আরও স্মুথ ও ধীর করো",
  "Make the text bigger and easier to read",
  "ব্যাকগ্রাউন্ডের রং আরও শান্ত করো",
  "Add a smoother transition between scenes",
];

type Props = {
  jobId: string;
  versions: VersionInfo[];
  selected: number;
  onSelect: (n: number) => void;
  revisions: RevisionInfo[];
  portrait: boolean;
  busy: boolean;
  onRevise: (feedback: string, quality: "draft" | "final") => void;
  videoKey: number;
};

const vLabel = (v: VersionInfo) => `v${v.n} · ${v.quality === "final" ? "Final 1080p" : "Draft 480p"} · ${v.label}`;

export function Player({ jobId, versions, selected, onSelect, revisions, portrait, busy, onRevise, videoKey }: Props) {
  const [compare, setCompare] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [quality, setQuality] = useState<"draft" | "final">("draft");
  const cur = versions.find((v) => v.n === selected) ?? versions[versions.length - 1];
  const other = versions.find((v) => v.n === compare && v.n !== cur.n);
  const src = (n: number) => `/api/video?id=${jobId}&v=${n}&k=${videoKey}`;
  const box = portrait ? "max-w-xs" : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          Version
          <select value={cur.n} onChange={(e) => onSelect(Number(e.target.value))} className={`${field} !w-auto`} aria-label="Version switcher">
            {[...versions].reverse().map((v) => (
              <option key={v.n} value={v.n}>{vLabel(v)}</option>
            ))}
          </select>
        </label>
        {versions.length > 1 && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            Compare with
            <select value={other?.n ?? 0} onChange={(e) => setCompare(Number(e.target.value))} className={`${field} !w-auto`} aria-label="Compare with version">
              <option value={0}>none</option>
              {versions.filter((v) => v.n !== cur.n).map((v) => (
                <option key={v.n} value={v.n}>v{v.n}</option>
              ))}
            </select>
          </label>
        )}
        <a href={`/api/video?id=${jobId}&v=${cur.n}&download=1`} className={`${btn} ml-auto`}>Download v{cur.n} MP4</a>
      </div>

      <div className={`grid gap-4 ${other ? "sm:grid-cols-2" : ""}`}>
        <figure className="flex flex-col items-center gap-1">
          <video key={`${cur.n}-${videoKey}`} src={src(cur.n)} controls className={`w-full rounded-xl bg-black ${box}`} />
          <figcaption className="text-xs text-muted">{vLabel(cur)}</figcaption>
        </figure>
        {other && (
          <figure className="flex flex-col items-center gap-1">
            <video key={`${other.n}-${videoKey}`} src={src(other.n)} controls className={`w-full rounded-xl bg-black ${box}`} />
            <figcaption className="text-xs text-muted">{vLabel(other)}</figcaption>
          </figure>
        )}
      </div>

      <form
        className="rounded-xl border border-line bg-raised p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (feedback.trim() && !busy) {
            onRevise(feedback.trim(), quality);
            setFeedback("");
          }
        }}
      >
        <h3 className="mb-1 font-semibold">Ask for changes</h3>
        <p className="mb-3 text-xs text-muted">Describe the change in Bengali or English. Name the moment (<b>0:15</b>, <b>১৫ সেকেন্ডে</b> or <b>scene 3</b>) and only that scene is sent to Claude, which costs very few tokens. Starts from <b>v{cur.n}</b>; older versions are kept.</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button type="button" key={c} lang={/[ঀ-৿]/.test(c) ? "bn" : "en"} onClick={() => setFeedback((f) => (f.trim() ? `${f.trim()}\n${c}` : c))} className="rounded-full border border-line bg-ink px-3 py-1 text-xs hover:border-accent hover:text-accent">
              {c}
            </button>
          ))}
        </div>
        <textarea lang="bn" rows={3} value={feedback} maxLength={2000} onChange={(e) => setFeedback(e.target.value)} aria-label="Revision feedback" placeholder="যেমন: ০:১৫ সেকেন্ডে ক্যারেক্টারটাকে বড় করো  ·  Zoom in more on the login button" className={field} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Render as
            <select value={quality} onChange={(e) => setQuality(e.target.value as "draft" | "final")} className={`${field} !w-auto`}>
              <option value="draft">Quick Draft (480p, fast)</option>
              <option value="final">Final HD (1080p / 30fps)</option>
            </select>
          </label>
          <button type="submit" disabled={busy || !feedback.trim()} className={`${btnPrimary} !px-5 !py-2 !text-sm`}>{busy ? "Working…" : "Revise & re-render"}</button>
        </div>
        {revisions.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">Revision history ({revisions.length})</summary>
            <ol className="mt-2 space-y-1 text-xs text-muted">
              {revisions.map((r) => (
                <li key={r.n}>
                  <button type="button" className="mr-2 font-mono text-accent hover:underline" onClick={() => onSelect(r.version)}>v{r.version}</button>
                  <span lang="bn">{r.feedback}</span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </form>
    </div>
  );
}

export function SeoPanel({ jobId, seo, thumbnail, rev }: { jobId: string; seo: SeoPack | null; thumbnail: boolean; rev: number }) {
  if (!seo && !thumbnail) return null;
  const chapters = seo?.chapters.map((c) => `${c.time} ${c.title}`).join("\n") ?? "";
  const block = (title: string, text: string) =>
    text ? (
      <div className="rounded-lg border border-line bg-ink p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold">{title}</span>
          <CopyButton text={text} />
        </div>
        <pre lang="bn" className="whitespace-pre-wrap text-sm leading-relaxed">{text}</pre>
      </div>
    ) : null;
  return (
    <div className="mt-6 flex flex-col gap-3">
      {thumbnail && (
        <div className="rounded-lg border border-line bg-ink p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">thumbnail.png</span>
            <a className={btn} href={`/api/thumbnail?id=${jobId}&download=1`}>Download</a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/thumbnail?id=${jobId}&r=${rev}`} alt="Generated thumbnail" className="w-full max-w-xl rounded-lg" />
        </div>
      )}
      {seo && (
        <>
          <h3 className="font-semibold">YouTube title & description</h3>
          {block("Titles (Bengali)", seo.titlesBn.join("\n"))}
          {block("Titles (English)", seo.titlesEn.join("\n"))}
          {block("Description (Bengali)", seo.descriptionBn)}
          {block("Description (English)", seo.descriptionEn)}
          {block("Hashtags", seo.hashtags.join(" "))}
          {block("Chapters (paste into the description)", chapters)}
          {!seo.chapters.length && <p className="text-xs text-muted">Not enough distinct topics for YouTube chapters (needs 3+ at least 10 s apart).</p>}
        </>
      )}
    </div>
  );
}
