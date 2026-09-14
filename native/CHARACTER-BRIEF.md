# Arete character & reward art — brief

Everything a generation tool needs, plus the constraints that make the result
drop into the app without rework.

---

## Tools

Which is best depends on one decision: **figures or marks.**

### If you want geometric marks (recommended for "modern, minimalistic")

| Tool | Why |
|---|---|
| **Recraft** | Outputs true SVG, not traced raster. Has style-set consistency so all six stages match. Built for icon systems, which is exactly what a 6-stage progression plus reward badges is. Best single choice. |
| **Figma** (+ plugins) | Where you finish and assemble regardless of what generated it. Export SVG directly. |
| **Illustrator + Firefly** | If you want precise manual control over the geometry. |

SVG matters more than it sounds: it scales to any size, it costs almost
nothing in bytes, and it can take its colour from the app's theme, which solves
the light-mode problem below for free.

### If you want figures (people, like the current ones but restyled)

| Tool | Why |
|---|---|
| **Midjourney** | Best raw quality. `--sref` locks a style across the whole set; `--cref` keeps a character consistent between stages. Raster only. |
| **Nano Banana / Gemini image** | Strongest at *editing* an existing image, so good for deriving a female variant from a male one and keeping them plainly the same style. |
| **Ideogram** | Clean flat-graphic look, and handles lettering if a badge needs a numeral. |

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
| **Format** | SVG preferred. Otherwise PNG **with a real alpha channel**. |
| **Transparency** | Mandatory — see below. |
| **Aspect** | 2:3 upright (the slots are 158x237 and 132x198). |
| **Source size** | 512 x 768 if raster. |
| **File size** | Under 40 KB each. The current ones are 160–330 KB. |
| **Count** | 6 stages. Twelve if you do male and female sets. |
| **Naming** | `avatar-1.svg` … `avatar-6.svg`, or `avatar-m-1` / `avatar-f-1` for two sets. |

### Why transparency is mandatory

The current files are RGB with **no alpha channel** and pure black baked into
the background. Arete has a light theme. Switch to it and every avatar becomes a
black rectangle on a cream page. Whatever replaces them has to be transparent or
that bug ships with the new art.

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
