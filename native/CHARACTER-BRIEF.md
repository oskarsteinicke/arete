# Arete character & reward art — brief

Everything a generation tool needs, plus the constraints that make the result
drop into the app without rework.

---

## Tools

The set is twelve figures that must look like one family, so the thing that
matters most is **holding a style across generations**, not raw image quality.

| Tool | Why |
|---|---|
| **Midjourney** | Best for this. `--sref` locks a style across the whole set and `--cref` keeps the same character between stages, which is the hard part. Raster only, which is fine for figures. |
| **Nano Banana / Gemini image** | Strongest at *editing* an existing image. Use it to derive stage N+1 from stage N, and the female set from the male set, so they match by construction rather than by luck. |
| **Recraft** | Worth a look if you want the figures as true vector. Weaker at characters than at icons, but the output scales and weighs nothing. |
| **Figma** | Where you finish, crop to 2:3, and export at the right size regardless of what generated the art. |

A realistic workflow: Midjourney for stage 1 until the style is right, then an
editing model to walk it through the remaining stages and across to the female
set.

---

## The prompt

Adjust the bracketed parts per stage. Keep everything else identical across all
six so the set matches.

```
A minimalist geometric emblem representing [STAGE DESCRIPTION], for a premium
dark-mode fitness and self-improvement app.

Style: modern, reductive, flat vector. Thin precise strokes, generous negative
space, perfect symmetry. No illustration, no rendering, no texture, no gradient
mesh, no drop shadows. Think contemporary icon design and Swiss graphic design,
not classical or ornamental.

Colour: a single warm gold (#b8874a through #e3b878) on transparent background.
No other hues. Nothing white, nothing grey.

Composition: centred, upright, contained within a square safe area with generous
margin. Must remain legible at 48 pixels.

Explicitly avoid: laurel wreaths, togas, columns, marble, meander/key patterns,
helmets, shields, faces, anime styling, 3D, photorealism, drop shadow, outer
glow, background fill of any kind.
```

### Stage descriptions

The progression should read as **accumulating structure**, not as a bigger
version of the same thing. Each stage adds one idea:

| Stage | Title | Idea to encode |
|---|---|---|
| 1 | Neophyte | A single element. Bare, unfinished, quiet. |
| 2 | Ephebos | The first addition — an axis or division. |
| 3 | Hoplite | Structure appears. Symmetry becomes deliberate. |
| 4 | Strategos | An enclosing form. Something is now complete. |
| 5 | Philosophos | Interior detail. Density at the centre. |
| 6 | Arete | Full resolution, plus one element nothing else has. |

### If you go with figures instead

Replace the first paragraph with:

```
A minimalist geometric human figure, standing, front-facing, representing
[STAGE DESCRIPTION]. The body reduced to clean geometric shapes — no facial
features, no clothing detail, no hair rendering. Androgynous proportions.
```

And produce **two sets**, one with broader shoulders and one with a narrower
waist and fuller hip line, rather than relying on clothing or hair to signal it.
Keep every other parameter identical between the two sets.

---

## Technical requirements

These are what make it drop straight in.

| | |
|---|---|
| **Format** | PNG on solid black, same as the current set. No transparency needed. |
| **Aspect** | 2:3 upright (the slots are 158x237 and 132x198). |
| **Source size** | 512 x 768 if raster. |
| **File size** | Under 40 KB each. The current ones are 160–330 KB. |
| **Count** | 6 stages. Twelve if you do male and female sets. |
| **Naming** | `avatar-1.svg` … `avatar-6.svg`, or `avatar-m-1` / `avatar-f-1` for two sets. |

### Why black backgrounds are fine

`.avatar-frame` in style.css sets a hardcoded dark radial gradient and is never
overridden for the light theme, so an avatar sits on a dark card whichever theme
is active. Black behind the figure reads as a portrait vignette, not a bug.

If a transparent version is ever wanted, the black can be removed here with a
border flood fill, which keeps the dark hair, belts and outlines the figures
contain. Keying every dark pixel would punch holes through them.

### Reward and badge marks

Same prompt, same palette, same constraints — just swap the stage description
for what the reward is. Keeping one geometric vocabulary across the character,
the app icon and the reward badges is what will make it feel designed rather
than assembled.

---

## What I do when the art arrives

- Wire a male/female set with a picker, defaulting from the profile you already
  collect, with an explicit override — nobody should be assigned an avatar by a
  field they filled in for calorie maths.
- Swap PNG for SVG where possible and drop the files from the service worker
  precache. That removes roughly 1.3 MB from what every visitor downloads.
- Keep the level-up reveal and the breathing animation on the home portrait.
- Check every stage against both themes before it ships.

Send the files and I will do the rest.
