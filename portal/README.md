# PORTAL

Browser arcade for this figlet font collection.

## Run

From the **repository root** (not this folder):

```bash
npm run portal
```

Open [http://localhost:4173/portal/](http://localhost:4173/portal/).

Serving from the repo root matters so font files resolve as `../Doom.flf` and friends.

## Contents

| Route | What |
| --- | --- |
| `#/` | Hub — hero + cabinets |
| `#/play/snake` | Neon Serpent |
| `#/play/breakout` | Brick Signal |
| `#/play/memory` | Glyph Match |
| `#/fonts` | Live figlet preview |

High scores are stored in `localStorage` on the device.
