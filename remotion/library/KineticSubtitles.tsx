/**
 * <KineticSubtitles/>: high-contrast Bengali captions (Hind Siliguri / Noto Sans Bengali) synced to the SRT cues.
 * mode "kinetic" pops words in and highlights the word being spoken; "classic" is a clean bar; "none" renders nothing.
 */
import React from "react";
import { StudioCaptions } from "../lib/kit";
import type { CaptionStyle, Cue } from "../lib/types";

export const KineticSubtitles: React.FC<{ cues: Cue[]; mode?: CaptionStyle; accent?: string }> = ({ cues, mode = "kinetic", accent }) => <StudioCaptions cues={cues} style={mode} accent={accent} />;
