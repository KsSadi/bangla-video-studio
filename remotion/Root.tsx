import React from "react";
import { Composition, Still } from "remotion";
import { Studio } from "./Studio";
import { Thumbnail, type ThumbProps } from "./Thumbnail";
import { FPS, totalSeconds, type VideoProps } from "./lib/types";

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
  captionStyle: "kinetic",
};

const thumbDefaults: ThumbProps = { frameSrc: "", headline: "বাংলা ভিডিও স্টুডিও", channelName: "", primary: "#F5A524", secondary: "#1E2A78" };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Main"
      component={Studio}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={FPS * 6}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const fps = props.fps ?? FPS;
        return { fps, width: props.width, height: props.height, durationInFrames: Math.max(1, Math.ceil(totalSeconds(props) * fps)) };
      }}
    />
    <Still id="Thumbnail" component={Thumbnail} width={1280} height={720} defaultProps={thumbDefaults} />
  </>
);
