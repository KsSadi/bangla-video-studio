import React from "react";
import { Composition } from "remotion";
import { GeneratedVideo } from "./generated/Video";
import { FPS, type VideoProps } from "./lib/types";

const defaultProps: VideoProps = {
  audioSrc: "",
  cues: [
    { start: 0.3, end: 3, text: "বাংলা ভিডিও স্টুডিওতে স্বাগতম" },
    { start: 3.2, end: 6, text: "আপনার ভয়েস থেকে ভিডিও তৈরি হবে" },
  ],
  durationSec: 6.5,
  width: 1920,
  height: 1080,
  character: "tech-mentor",
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={GeneratedVideo}
    fps={FPS}
    width={1920}
    height={1080}
    durationInFrames={FPS * 6}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      width: props.width,
      height: props.height,
      durationInFrames: Math.max(1, Math.ceil(props.durationSec * FPS)),
    })}
  />
);
