/** Persistent brand kit shared by all projects: data/brand/brand.json + data/brand/logo.png. */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_BRAND, isHexColor, type BrandKit } from "@/lib/settings";
import { DATA_DIR } from "@/lib/store";

const dir = path.join(DATA_DIR, "brand");
export const brandLogoPath = () => path.join(dir, "logo.png");

export function loadBrand(): BrandKit {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dir, "brand.json"), "utf8"));
    return {
      channelName: typeof d.channelName === "string" ? d.channelName.slice(0, 80) : "",
      primary: isHexColor(d.primary) ? d.primary : DEFAULT_BRAND.primary,
      secondary: isHexColor(d.secondary) ? d.secondary : DEFAULT_BRAND.secondary,
      hasLogo: fs.existsSync(brandLogoPath()),
    };
  } catch {
    return { ...DEFAULT_BRAND, hasLogo: fs.existsSync(brandLogoPath()) };
  }
}

export function saveBrand(b: { channelName: string; primary: string; secondary: string }, logo?: Buffer | "remove") {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "brand.json"), JSON.stringify({ channelName: b.channelName, primary: b.primary, secondary: b.secondary }, null, 2));
  if (logo === "remove") fs.rmSync(brandLogoPath(), { force: true });
  else if (logo) fs.writeFileSync(brandLogoPath(), logo);
}
