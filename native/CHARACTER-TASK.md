# Task: produce a 6-stage character progression set

Paste this whole file as the task. Everything needed is here; nothing has to be
filled in.

## Objective

Produce **six emblem images** forming a visual progression for Arete, a dark-mode
fitness and self-improvement app. They represent a user's level, stage 1 being a
beginner and stage 6 being fully progressed.

## Deliverables

Six files, named exactly:

```
avatar-1.svg  avatar-2.svg  avatar-3.svg
avatar-4.svg  avatar-5.svg  avatar-6.svg
```

SVG is strongly preferred. **If you cannot produce SVG, produce PNG at
512 x 768 with a real alpha channel** and name them `avatar-1.png` … `avatar-6.png`.

## Acceptance criteria

Check each before delivering. These are pass/fail, not preferences.

1. **Background is transparent.** No filled rectangle, no black, no white. If
   PNG, it must have an alpha channel — an RGB file with black behind the
   subject fails. The app has a light theme and a baked background renders as a
   black box on a cream page.
2. **Exactly one colour is used**, a warm gold anywhere in `#b8874a` to
   `#e3b878`. No white, no grey, no second hue.
3. **Aspect is 2:3 upright**, and the subject is centred with margin on all
   sides.
4. **Each file is under 40 KB.**
5. **Legible at 48 pixels.** Shrink it and check. If the detail turns to mush at
   that size, simplify it.
6. **The six read as one set.** Same stroke weights, same construction logic,
   same optical weight. Someone seeing them side by side should not be able to
   tell they were made separately.
7. **Progression is visible in order.** Shown shuffled, someone should be able
   to sort them 1 to 6 without being told the rule.

## Shared style

Apply to all six, identically:

> Minimalist geometric emblem. Modern, reductive, flat vector. Thin precise
> strokes, generous negative space, perfect symmetry. Contemporary icon design
> and Swiss graphic design sensibility.
>
> No illustration, no shading, no texture, no gradient, no drop shadow, no outer
> glow, no 3D, no photorealism, no background fill.
>
> Explicitly avoid: laurel wreaths, togas, columns, marble, Greek key or meander
> patterns, helmets, shields, faces, anime styling.

## The six stages

Each adds **one new idea** to the one before. It is not the same shape getting
larger or brighter.

**avatar-1 — Neophyte.** A single bare element. One clean circle, thin stroke,
nothing inside it. Quiet and unfinished. The lightest optical weight of the set.

**avatar-2 — Ephebos.** The circle from stage 1, plus a single vertical axis
line through its centre. The first act of structure. Nothing else.

**avatar-3 — Hoplite.** Stage 2, plus two diagonals crossing the centre,
creating deliberate radial symmetry. The form now has architecture.

**avatar-4 — Strategos.** Stage 3, plus a second concentric circle inside the
first. Something is now enclosed and complete. Slightly heavier strokes.

**avatar-5 — Philosophos.** Stage 4, plus an interior diamond or rosette at the
centre, giving the form density where it was empty. The eye now has somewhere to
rest.

**avatar-6 — Arete.** Stage 5, fully resolved, plus one element nothing else in
the set has — a solid filled point at the exact centre, and a wide outer ring
set apart from the rest. It should be immediately obvious this is the final one.

## Notes

- If your tool cannot hold consistency across six separate generations, build
  stage 1 first and construct each subsequent stage by **adding to the previous
  file** rather than regenerating from scratch. Consistency matters more than
  any individual image.
- Deliver the source file if there is one, not only a flattened export.
