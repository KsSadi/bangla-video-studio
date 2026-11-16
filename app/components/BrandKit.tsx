"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BRAND, type BrandKit as Brand } from "@/lib/settings";
import { Collapsible, btn, field } from "./ui";

/** Persistent brand kit drawer (channel name, logo PNG, colours). Saved once, reused by every project. */
export function BrandKitDrawer({ onChange }: { onChange?: (b: Brand) => void }) {
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoRev, setLogoRev] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void fetch("/api/brand")
      .then((r) => r.json())
      .then((b: Brand) => {
        setBrand(b);
        onChange?.(b);
      })
      .catch(() => {});
  }, [onChange]);

  const save = async (removeLogo = false) => {
    const body = new FormData();
    body.append("channelName", brand.channelName);
    body.append("primary", brand.primary);
    body.append("secondary", brand.secondary);
    if (logo) body.append("logo", logo);
    if (removeLogo) body.append("removeLogo", "1");
    const res = await fetch("/api/brand", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(data.error ?? "Could not save.");
    setBrand(data);
    onChange?.(data);
    setLogo(null);
    setLogoRev((n) => n + 1);
    setMsg("Brand kit saved ✓");
    setTimeout(() => setMsg(""), 2500);
  };

  return (
    <Collapsible title="Brand Kit" badge={brand.channelName || (brand.hasLogo ? "logo set" : "empty")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-semibold">Channel name</span>
          <input lang="bn" value={brand.channelName} onChange={(e) => setBrand({ ...brand, channelName: e.target.value })} placeholder="আপনার চ্যানেলের নাম" className={field} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Primary colour</span>
          <input type="color" value={brand.primary} onChange={(e) => setBrand({ ...brand, primary: e.target.value })} className="h-9 w-full cursor-pointer rounded-lg border border-line bg-ink" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Secondary colour</span>
          <input type="color" value={brand.secondary} onChange={(e) => setBrand({ ...brand, secondary: e.target.value })} className="h-9 w-full cursor-pointer rounded-lg border border-line bg-ink" />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          {brand.hasLogo && !logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/brand?logo=1&r=${logoRev}`} alt="Current logo" className="h-12 w-auto max-w-32 rounded bg-ink object-contain p-1" />
          )}
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Logo (PNG)</span>
            <input type="file" accept="image/png" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} className="text-xs" />
          </label>
          {brand.hasLogo && (
            <button type="button" className={btn} onClick={() => void save(true)}>Remove logo</button>
          )}
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="button" className={btn} onClick={() => void save()}>Save Brand Kit</button>
          <span role="status" className="text-xs text-muted">{msg || "Saved on this machine and reused by every project."}</span>
        </div>
      </div>
    </Collapsible>
  );
}
