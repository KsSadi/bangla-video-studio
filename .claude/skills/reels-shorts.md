# Skill: Reels / Shorts / TikTok (9:16) layout

Used by the **Long-to-Shorts clipper**. A Short is made by *slicing the already-generated `scene-plan.json`* and the
voice audio to a time window and rendering the same composition at 1080x1920. No AI writes code or a new plan for it.
The studio reads the safe-zone numbers below at render time, so editing them here changes every future Short.

## Safe zones (fractions of the frame)

Platform UI (account name, caption, like/share buttons, search bar) covers the edges. Keep text and faces inside:

```json safe-zone
{ "top": 0.1, "bottom": 0.22, "left": 0.07, "right": 0.14 }
```

- **top 10%**: status bar and search icons. Only the optional hook title lives just inside this margin.
- **bottom 22%**: caption, channel name and music ticker. Subtitles sit directly above it.
- **right 14%**: like / comment / share column. Keep the right margin wider than the left.

## Layout rules

1. One idea per scene; at most two elements (title + one visual). Large type: titles >= 7% of the width.
2. The character stands centered above the subtitles; content sits above the character.
3. Captions: kinetic style, max two lines, always inside the safe zone.
4. Hook title (optional, Bengali, <= 8 words) shows for the first ~3 seconds at the top.
5. Keep the first scene visually busy within 0.5 s (scroll-stopping), then settle.
6. No outro card on Shorts (the studio disables it); a small corner logo moves to the top-left.
