/**
 * Local FFmpeg audio: optional studio voice enhancer + built-in synthesized BGM beds and SFX.
 * No downloads, no licensed samples: everything is generated from math with ffmpeg's lavfi sources.
 */
import fs from "node:fs";
import path from "node:path";
import { ffmpeg } from "@/lib/exec";
import { log, publicDir, type Job } from "@/lib/store";
import type { BgmId } from "@/lib/settings";

/** Studio voice polish: rumble/hiss band-limit, FFT noise reduction, loudness leveling. */
export const VOICE_FILTER = "highpass=f=80,lowpass=f=12000,afftdn=nr=12:nf=-30,loudnorm=I=-16:TP=-1.5:LRA=11";

export async function enhanceVoice(job: Job): Promise<string> {
  const pub = publicDir(job.id);
  const out = "audio-enhanced.mp3";
  log(job, `Voice enhancer ON: ${VOICE_FILTER}`);
  await ffmpeg(job, ["-i", path.join(pub, job.audioFile), "-af", VOICE_FILTER, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "2", path.join(pub, out)], { timeoutMs: 30 * 60_000 });
  return out;
}

// Looping beds. Frequencies are integers and lengths whole multiples of the modulation periods, so the loop seam is silent.
const BGM: Record<Exclude<BgmId, "none">, { file: string; src: string; post: string }> = {
  // warm A-minor-ish pad with slow swell
  "soft-storytelling": {
    file: "bgm-soft-storytelling.mp3",
    src: "aevalsrc='(0.22*sin(2*PI*110*t)+0.16*sin(2*PI*165*t)+0.14*sin(2*PI*220*t)+0.10*sin(2*PI*262*t)+0.07*sin(2*PI*330*t))*(0.65+0.35*sin(2*PI*t/8))':s=44100:d=48",
    post: "lowpass=f=1800,volume=0.9",
  },
  // steady 120bpm bass pulse + bright plucked arpeggio
  "tech-explainer": {
    file: "bgm-tech-explainer.mp3",
    src: "aevalsrc='0.42*sin(2*PI*55*t)*exp(-5*mod(t,0.5))+0.16*sin(2*PI*(220*(1+0.25*floor(mod(t*4,4)))+0)*t)*exp(-9*mod(t,0.25))+0.05*sin(2*PI*440*t)*(0.6+0.4*sin(2*PI*t/4))':s=44100:d=48",
    post: "lowpass=f=5000,volume=0.9",
  },
};

const SFX: { file: string; src: string; post: string }[] = [
  { file: "sfx-whoosh.wav", src: "anoisesrc=d=0.7:c=pink:a=0.8:r=44100", post: "highpass=f=250,lowpass=f=3500,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.4,volume=2.2" },
  { file: "sfx-pop.wav", src: "aevalsrc='0.8*sin(2*PI*(520+1400*t)*t)*exp(-38*t)':s=44100:d=0.16", post: "volume=0.9" },
  { file: "sfx-chime.wav", src: "aevalsrc='0.45*(sin(2*PI*880*t)+0.5*sin(2*PI*1320*t)+0.25*sin(2*PI*1760*t))*exp(-3.2*t)':s=44100:d=1.6", post: "volume=0.9" },
];

const gen = (job: Job, dir: string, e: { file: string; src: string; post: string }, codec: string[]) =>
  ffmpeg(job, ["-f", "lavfi", "-i", e.src, "-af", e.post, "-ac", "2", ...codec, path.join(dir, e.file)], { quiet: true });

/** Synthesize the selected BGM bed into <public>/audio/. Returns the staticFile path. */
export async function ensureBgm(job: Job, id: Exclude<BgmId, "none">): Promise<string> {
  const dir = path.join(publicDir(job.id), "audio");
  fs.mkdirSync(dir, { recursive: true });
  const e = BGM[id];
  if (!fs.existsSync(path.join(dir, e.file))) {
    log(job, `Synthesizing built-in BGM: ${id}`);
    await gen(job, dir, e, ["-c:a", "libmp3lame", "-q:a", "4"]);
  }
  return `audio/${e.file}`;
}

export async function ensureSfx(job: Job) {
  const dir = path.join(publicDir(job.id), "audio");
  fs.mkdirSync(dir, { recursive: true });
  for (const e of SFX) if (!fs.existsSync(path.join(dir, e.file))) await gen(job, dir, e, ["-c:a", "pcm_s16le"]);
  log(job, "UI & transition SFX ready (whoosh, pop, chime).");
}
