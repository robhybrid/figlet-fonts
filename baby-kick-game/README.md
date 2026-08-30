# Baby Boot — Stress Relief Game

A mobile-first browser game (and installable PWA). Cartoon babies bounce around the screen — swipe through them to boot them away and lower your stress meter.

## Play on mobile

### Option 1: Install as an app (PWA)

1. Serve the game over HTTPS or localhost (required for install):
   ```bash
   cd baby-kick-game
   python3 -m http.server 8080
   ```
2. Open the URL on your phone (same Wi‑Fi network, or deploy to GitHub Pages / Netlify).
3. **Android (Chrome):** Tap the install banner, or Menu → **Install app**.
4. **iPhone (Safari):** Tap **Share** → **Add to Home Screen**.

The game runs fullscreen, works offline after the first load, and keeps your screen awake while playing.

### Option 2: Open in browser

Visit the served URL and tap **Start Kicking**, then swipe with your finger.

## Desktop

Click and drag across babies to kick. Same game, mouse controls.

## Controls

| Platform | Action |
|----------|--------|
| **Phone / tablet** | Finger swipe through babies |
| **Desktop** | Click and drag |

## Goal

- Kick babies to earn points and build combos
- Each kick lowers your **Stress** meter
- Reach **0% stress** to enter Zen Mode

## Mobile features

- Touch-optimized swipe kicks with live trail feedback
- Haptic vibration on kicks (supported devices)
- Installable PWA with offline support
- Safe-area support for notched phones
- Landscape and portrait layouts
- Screen wake lock while playing

## Disclaimer

This is a satirical stress-relief game with cartoon characters. No babies were harmed in the making of this game.
