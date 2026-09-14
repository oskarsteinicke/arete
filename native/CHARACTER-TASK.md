# Task: a 6-stage character progression, male and female

Paste this whole file as the task. Everything needed is here; nothing has to be
filled in.

## Objective

Produce **twelve character illustrations** — a six-stage progression, in a male
and a female version — for Arete, a dark-mode fitness and self-improvement app.
They are the player character: stage 1 is a beginner, stage 6 is fully realised.

These replace an existing set that was drawn as detailed anime-style figures in
ancient Greek costume: chitons, sandals, laurel crowns, gold meander trim. Keep
the idea of a figure growing into their potential. Drop the costume drama and
the rendering.

## Deliverables

Twelve files, named exactly:

```
avatar-m-1.png  avatar-m-2.png  avatar-m-3.png  avatar-m-4.png  avatar-m-5.png  avatar-m-6.png
avatar-f-1.png  avatar-f-2.png  avatar-f-3.png  avatar-f-4.png  avatar-f-5.png  avatar-f-6.png
```

512 x 768 PNG, **with a real alpha channel**. Deliver layered or vector source
files as well if the tool produces them.

## Acceptance criteria

Pass/fail, not preferences. Check each before delivering.

1. **Background is transparent.** No filled rectangle, no black, no white, no
   scene, no ground shadow. An RGB file with black behind the figure fails. The
   app has a light theme, and a baked background renders as a black box on a
   cream page. This is the single most common way this task is failed.
2. **Full body, standing, front-facing, upright.** Head near the top of the
   frame, feet near the bottom, centred, with margin on all sides.
3. **Legible at 132 pixels tall.** That is the real display size. Shrink it and
   check the silhouette still reads.
4. **The twelve read as one set.** Same line weight, same proportions, same
   level of detail, same lighting logic. Male and female versions of the same
   stage should differ only in build.
5. **Progression is visible in order.** Shown shuffled, someone should be able
   to sort them 1 to 6 without being told the rule.
6. **Each file under 80 KB.**

## Style

Apply to all twelve, identically:

> Modern minimalist character illustration. Flat vector style with clean shapes
> and at most two tones per surface. Confident simple silhouette. Restrained,
> elegant, premium.
>
> Face is minimal: no drawn eyes, nose or mouth, or at most the barest
> suggestion. The character is defined by posture and silhouette, not
> expression.
>
> Palette is tightly limited: warm neutral stone tones for the figure and
> garment, with a single warm gold (#b8874a to #e3b878) as the only accent.
> Nothing bright, nothing saturated, no second accent colour.
>
> No cel shading, no anime or manga styling, no rendered highlights, no
> gradients, no texture, no outlines thicker than the design language, no
> background, no ground shadow, no props held in hand.
>
> Explicitly avoid: laurel wreaths, togas, chitons, sandals with straps, Greek
> key or meander patterns, columns, marble, helmets, shields, weapons, armour
> plating, wings, capes with fabric folds rendered in detail.

**Reference points for the feel:** the figures in *Sky: Children of the Light*,
the characters in *Monument Valley*, the silhouettes in *Alto's Odyssey*.
Minimal, graceful, atmospheric. Not flat-illustration corporate mascots, and not
rendered game art.

## The six stages

Progression is shown through **silhouette and light**, not through adding
ornament. Each stage changes the shape the figure cuts, and how much gold it
carries. Nothing is ever added that would clutter the outline.

**Stage 1 — Neophyte.** Plainest form. Simple sleeveless tunic to mid-thigh, in
neutral stone. Bare feet or the simplest possible footwear. Posture is relaxed,
slightly closed, arms at sides. No gold at all.

**Stage 2 — Ephebos.** Same simple garment, but the posture opens: shoulders
back, stance a little wider, weight settled. A single thin gold band at the
waist. That band is the only gold.

**Stage 3 — Hoplite.** The build is visibly stronger. Garment gains a clean
diagonal sash across the torso. Gold at the waist and on the sash edge. Stance
is grounded and square.

**Stage 4 — Strategos.** A long mantle falls from one shoulder, changing the
silhouette from a simple column to something wider and more deliberate. Rendered
as a flat shape, not as folded fabric. Gold along its edge.

**Stage 5 — Philosophos.** The mantle becomes a full cloak reaching near the
ankles. The silhouette is now the widest and most distinctive of the set.
Garment is lighter in tone than earlier stages. Gold at the collar, waist and
hem.

**Stage 6 — Arete.** Fully resolved. Floor-length robe and cloak, the most
striking silhouette. The garment is nearly luminous — the lightest tone in the
set. Gold throughout the edges. A soft halo of light behind the head and
shoulders, drawn as simple flat shapes, not as a glow effect. Stance is open and
still.

## Male and female

Produce both sets with **identical** style, palette, garment design, stage
progression and posture. They differ only in build:

- **Male:** broader shoulders, straighter waist, squarer jaw line in the head
  shape.
- **Female:** narrower shoulders, defined waist, fuller hip line, slightly
  softer head shape. Garment lengths and shapes stay the same.

Do not signal gender through hair styling, colour, jewellery, chest emphasis or
pose. Build and proportion only. Both sets should look equally strong.

## Notes

- Consistency across the twelve matters more than any single image being
  beautiful. If the tool cannot hold a style across separate generations, make
  stage 1 first, then derive each following stage by editing the previous file
  rather than starting over.
- Start with the male set, get all six right, then produce the female set from
  those so they match by construction.
