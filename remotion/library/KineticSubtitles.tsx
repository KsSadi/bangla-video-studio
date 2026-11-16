/**
 * <KineticSubtitles/>: high-contrast Bengali captions (Hind Siliguri / Noto Sans Bengali) synced to the SRT cues.
 * mode "kinetic" pops words in and highlights the word being spoken; "classic" is a clean bar; "none" renders nothing.
 */
import React from "react";
import { StudioCaptions } from "../lib/kit";
import type { CaptionOpts, CaptionStyle, Cue, SafeZone } from "../lib/types";

export const KineticSubtitles: React.FC<{ cues: Cue[]; mode?: CaptionStyle; accent?: string; accent2?: string; safe?: SafeZone; opts?: CaptionOpts }> = ({ cues, mode = "kinetic", accent, accent2, safe, opts }) => <StudioCaptions cues={cues} style={mode} accent={accent} accent2={accent2} safe={safe} opts={opts} />;
