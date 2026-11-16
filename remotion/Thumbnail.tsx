/** YouTube thumbnail (1280x720 still): a frame from the rendered video + bold Bengali headline + brand. */
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { BENGALI_FONT_STACK } from "./lib/kit";

export type ThumbProps = { frameSrc: string; headline: string; channelName: string; logoSrc?: string; primary: string; secondary: string };

export const Thumbnail: React.FC<ThumbProps> = ({ frameSrc, headline, channelName, logoSrc, primary, secondary }) => {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  return (
    <AbsoluteFill style={{ background: secondary }}>
      {frameSrc ? <Img src={staticFile(frameSrc)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", scale: "1.08", filter: "saturate(1.25) contrast(1.05)" }} /> : null}
      <AbsoluteFill style={{ background: `linear-gradient(100deg, ${secondary}F2 0%, ${secondary}B3 45%, transparent 85%)` }} />
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 70px", width: "72%" }}>
        <div lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 700, fontSize: words.length > 5 ? 96 : 118, lineHeight: 1.4, color: "#fff", textShadow: "0 6px 24px rgba(0,0,0,0.6)" }}>
          {words.map((w, i) => (
            <span key={i} style={{ display: "inline-block", marginRight: "0.26em", color: i === words.length - 1 ? primary : "#fff" }}>{w}</span>
          ))}
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 40, bottom: 30, display: "flex", alignItems: "center", gap: 16 }}>
        {logoSrc ? <Img src={staticFile(logoSrc)} style={{ height: 72, width: "auto", maxWidth: 240, objectFit: "contain" }} /> : null}
        {channelName ? (
          <span lang="bn" style={{ fontFamily: BENGALI_FONT_STACK, fontWeight: 700, fontSize: 38, lineHeight: 1.5, color: "#fff", background: primary, padding: "2px 22px", borderRadius: 999 }}>{channelName}</span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
