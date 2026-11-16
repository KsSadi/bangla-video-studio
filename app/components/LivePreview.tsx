"use client";

import { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { Loader2 } from "lucide-react";
import { Studio } from "@/remotion/Studio";
import { totalSeconds, type VideoProps } from "@/remotion/lib/types";

const PREVIEW_FPS = 30;

/**
 * Instant in-browser preview: the real "Main" composition inside @remotion/player, fed with the same props the MP4
 * render uses. `staticFile()` is pointed at /api/pub/<job>/ so audio, fonts and B-roll resolve to the project's files.
 * No render, no tokens: it plays as soon as scene-plan.json exists and reloads whenever the plan is revised.
 */
export default function LivePreview({ jobId, rev }: { jobId: string; rev: number }) {
  const [props, setProps] = useState<VideoProps | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (window as unknown as { remotion_staticBase?: string }).remotion_staticBase = `/api/pub/${jobId}`;
    setError("");
    void fetch(`/api/preview?id=${jobId}&r=${rev}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as VideoProps) : Promise.reject(new Error("No scene plan yet."))))
      .then((p) => alive && setProps(p))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [jobId, rev]);

  const view = useMemo(() => {
    if (!props) return null;
    const portrait = props.height > props.width;
    const width = portrait ? 1080 : 1920;
    const height = portrait ? 1920 : 1080;
    const inputProps: VideoProps = { ...props, width, height, fps: PREVIEW_FPS };
    return { inputProps, width, height, frames: Math.max(1, Math.ceil(totalSeconds(props) * PREVIEW_FPS)) };
  }, [props]);

  if (error) return <div className="grid size-full place-items-center p-4 text-center text-xs text-white/70">{error}</div>;
  if (!view) return <div className="grid size-full place-items-center text-white/70"><Loader2 className="size-6 animate-spin" /></div>;
  return (
    <Player
      key={`${jobId}-${rev}`}
      component={Studio}
      inputProps={view.inputProps}
      durationInFrames={view.frames}
      fps={PREVIEW_FPS}
      compositionWidth={view.width}
      compositionHeight={view.height}
      controls
      loop
      clickToPlay
      doubleClickToFullscreen
      acknowledgeRemotionLicense
      style={{ width: "100%", height: "100%", background: "#000" }}
    />
  );
}
