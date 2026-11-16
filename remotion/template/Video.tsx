/**
 * Baseline video. The backend copies this to remotion/generated/Video.tsx before each job,
 * then Claude replaces it with a custom design. It also works as-is (captions + presenter).
 *
 * CONTRACT (do not change): export `GeneratedVideo: React.FC<VideoProps>`.
 */
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { BrowserRecording, Captions, GradientBackground, KineticText, Presenter, VoiceAudio, activeCueIndex, fadeInOut, useTime } from "../lib/kit";
import type { VideoProps } from "../lib/types";

export const GeneratedVideo: React.FC<VideoProps> = ({ audioSrc, cues, character, recordingSrc, events }) => {
  const t = useTime();
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const i = activeCueIndex(cues, t);
  const cue = i >= 0 ? cues[i] : null;

  return (
    <AbsoluteFill>
      <GradientBackground />
      {audioSrc ? <VoiceAudio src={audioSrc} /> : null}

      {recordingSrc ? (
        <>
          <div style={{ position: "absolute", left: width * 0.04, right: width * 0.04, top: portrait ? height * 0.12 : height * 0.05 }}>
            <BrowserRecording src={recordingSrc} events={events} />
          </div>
          <Presenter character={character} cues={cues} size={height * (portrait ? 0.3 : 0.34)} style={{ position: "absolute", right: width * 0.02, bottom: 0 }} />
          <Captions cues={cues} bottom={height * 0.03} />
        </>
      ) : (
        <>
          {cue && (
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: width * 0.08, paddingBottom: character === "none" ? undefined : height * 0.4, opacity: fadeInOut(t, cue.start, cue.end, 0.2) }}>
              <KineticText
                key={i}
                text={cue.text}
                start={cue.start}
                stagger={Math.min(0.14, ((cue.end - cue.start) * 0.6) / Math.max(1, cue.text.split(/\s+/).length))}
                style={{ color: "#fff", fontSize: width * (portrait ? 0.075 : 0.05) }}
              />
            </AbsoluteFill>
          )}
          <Presenter character={character} cues={cues} size={height * (portrait ? 0.36 : 0.5)} style={{ position: "absolute", left: "50%", translate: "-50% 0", bottom: 0 }} />
        </>
      )}
    </AbsoluteFill>
  );
};
