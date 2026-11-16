/** Pre-built flat SVG illustrations (no network, no AI). Add new ones here and to ILLUSTRATIONS in engine/plan.ts. */
import React from "react";
import { ILLUSTRATIONS } from "../engine/plan";

export type IllustrationName = (typeof ILLUSTRATIONS)[number];

export const Illustration: React.FC<{ name: IllustrationName; size: number; accent?: string }> = ({ name, size, accent = "#FBBF24" }) => {
  const art: Record<IllustrationName, React.ReactNode> = {
    laptop: (
      <>
        <rect x="18" y="22" width="64" height="42" rx="4" fill="#1F2937" />
        <rect x="22" y="26" width="56" height="34" rx="2" fill="#E5E7EB" />
        <rect x="27" y="31" width="26" height="4" rx="2" fill={accent} />
        <rect x="27" y="39" width="46" height="3" rx="1.5" fill="#9CA3AF" />
        <rect x="27" y="46" width="36" height="3" rx="1.5" fill="#9CA3AF" />
        <path d="M8 68h84l-6 9H14z" fill="#374151" />
      </>
    ),
    phone: (
      <>
        <rect x="32" y="10" width="36" height="80" rx="7" fill="#111827" />
        <rect x="35" y="17" width="30" height="62" rx="2" fill="#E5E7EB" />
        <rect x="39" y="23" width="22" height="14" rx="3" fill={accent} />
        <rect x="39" y="42" width="22" height="3" rx="1.5" fill="#9CA3AF" />
        <rect x="39" y="49" width="16" height="3" rx="1.5" fill="#9CA3AF" />
        <circle cx="50" cy="84.5" r="2.5" fill="#4B5563" />
      </>
    ),
    idea: (
      <>
        <path d="M50 12a24 24 0 0 0-13 44c3 2 4 5 4 8h18c0-3 1-6 4-8a24 24 0 0 0-13-44z" fill={accent} />
        <rect x="41" y="68" width="18" height="6" rx="2" fill="#E5E7EB" />
        <rect x="43" y="77" width="14" height="5" rx="2" fill="#9CA3AF" />
        <path d="M50 2v6M20 14l4 4M80 14l-4 4M10 40h6M84 40h6" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      </>
    ),
    growth: (
      <>
        <rect x="14" y="60" width="14" height="26" rx="2" fill="#9CA3AF" />
        <rect x="34" y="46" width="14" height="40" rx="2" fill="#D1D5DB" />
        <rect x="54" y="32" width="14" height="54" rx="2" fill="#E5E7EB" />
        <rect x="74" y="18" width="14" height="68" rx="2" fill={accent} />
        <path d="M14 44 40 28l14 8 28-24" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M72 10h12v12" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    team: (
      <>
        <circle cx="26" cy="38" r="10" fill="#D1D5DB" />
        <path d="M8 78a18 18 0 0 1 36 0z" fill="#9CA3AF" />
        <circle cx="74" cy="38" r="10" fill="#D1D5DB" />
        <path d="M56 78a18 18 0 0 1 36 0z" fill="#9CA3AF" />
        <circle cx="50" cy="30" r="13" fill="#fff" />
        <path d="M27 84a23 23 0 0 1 46 0z" fill={accent} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      {art[name]}
    </svg>
  );
};
