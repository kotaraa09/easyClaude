---
name: generate-asset
description: Generate images, video, audio, or 3D models for a project using an external AI provider. Use when a project needs a hero image, placeholder art, icon, texture, background, sound effect, music bed, short video clip, or 3D asset and no suitable file exists yet.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Generate an asset

Claude cannot draw, record, or model. This skill shells out to a provider that can.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/gen/generate.mjs --list
node ${CLAUDE_PLUGIN_ROOT}/scripts/gen/generate.mjs \
  --kind image --prompt "..." --out public/hero.webp
```

## Every call spends the user's money

**Confirm before generating.** Say what you're about to make, which model, and where it lands. Wait for a yes. This is not a step to be efficient about — an unwanted image is a real charge, and a video is a much larger one.

Run `--dry-run` first when the prompt is long or you're unsure of the flags. It's free and prints exactly what would be sent.

Never loop generations to "get a better one" without asking. Two attempts, then stop and ask.

## Before you generate anything

1. **Check whether the asset already exists.** Look in `design/brand/`, `public/`, `assets/`. Regenerating something already on disk is pure waste.
2. **Read `design/tokens.md`** if the project has one. Feed the palette and mood into the prompt so generated art matches the interface instead of fighting it.
3. **Check the reference index** at `design/refs/INDEX.md` for the intended visual direction.

## Writing the prompt

Describe the *subject*, the *style*, and the *composition* — and for anything that sits behind UI, say so, along with where text will sit.

Good: `muted slate-blue abstract gradient mesh, soft grain, dark, low contrast in the upper third where headline text sits, no subject matter, no text`

Bad: `a nice hero image`

Always add negative guidance for UI backgrounds: no text, no watermark, no busy focal point.

## Where files go

| Use | Path |
|---|---|
| Site/app imagery | `public/` or the framework's static dir |
| Brand marks | `design/brand/` |
| Textures, sprites, models | wherever the engine expects them |

Match the extension to the modality — the script infers output format from it. Prefer `.webp` for web imagery.

## What this is good and bad at

- **Good:** placeholders, backgrounds, textures, mood pieces, filler imagery, ambient audio, prototype 3D.
- **Weak:** final brand marks and logos. Raster generators produce something that *looks* like a logo but isn't clean, isn't vector, and won't scale. For real vector output use `--model recraft-ai/recraft-v3-svg`, and still expect to hand off to a designer.
- **Never:** anything depicting a real, identifiable person, or imitating an existing brand's identity.

## After generating

- The script appends to `docs/asset-log.md` automatically. Don't duplicate that by hand.
- **Check the file is actually usable** — open it, confirm dimensions and that it isn't broken. A 4 KB output usually means the generation failed upstream.
- **Watch the size.** Anything over ~500 KB going into git deserves a mention; suggest compression or an asset host instead.
- **Licensing varies by model** and by whether the output is used commercially. If this is going into something shipped, say so once and point the user at the model's page. Don't guess on their behalf.

## When the answer is not to generate

A solid color, a CSS gradient, or an existing icon set is often better than a generated image — faster, smaller, free, and more consistent. Say so when it's true.
